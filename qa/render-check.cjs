// Guards the on-canvas dialogue box.
//
// The camera is as wide as the screen's aspect ratio makes it, so the same
// advisor line that takes two lines in landscape wraps to six on a portrait
// phone. The box therefore has to be sized from the wrapped text: when its
// height was a fixed 72px, every line past the second was painted out on the
// sky, which is what a player actually saw when they pressed Talk.
//
// Real glyph metrics need a browser, so measureText here charges a fixed width
// per character. That is enough to check the layout arithmetic -- given the
// lines the wrap produced, the box must contain all of them -- which is the
// part that broke.

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

// Wider than any real bold Arial average, so the check errs towards more lines
// rather than fewer.
const CHAR_W = 0.62;
// Bold Arial sits roughly three quarters above the baseline, a quarter below.
const ASCENT = 0.76;
const DESCENT = 0.24;

function recorder() {
  const calls = { boxes: [], lines: [] };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: '',
    font: '10px sans-serif',
    fillRect() {},
    strokeRect(x, y, w, h) { calls.boxes.push({ x, y, w, h }); },
    fillText(text, x, y) {
      const size = Number(ctx.font.match(/(\d+)px/)[1]);
      calls.lines.push({ text, x, y, size, w: text.length * size * CHAR_W });
    },
    measureText(text) {
      const size = Number(ctx.font.match(/(\d+)px/)[1]);
      return { width: text.length * size * CHAR_W };
    },
  };
  return { ctx, calls };
}

const zones = scope.window.RCQ_ZONES;
// Every string the game can put in the box: advisor lines, the talk prompt,
// zone banners, and the one-per-kind obstacle hit messages read off game.js.
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const hits = source.match(/const HAZARD_HIT = \{([\s\S]*?)\n\};/)[1].match(/"([^"]+)"/g) || [];
const MESSAGES = [
  ...zones.flatMap((z) => z.npcs.map((n) => n.text)),
  ...zones.flatMap((z) => z.npcs.map((n) => `Press Talk near ${n.label}`)),
  ...zones.map((z) => `${z.name} - 3 lives restored!`),
  ...hits.map((h) => h.slice(1, -1)),
  'Eva fell. Signal lost.',
];
assert.ok(MESSAGES.length >= 12, 'expected the full set of dialogue strings');

const ui = { levelName: {}, signalCount: {}, trustScore: {}, lifeCount: {}, showStory() {} };
const game = new scope.window.CloudQuestGame(
  { width: 960, getContext: () => ({ setTransform() {} }) },
  ui,
);
game.render = () => {};

// 240 is the floor resizeCanvas clamps to, 301 is a portrait phone, 1171 a
// phone in landscape. The narrowest is what makes the longest line wrap most.
let widest = 0;
for (const cameraWidth of [240, 301, 420, 1171]) {
  game.width = cameraWidth;

  for (const message of MESSAGES) {
    const { ctx, calls } = recorder();
    game.message = message;
    game.messageTimer = 1;
    game.drawMessage(ctx);

    assert.equal(calls.boxes.length, 1, `expected one dialogue box for "${message}"`);
    const box = calls.boxes[0];
    assert.ok(calls.lines.length > 0, `nothing was drawn for "${message}"`);

    // No word may be dropped or duplicated by the wrap.
    assert.equal(
      calls.lines.map((l) => l.text).join(' '),
      message,
      `the wrap changed the text of "${message}"`,
    );

    for (const line of calls.lines) {
      const top = line.y - line.size * ASCENT;
      const bottom = line.y + line.size * DESCENT;
      assert.ok(line.x >= box.x, `"${line.text}" starts left of the box at width ${cameraWidth}`);
      assert.ok(
        line.x + line.w <= box.x + box.w,
        `"${line.text}" runs past the right edge of the box at width ${cameraWidth}`,
      );
      assert.ok(top >= box.y, `"${line.text}" sits above the box at width ${cameraWidth}`);
      assert.ok(
        bottom <= box.y + box.h,
        `"${line.text}" spills ${Math.round(bottom - (box.y + box.h))}px below the box at ` +
          `camera width ${cameraWidth} -- the box must be sized to its text`,
      );
    }

    // The box must not grow down over the player. Her name tag floats highest.
    const nameTagTop = game.player.y - 77 - 10;
    assert.ok(
      box.y + box.h <= nameTagTop,
      `the box reaches ${Math.round(box.y + box.h)} at camera width ${cameraWidth}, over Eva's ` +
        `name tag at ${Math.round(nameTagTop)}`,
    );
    widest = Math.max(widest, box.h);
  }
}

console.log(
  `PASS: ${MESSAGES.length} dialogue strings stay inside the box at 4 camera widths ` +
    `(tallest box ${Math.round(widest)}px, clear of the player)`,
);
