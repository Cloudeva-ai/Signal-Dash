// Guards the endless-runner generator.
//
// The whole point of procedural chunks is that nobody hand-checks the geometry,
// so this asserts the invariants that keep a run completable:
//   - chunks join on flat ground, so any template can follow any other
//   - every gap between landable surfaces is inside Eva's jump arc
//   - every coin rests on a real surface and every hazard on real ground
//   - every raised block can actually be reached from something below it
//
// Reach numbers are derived from the movement constants, not hardcoded, so
// retuning jump/gravity/speed in game.js re-checks the whole world.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scope = { window: {} };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8'), scope);

const game = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const constant = (name) => {
  const found = game.match(new RegExp(`const ${name} = (\\d+)`));
  assert.ok(found, `game.js must define a numeric ${name} constant`);
  return Number(found[1]);
};

const JUMP = constant('jump');
const GRAVITY = constant('gravity');
const SPEED = constant('speed');
const PLAYER_H = Number(game.match(/\n      h: (\d+),/)[1]);

const REACH_UP = (JUMP * JUMP) / (2 * GRAVITY); // apex height
const REACH_ACROSS = SPEED * ((2 * JUMP) / GRAVITY); // full-airtime distance
// Land short of the theoretical maximum so a run never needs a pixel-perfect
// jump, and so the arc still clears when a player jumps slightly late.
const MAX_GAP = REACH_ACROSS * 0.8;
// Standing on a surface, the player's feet rise exactly REACH_UP. A block is
// therefore landable if it sits no more than that above the surface below it;
// hold back a few pixels so landing never depends on a single frame.
const MAX_STEP = REACH_UP - 6;
const BLOCK_H = 30;
// A head-bonk zeroes upward velocity, and the player then falls ~75px forward
// while dropping back to the ground line. 200px keeps that landing well clear
// of any pit edge.
const PIT_CLEARANCE = 200;
const PLAYER_W = Number(game.match(/\n      w: (\d+),/)[1]);

// Read the obstacle kinds off game.js rather than listing them here, so a kind
// added to the engine without a rule in this file is caught as unknown.
const HAZARD_KINDS = new Set(
  (game.match(/const HAZARD_HIT = \{([\s\S]*?)\n\};/)[1].match(/^\s*(\w+):/gm) || []).map((line) =>
    line.trim().replace(':', ''),
  ),
);
assert.ok(HAZARD_KINDS.size > 0, 'game.js must define at least one obstacle kind');

// Where a player ends up after walking off a platform edge at `edgeX` whose top
// is at `topY`. They keep full horizontal speed and cannot jump on the way
// down, so this band is committed ground.
// The span of takeoff positions from which a single jump clears a ground
// hazard: late enough that the player is already above it on the way up, early
// enough that they have not started descending into it.
function takeoffWindow(hazard) {
  const top = hazard.y;
  const a = GRAVITY / 2;
  const disc = Math.sqrt(JUMP * JUMP - 4 * a * (world.groundY - top));
  const rising = (JUMP - disc) / (2 * a);
  const falling = (JUMP + disc) / (2 * a);
  return [
    Math.round(hazard.x + hazard.w - SPEED * falling),
    Math.round(hazard.x - PLAYER_W - SPEED * rising),
  ];
}

function landingBand(edgeX, topY) {
  const fall = Math.sqrt((2 * (world.groundY - topY)) / GRAVITY);
  const dx = SPEED * fall;
  return [Math.round(edgeX + dx - PLAYER_W), Math.round(edgeX + dx + PLAYER_W)];
}

const world = scope.window.RCQ_WORLD;
const zones = scope.window.RCQ_ZONES;
const chunks = scope.window.RCQ_CHUNKS;
const CW = world.chunkWidth;
const EDGE = 180;
const COIN = 38;
const COIN_LIFT = 44; // how far a coin's top sits above its surface

const problems = [];
const flag = (id, message) => problems.push(`${id}: ${message}`);

