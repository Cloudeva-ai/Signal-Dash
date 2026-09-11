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
for (const [width, height] of [[800, 280], [915, 412], [393, 560], [320, 390], [1280, 720]]) {
  bounds = { width, height };
  game.resizeCanvas();
  game.ensureWorld();
  assert.ok(Math.abs(game.width / game.height - width / height) < 0.002, 'camera must match screen proportions');
  assert.equal(canvas.width, game.width * 2);
  assert.equal(canvas.height, 1080);
  assert.equal(game.world.groundY, ground, 'rotation must preserve level geometry');
  assert.equal(game.trust, 200, 'rotation must preserve progress');
  assert.equal(game.lives, 1, 'rotation must not refresh lives');
  assert.ok(game.nextChunkX > game.cameraX + game.width, 'world must fill the expanded camera');
}
console.log('PASS: 5 viewport sizes preserve proportions, resolution, world coverage, score and lives');
