// Guards the camera against every screen shape the game gets played on.
//
// Sprites must never stretch, so the camera always matches the screen's
// proportions. What varies is how much world is on camera: a 16/9 window or
// anything taller shows the full 540px of world height, while a phone held
// sideways is wide enough that doing so would spend over half the screen on
// empty sky, so there the view is shorter and rides with the player.
//
// Whatever the shape, the run itself -- geometry, score, lives -- survives a
// rotation untouched.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { window: { devicePixelRatio: 2, addEventListener() {} } };
vm.createContext(scope);
for (const name of ['story', 'levels', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', `${name}.js`), 'utf8'), scope);
}
let bounds = { width: 800, height: 280 };
const canvas = {
  style: {}, getBoundingClientRect: () => bounds,
  getContext: () => ({ setTransform() {} }),
};
const game = new scope.window.CloudQuestGame(canvas, {
  levelName: {}, signalCount: {}, trustScore: {}, lifeCount: {},
});
game.trust = 200;
game.lives = 1;
const ground = game.world.groundY;

// The tallest thing the camera has to be able to frame: Eva at the apex of a
// jump taken from the ground, sprite overhang included.
const JUMP_UP = (560 * 560) / (2 * 1480);
const SPRITE_ABOVE_BOX = 53;
const NEEDED = 58 + SPRITE_ABOVE_BOX + JUMP_UP;

const SHAPES = [
  ['phone landscape', 800, 280],
  ['phone landscape', 915, 412],
  ['phone portrait', 393, 560],
  ['small phone', 320, 390],
  ['desktop 16/9', 1280, 720],
  ['tall window', 700, 900],
];

let cropped = 0;
for (const [label, width, height] of SHAPES) {
  bounds = { width, height };
  game.resizeCanvas();
  game.ensureWorld();

  assert.ok(
    Math.abs(game.width / game.viewH - width / height) < 0.002,
    `${label}: camera must match screen proportions, or sprites stretch`,
  );
  assert.equal(canvas.width, game.width * 2, `${label}: backing store must match the camera width`);
  assert.equal(canvas.height, game.viewH * 2, `${label}: backing store must match the view height`);

  assert.ok(game.viewH <= game.height, `${label}: the camera cannot show more world than exists`);
  assert.ok(
    game.viewH >= NEEDED,
    `${label}: a ${Math.round(game.viewH)}px view cannot frame Eva at the top of a ` +
      `jump, which needs ${Math.round(NEEDED)}px`,
  );
  if (game.viewH < game.height) cropped += 1;

  // A 16/9 window and anything taller must be framed exactly as before: the
  // whole world height, with no vertical camera movement at all.
  if (width / height <= 1.9) {
    assert.equal(game.viewH, game.height, `${label}: must still show the full world height`);
    game.followCameraY(1 / 60);
    assert.equal(game.cameraY, 0, `${label}: the camera must never pan vertically`);
  }

  // Wherever the view sits, standing on the ground must put the ground line at
  // the bottom of the frame, and the top of a jump must stay on camera.
  for (let i = 0; i < 240; i += 1) game.followCameraY(1 / 60);
  assert.ok(
    game.cameraY + game.viewH >= game.world.groundY,
    `${label}: the ground line fell below the frame`,
  );
  const spriteTopAtApex = game.player.y - JUMP_UP - SPRITE_ABOVE_BOX;
  assert.ok(
    spriteTopAtApex >= game.cameraY - 1,
    `${label}: a jump from here would carry Eva's head off the top of the frame`,
  );

  assert.equal(game.world.groundY, ground, `${label}: rotation must preserve level geometry`);
  assert.equal(game.trust, 200, `${label}: rotation must preserve progress`);
  assert.equal(game.lives, 1, `${label}: rotation must not refresh lives`);
  assert.ok(
    game.nextChunkX > game.cameraX + game.width,
    `${label}: world must fill the expanded camera`,
  );
}

assert.ok(cropped >= 2, 'expected the wide phone shapes to crop the view');
console.log(
  `PASS: ${SHAPES.length} viewport shapes keep proportions, resolution, world coverage, ` +
    `score and lives (${cropped} crop the sky and follow vertically)`,
);