for (const chunk of chunks) {
  const ground = [...chunk.ground].sort((a, b) => a.x - b.x);
  const blocks = chunk.blocks || [];

  // Chunks must present flat ground at both seams, so pits can only ever fall
  // mid-chunk and any template can follow any other.
  const covers = (from, to) => ground.some((s) => s.x <= from && s.x + s.w >= to);
  if (!covers(0, EDGE)) flag(chunk.id, `entry 0..${EDGE} is not solid ground`);
  if (!covers(CW - EDGE, CW)) flag(chunk.id, `exit ${CW - EDGE}..${CW} is not solid ground`);

  const last = ground[ground.length - 1];
  if (ground[0].x !== 0) flag(chunk.id, 'ground must start at x=0');
  if (last.x + last.w !== CW) flag(chunk.id, `ground must end at x=${CW}`);

  // Landable surfaces are ground tops and block tops alike: a "pit" bridged by
  // cloud platforms is legal, so traversal is checked across both.
  const surfaces = [
    ...ground.map((s) => ({ x: s.x, w: s.w, y: world.groundY, kind: 'ground' })),
    ...blocks.map((b) => ({ x: b.x, w: b.w, y: b.y, kind: 'block' })),
  ].sort((a, b) => a.x - b.x);

  // Walk left to right and confirm each forward hop is inside the jump arc.
  let reachedTo = -Infinity;
  for (const surface of surfaces) {
    if (reachedTo === -Infinity) {
      reachedTo = surface.x + surface.w;
      continue;
    }
    const gap = surface.x - reachedTo;
    if (gap > MAX_GAP) {
      flag(chunk.id, `gap of ${Math.round(gap)}px at x=${reachedTo} exceeds the ${Math.round(MAX_GAP)}px jump`);
    }
    reachedTo = Math.max(reachedTo, surface.x + surface.w);
  }

  // Pits must stay clear of blocks. A jump out of a pit clears a tier-1
  // platform's top only after 66px, but hits its underside after 4px, so a
  // block near a ledge cancels the jump and drops the player in with no
  // recovery. Ground-level islands are exempt: they have no underside.
  const pits = [];
  for (let i = 0; i < ground.length - 1; i += 1) {
    pits.push({ from: ground[i].x + ground[i].w, to: ground[i + 1].x });
  }
  for (const pit of pits) {
    for (const block of blocks) {
      const clear = block.x >= pit.to + PIT_CLEARANCE || block.x + block.w <= pit.from - PIT_CLEARANCE;
      if (!clear) {
        flag(
          chunk.id,
          `block at ${block.x}..${block.x + block.w} is within ${PIT_CLEARANCE}px of the pit at ` +
            `${pit.from}..${pit.to}, so it can cancel a jump over that pit`,
        );
      }
    }
  }

  // Pits must also stay clear of obstacles on the far side. Clearing a pit is
  // committed the moment the player leaves the ledge: they cannot stop, turn,
  // or jump again, so where they touch down is fixed by when they took off.
  // An obstacle anywhere in that touchdown range is an unavoidable hit. The
  // range runs from the landing ledge to the furthest a jump taken at the very
  // edge of the pit can carry, which is a full airtime at running speed.
  for (const pit of pits) {
    const landFrom = pit.to;
    const landTo = Math.round(pit.from + REACH_ACROSS);
    for (const hazard of chunk.hazards || []) {
      if (hazard.x < landTo && hazard.x + hazard.w > landFrom - PLAYER_W) {
        flag(
          chunk.id,
          `hazard at ${hazard.x} sits in the landing range ${landFrom}..${landTo} of the pit at ` +
            `${pit.from}..${pit.to}, so clearing that pit drops the player onto it`,
        );
      }
    }
  }

  for (const coin of chunk.coins || []) {
    const rest = surfaces.find(
      (s) => coin.x + COIN > s.x && coin.x < s.x + s.w && Math.abs(s.y - (coin.y + COIN_LIFT)) < 6,
    );
    if (!rest) flag(chunk.id, `coin at ${coin.x},${coin.y} floats with no surface beneath it`);
  }

  for (const hazard of chunk.hazards || []) {
    const where = `${hazard.x}`;

    // Obstacles hold still. A kind that travels would invalidate every rule
    // below, all of which are checked against the single declared position, so
    // an unknown kind is rejected outright rather than silently accepted.
    if (hazard.kind && !HAZARD_KINDS.has(hazard.kind)) {
      flag(chunk.id, `hazard at ${where} has unknown kind "${hazard.kind}"`);
    }
    if (hazard.span || hazard.speed) {
      flag(chunk.id, `hazard at ${where} declares movement, but obstacles must hold still`);
    }

    if (hazard.y + hazard.h !== world.groundY) {
      flag(chunk.id, `hazard at ${where} does not rest on the ground line`);
    }

    const covered = ground.some((s) => hazard.x >= s.x && hazard.x + hazard.w <= s.x + s.w);
    if (!covered) flag(chunk.id, `hazard at ${where} is not fully over one ground slab`);

    // A hazard directly under a platform cannot be jumped even when its
    // takeoff window is clear: the arc rises into the platform's underside,
    // the bonk cancels the jump, and the player drops back onto the hazard.
    for (const block of blocks) {
      if (hazard.x < block.x + block.w && hazard.x + hazard.w > block.x - PLAYER_W) {
        flag(
          chunk.id,
          `hazard at ${where} sits under the block at ${block.x}..${block.x + block.w}, so a jump ` +
            `over it bonks the underside`,
        );
      }
    }

    // Running off a platform's right edge is a committed fall -- no jump is
    // available on the way down -- so a hazard sitting in that landing band is
    // damage the player cannot avoid. Keep hazards out of every band.
    for (const block of blocks) {
      const [from, to] = landingBand(block.x + block.w, block.y);
      if (hazard.x < to && hazard.x + hazard.w > from) {
        flag(
          chunk.id,
          `hazard at ${where} reaches the landing band ${from}..${to} of the block ending at ` +
            `${block.x + block.w}, so running off it is an unavoidable hit`,
        );
      }
    }

    // Clearing a hazard means taking off inside a narrow window before it. If a
    // platform hangs over that window, the jump bonks its underside and dies,
    // and the hazard becomes impossible to get over at all.
    const [takeoffFrom, takeoffTo] = takeoffWindow(hazard);
    if (takeoffTo < takeoffFrom) {
      flag(chunk.id, `hazard at ${where} is too wide to clear in one jump`);
    }
    for (const block of blocks) {
      if (takeoffFrom < block.x + block.w && takeoffTo > block.x - PLAYER_W) {
        flag(
          chunk.id,
          `hazard at ${where} can only be jumped from ${takeoffFrom}..${takeoffTo}, which is ` +
            `under the block at ${block.x}..${block.x + block.w}, so the jump is blocked overhead`,
        );
      }
    }
  }

  // A raised block needs somewhere lower to jump from, near enough horizontally.
  for (const block of blocks) {
    const approach = surfaces.some((s) => {
      if (s === block || s.y <= block.y) return false;
      const dy = s.y - block.y;
      const gap = Math.max(block.x - (s.x + s.w), s.x - (block.x + block.w), 0);
      return dy <= MAX_STEP && gap <= REACH_ACROSS;
    });
    if (!approach) flag(chunk.id, `block at ${block.x},${block.y} cannot be reached from below`);

    // The rule that keeps a run from dead-ending: a block low enough to overlap
    // a standing player's body is a wall, and a player holding Right stops on
    // it instead of running under or jumping on top.
    const headroom = world.groundY - PLAYER_H;
    if (block.y + BLOCK_H > headroom) {
      flag(
        chunk.id,
        `block at ${block.x},${block.y} reaches ${block.y + BLOCK_H}, past the standing head line ` +
          `at ${headroom}, so it walls a running player`,
      );
    }
  }

  if (chunk.npc) {
    const footing = ground.find((s) => chunk.npc.x < s.x + s.w && chunk.npc.x + 36 > s.x);
    if (!footing) flag(chunk.id, `npc at ${chunk.npc.x} hangs over a pit`);
  }
}

