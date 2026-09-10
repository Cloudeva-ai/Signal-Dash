// Movement, endless generation, scoring and run-ending checks.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scope = {
  window: { devicePixelRatio: 1, addEventListener() {} },
  performance: { now: () => 100 },
  requestAnimationFrame() {},
};
vm.createContext(scope);
for (const name of ['story', 'levels', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', `${name}.js`), 'utf8'), scope);
}

let shownStory;
const ui = {
  levelName: {}, signalCount: {}, trustScore: {}, lifeCount: {},
  showStory(story) { shownStory = story; },
};
const newGame = () => {
  const game = new scope.window.CloudQuestGame({ width: 960, getContext: () => ({}) }, ui);
  game.render = () => {};
  return game;
};

const POSES = ['idle', 'run', 'jump', 'victory'];
const sprites = Object.fromEntries(POSES.map(p => [p, { pose: p, complete: true, naturalWidth: 100 }]));

const world = scope.window.RCQ_WORLD;
const zones = scope.window.RCQ_ZONES;
const FLOOR_Y = world.groundY - 58;

// --- movement -------------------------------------------------------------
let game = newGame();
game.heroSprites[game.zone.id] = sprites;

assert.equal(game.getHeroSprite().pose, 'idle');
game.startLevel();
game.loop(99);
assert.equal(game.player.grounded, true, 'early frame must preserve grounded state');
assert.equal(game.player.y, FLOOR_Y, 'the run must start standing on the ground line');

for (let i = 0; i < 1800; i++) game.update(1 / 60);
assert.equal(game.lives, 3, 'idle spawn must not lose lives for 30 seconds');
assert.equal(game.player.y, FLOOR_Y, 'idling must not sink through the floor');

game.pause();
game.pause();
game.loop(98);
assert.equal(game.player.y, FLOOR_Y, 'resume must not push the player through the floor');
assert.equal(game.player.grounded, true);

game.setKey('right', true);
game.update(1 / 60);
assert.equal(game.getHeroSprite().pose, 'run');
game.setKey('right', false);

game.setKey('jump', true);
game.update(1 / 60);
assert.equal(game.getHeroSprite().pose, 'jump');
game.setKey('jump', false);
for (let i = 0; i < 90; i++) game.update(1 / 60);
assert.equal(game.getHeroSprite().pose, 'idle');
assert.equal(game.player.grounded, true);

game.setKey('left', true);
game.update(1 / 60);
assert.equal(game.getHeroSprite().pose, 'run');
assert.equal(game.player.facing, -1);
game.setKey('left', false);
console.log('PASS: idle, left/right movement, jump, landing and startup timing');

// --- endless world --------------------------------------------------------
game = newGame();
game.startLevel();
const startChunks = game.chunks.length;
assert.ok(startChunks >= 3, 'the opening screen must already have world built ahead');

// Run right for a long time and confirm the world keeps extending and culling
// instead of growing without bound or running out of ground.
//
// Drive the run with a minimal competent player rather than a held Jump key.
// Bunny-hopping lands on a fixed 189px cadence and eventually touches down
// inside a pit through sheer bad timing, which says nothing about the terrain.
// A real player jumps at the ledge, so the autopilot does the same: run right,
// and jump only when the surface underfoot is about to run out.
//
// Hazards are excluded here. Taking a hazard hit is gameplay -- they are meant
// to need timing -- whereas falling through the floor means the generator
// produced terrain that cannot be crossed. Lives are topped back up so one
// hazard cannot cut the traversal short, and falls are counted instead.
let falls = 0;
const realDamage = game.damage.bind(game);
game.damage = (text) => {
  if (text.includes('fell')) falls += 1;
  realDamage(text);
  game.lives = 3;
  game.gameOver = false;
  game.paused = false;
  game.storyOpen = false;
};

const LEDGE_MARGIN = 24; // ~6 frames of run-up, still clearing a 150px pit
const surfaceUnderFoot = () => {
  const p = game.player;
  const foot = p.y + p.h;
  return game.platforms.find(
    (b) => p.x + p.w > b.x && p.x < b.x + b.w && Math.abs(b.y - foot) < 2,
  );
};
const autopilot = () => {
  const p = game.player;
  if (!p.grounded) return game.setKey('jump', false);
  const surface = surfaceUnderFoot();
  if (!surface) return game.setKey('jump', false);
  const runwayLeft = surface.x + surface.w - (p.x + p.w);
  game.setKey('jump', runwayLeft <= LEDGE_MARGIN);
};

game.setKey('right', true);
let maxChunks = 0;
let furthest = 0;
for (let i = 0; i < 6000; i++) {
  autopilot();
  game.update(1 / 60);
  maxChunks = Math.max(maxChunks, game.chunks.length);
  furthest = Math.max(furthest, game.player.x);
  assert.ok(game.platforms.length > 0, 'the world must never be empty mid-run');
  assert.equal(falls, 0, `a competent player fell through the world at x=${Math.round(furthest)}`);
}
game.setKey('right', false);
game.setKey('jump', false);
game.damage = realDamage;
assert.ok(game.player.x > 20000, `expected a long run, got x=${Math.round(game.player.x)}`);
assert.ok(maxChunks < 12, `chunk list must stay bounded, peaked at ${maxChunks}`);
assert.ok(game.spawnedChunks > 20, 'chunks must keep spawning as the run advances');
console.log(
  `PASS: endless world traversed to x=${Math.round(game.player.x)} across ` +
    `${game.spawnedChunks} chunks with at most ${maxChunks} alive at once`,
);

// Backing up must stay inside the world that still exists.
const before = game.player.x;
game.setKey('left', true);
for (let i = 0; i < 600; i++) game.update(1 / 60);
game.setKey('left', false);
assert.ok(game.player.x < before, 'left must actually move the player back');
assert.ok(game.player.x >= game.worldMinX, 'backing up must not leave the generated world');
assert.equal(game.player.grounded, true, 'backing up must land on real ground');
console.log('PASS: backtracking stays on generated ground');

// --- scoring and zones ----------------------------------------------------
game = newGame();
game.startLevel();
assert.equal(game.trust, 0);
assert.equal(game.zoneIndex, 0);

// Coins are the only score source, so the target is exactly 100 of them.
// Walking the world for real would take minutes of simulated time, so this
// takes coins directly and scrolls the camera on when a window runs dry --
// which also proves the generator keeps producing coins indefinitely.
const collect = (n) => {
  for (let i = 0; i < n; i++) {
    let coin = game.collectibles.find(c => !c.taken);
    let scrolls = 0;
    while (!coin && scrolls < 200) {
      game.cameraX += world.chunkWidth;
      game.ensureWorld();
      coin = game.collectibles.find(c => !c.taken);
      scrolls += 1;
    }
    assert.ok(coin, 'the generator must keep producing coins as the run advances');
    // Same sequence checkCollectibles runs on a real pickup.
    coin.taken = true;
    game.coins += 1;
    game.trust += world.coinValue;
    game.checkZone();
    game.checkExtraLife();
    game.checkFinish();
    if (game.finished) return;
  }
};

collect(1);
assert.equal(game.trust, 10, 'one coin must be worth exactly the coin value');
assert.equal(game.lives, 3, 'no bonus life before the first threshold');

// A 1-up every 200 points, capped, is what makes a multi-minute run finishable.
const BONUS = scope.window.CloudQuestGame.LIFE_BONUS_EVERY;
const CAP = scope.window.CloudQuestGame.MAX_LIVES;
collect(BONUS / world.coinValue - 1);
assert.equal(game.trust, BONUS);
assert.equal(game.lives, 4, `crossing ${BONUS} points must award a life`);

collect((zones[1].from - BONUS) / world.coinValue);
assert.equal(game.trust, zones[1].from);
assert.equal(game.zoneIndex, 1, 'crossing the second threshold must switch zone');
assert.equal(game.zone.id, 'cost');

// Chunks spawned during the previous zone must be re-labelled, or the new zone
// opens with the old zone's wording on screen.
//
// Note these compare lengths, not arrays: game state is built inside the vm
// realm, so its arrays have a different Array.prototype and deepStrictEqual
// rejects them against a local [] even when both are empty.
const strayLabels = () => game.collectibles
  .filter(c => !c.taken && !game.zone.coinLabels.includes(c.label))
  .map(c => c.label);
assert.equal(strayLabels().length, 0, `live coins carry stale labels: ${strayLabels().join(', ')}`);
const strayTypes = game.hazards.filter(h => h.type !== game.zone.hazardType).map(h => h.type);
assert.equal(strayTypes.length, 0, `live hazards carry stale types: ${strayTypes.join(', ')}`);

collect((zones[2].from - zones[1].from) / world.coinValue);
assert.equal(game.zoneIndex, 2, 'crossing the third threshold must switch zone');
assert.equal(game.zone.id, 'risk');
assert.equal(
  strayLabels().length, 0,
  `the risk zone opened with stale coins: ${strayLabels().join(', ')}`,
);

collect((world.target - zones[2].from) / world.coinValue);
assert.equal(game.trust, world.target, 'the run must land exactly on the target');
assert.equal(game.finished, true, 'reaching the target must finish the run');
assert.equal(game.coins, world.target / world.coinValue, 'the target must be exactly 100 coins');
assert.equal(game.lives, CAP, `bonus lives must stop at the ${CAP}-life cap`);
assert.equal(shownStory.actionHref, 'https://cloudeva.ai/');
assert.equal(shownStory.action, 'Explore CloudEVA');
assert.ok(shownStory.body.includes('1000'), 'the ending must report the final score');
assert.ok(!shownStory.body.includes('{score}'), 'the score placeholder must be filled in');
assert.equal(game.paused, true);
assert.equal(game.storyOpen, true);
assert.equal(game.player.victory, true);
console.log(`PASS: coins-only scoring reaches ${world.target} in exactly ${game.coins} coins, rotating all 3 zones`);
console.log(`PASS: a 1-up every ${BONUS} points, capped at ${CAP} lives`);

// Further overlap must not push the score past the target.
game.checkCollectibles();
assert.equal(game.trust, world.target, 'score must not climb after the run is finished');

// --- lives and game over --------------------------------------------------
game = newGame();
game.startLevel();
game.damage('one');
assert.equal(game.lives, 2);
assert.equal(game.gameOver, false);
assert.equal(game.player.grounded, true, 'a respawn must place the player on solid footing');
assert.ok(game.player.y === FLOOR_Y, 'a respawn must stand on the ground line');

game.damage('two');
assert.equal(game.lives, 1);
assert.equal(game.gameOver, false);

game.damage('three');
assert.equal(game.lives, 0);
assert.equal(game.gameOver, true, 'the third hit must end the run');
assert.equal(game.paused, true);
assert.equal(game.storyOpen, true);
assert.equal(shownStory.action, 'Run again');
assert.ok(!shownStory.body.includes('{score}'), 'game over must fill in the score');
assert.ok(!shownStory.body.includes('{coins}'), 'game over must fill in the coin count');
assert.ok(!shownStory.actionHref, 'game over must offer a retry, not the CTA');

// A finished run must not keep taking damage.
game.damage('four');
assert.equal(game.lives, 0, 'damage after game over must not push lives negative');
console.log('PASS: 3 lives with safe respawns, then a game over that offers a retry');

// Restart must fully reset a finished run.
game.restart();
assert.equal(game.trust, 0);
assert.equal(game.coins, 0);
assert.equal(game.lives, 3);
assert.equal(game.zoneIndex, 0);
assert.equal(game.gameOver, false);
assert.equal(game.finished, false);
assert.equal(game.player.x, 64);
assert.ok(game.chunks.length >= 3, 'restart must rebuild the world');
console.log('PASS: restart resets score, lives, zone and world');
