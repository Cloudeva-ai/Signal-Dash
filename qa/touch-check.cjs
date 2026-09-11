const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(control) {
  const handlers = {};
  return {
    dataset: { control }, style: {}, width: 960, height: 540,
    classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => ({ setTransform() {} }), removeAttribute() {},
    addEventListener(name, fn) { handlers[name] = fn; },
    setPointerCapture(id) { this.captured = id; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 120, height: 120 }; },
    fire(name, pointerId = 1, clientX = 60, clientY = 60) { handlers[name]?.({ pointerId, clientX, clientY, preventDefault() {} }); },
  };
}
const controls = ['jump', 'interact'].map(element);
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
const stick = elements.get('#joystick');
stick.fire('pointerdown', 10, 96);
controls[0].fire('pointerdown', 11);
assert.equal(stick.captured, 10);
assert.equal(controls[0].captured, 11);
game.update(1 / 60);
assert.ok(game.player.vx > 0 && game.player.vy < 0, 'two fingers must move and jump together');
controls[0].fire('pointerup', 11);
assert.equal(game.moveAxis, 1, 'releasing jump must preserve direction');
assert.equal(game.keys.jump, false);
stick.fire('pointermove', 10, 78);
assert.ok(game.moveAxis > 0 && game.moveAxis < 0.5, 'partial drag gives proportional speed');
game.update(1 / 60);
assert.ok(game.player.vx > 0 && game.player.vx < 125);
stick.fire('pointermove', 10, 62);
assert.equal(game.moveAxis, 0, 'center dead zone prevents drift');
stick.fire('pointermove', 10, -100);
assert.equal(game.moveAxis, -1, 'drag is clamped at full speed');
stick.fire('pointerdown', 12, 96);
stick.fire('pointerup', 12);
assert.equal(game.moveAxis, -1, 'another finger cannot steal or release the joystick');
stick.fire('pointercancel', 10);
assert.equal(game.moveAxis, 0);
assert.equal(elements.get('#joystickThumb').style.transform, 'translate(0px, 0px)');
stick.fire('pointerdown', 13, 96);
stick.fire('lostpointercapture', 13);
assert.equal(game.moveAxis, 0);
stick.fire('pointerdown', 14, 96);
controls[0].fire('pointerdown', 15);
windowEvents.blur();
assert.equal(game.moveAxis, 0);
assert.equal(game.keys.jump, false);
stick.fire('pointermove', 14, 96);
assert.equal(game.moveAxis, 0, 'stale pointer cannot resume movement after blur');
stick.fire('pointerdown', 16, 96);
scope.document.hidden = true;
documentEvents.visibilitychange();
assert.equal(game.moveAxis, 0);
assert.equal(game.paused, true);
stick.fire('pointerdown', 17, 96);
windowEvents.resize();
assert.equal(game.moveAxis, 0, 'rotation clears joystick input');
controls[0].fire('pointerdown', 18);
controls[0].fire('pointerdown', 19);
controls[0].fire('pointerup', 18);
assert.equal(game.keys.jump, true, 'jump stays held by the remaining finger');
controls[0].fire('pointerup', 19);
assert.equal(game.keys.jump, false);
windowEvents.keydown({ code: 'ArrowRight', preventDefault() {} });
game.update(1 / 60);
assert.equal(game.player.vx, 250, 'keyboard movement remains full speed');
windowEvents.keyup({ code: 'ArrowRight', preventDefault() {} });
vm.runInContext('ui.showStory(window.RCQ_STORY.ending)', scope);
assert.equal(elements.get('#storyAction').hidden, true);
assert.equal(elements.get('#storyCta').hidden, false);
assert.equal(elements.get('#storyCta').href, 'https://cloudeva.ai/');
assert.equal(elements.get('#restartButton').disabled, true);
console.log('PASS: analog speed/dead zone, multitouch jump, pointer ownership, cancellation, blur, rotation, keyboard, and CTA');