assert.deepEqual(problems, [], `\n  ${problems.join('\n  ')}\n`);

// Zone thresholds must be ordered, start at zero, and all land before the
// target, or a zone would never appear during a run.
assert.equal(zones[0].from, 0, 'the first zone must start at score 0');
for (let i = 1; i < zones.length; i += 1) {
  assert.ok(zones[i].from > zones[i - 1].from, `zone ${zones[i].id} must start after ${zones[i - 1].id}`);
  assert.ok(zones[i].from < world.target, `zone ${zones[i].id} must begin before the ${world.target} target`);
}

// Scoring is coins-only, so the target has to be a whole number of coins --
// otherwise a run could step from 995 to 1005 and skip the ending.
assert.equal(world.target % world.coinValue, 0, 'target must divide evenly by coin value');
for (const zone of zones) {
  assert.equal(zone.from % world.coinValue, 0, `zone ${zone.id} must begin on a coin boundary`);
  assert.ok(zone.npcs.length > 0, `zone ${zone.id} needs at least one advisor line`);
  assert.ok(zone.coinLabels.length > 0, `zone ${zone.id} needs coin labels`);
  assert.ok(zone.hazardLabels.length > 0, `zone ${zone.id} needs hazard labels`);
}

const weight = chunks.reduce((n, c) => n + c.weight, 0);
const perChunk = chunks.reduce((n, c) => n + c.weight * (c.coins || []).length, 0) / weight;
const needed = Math.ceil(world.target / world.coinValue / perChunk);

console.log(
  `PASS: ${chunks.length} chunk templates join safely, every gap <= ${Math.round(MAX_GAP)}px ` +
    `and every step <= ${Math.round(MAX_STEP)}px`,
);
console.log(
  `PASS: ${zones.length} zones on coin boundaries; ${perChunk.toFixed(2)} coins/chunk means ` +
    `~${needed} chunks (${needed * CW}px) to reach ${world.target}`,
);
