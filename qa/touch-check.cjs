const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(control) {
  const handlers = {};
  return {
    dataset: { control }, style: {}, width: 960,
    classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => ({}), removeAttribute() {},
    addEventListener(name, fn) { handlers[name] = fn; },
    setPointerCapture(id) { this.captured = id; },
    fire(name, pointerId = 1) { handlers[name]?.({ pointerId, preventDefault() {} }); },
  };
}
const controls = ['left', 'right', 'jump', 'interact'].map(element);
const elements = new Map();
const windowEvents = {};
const documentEvents = {};
const scope = {
  window: { devicePixelRatio: 1, setTimeout() {}, addEventListener(name, fn) { windowEvents[name] = fn; } },
  document: {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll: selector => selector === '[data-control]' ? controls : [],
    addEventListener(name, fn) { documentEvents[name] = fn; },
  },
  Image: class { addEventListener() {} },
  performance: { now: () => 100 }, requestAnimationFrame() {},
};
vm.createContext(scope);
for (const name of ['story', 'levels', 'game']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', `${name}.js`), 'utf8'), scope);
}
scope.window.CloudQuestGame.prototype.render = () => {};
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8'), scope);
const game = vm.runInContext('game', scope);
controls[1].fire('pointerdown', 10);
controls[2].fire('pointerdown', 11);
assert.equal(controls[1].captured, 10);
assert.equal(controls[2].captured, 11);
game.update(1 / 60);
assert.ok(game.player.vx > 0 && game.player.vy < 0, 'two fingers must move and jump together');
controls[2].fire('pointerup', 11);
assert.equal(game.keys.right, true, 'releasing jump must preserve direction');
assert.equal(game.keys.jump, false);
controls[1].fire('pointercancel', 10);
assert.equal(game.keys.right, false);
controls[0].fire('pointerdown', 12);
controls[0].fire('lostpointercapture', 12);
assert.equal(game.keys.left, false);
controls[1].fire('pointerdown', 13);
windowEvents.blur();
assert.equal(game.keys.right, false);
vm.runInContext('ui.showStory(window.RCQ_STORY.ending)', scope);
assert.equal(elements.get('#storyAction').hidden, true);
assert.equal(elements.get('#storyCta').hidden, false);
assert.equal(elements.get('#storyCta').href, 'https://cloudeva.ai/');
assert.equal(elements.get('#restartButton').disabled, true);
console.log('PASS: simultaneous touch controls, release/cancel/blur cleanup, and final CTA visibility');
