# Signal Dash

A static endless-runner platform game for Cloudeva.ai. The player controls Eva,
the CloudEVA mascot, running through an infinitely generated cloud estate to
collect 100 decision signals and reach **1000 points**.

The run is one continuous world. It shifts through three themed zones as the
score climbs, so the CloudEVA story still lands by the end:

| Zone | From | Theme |
| --- | --- | --- |
| Governance Run | 0 | Owners, policy, review, decision records |
| Cost Control Run | 330 | Cost spikes tied to the change that caused them |
| Risk Signal Run | 660 | Evidence and human approval before action |

The content is based on Cloudeva.ai positioning around Explain, Verify, Advise,
Decision Queue, Decision Records, human approval, and one governed view across
AWS, Azure, and GCP.

## Rules

- **Scoring is coins only.** Each decision signal is 10 points, so 1000 points
  is exactly 100 signals. Advisors you talk to are flavour and award nothing,
  which keeps the target on an exact coin boundary.
- **Three lives, then game over.** A hazard or a fall costs a life and respawns
  Eva on solid ground just behind the hit. Losing all three ends the run.
- **Lives refresh to three at 330 and 660 points**, when entering a new zone.
  There are no extra lives between zones, and lives never exceed three.
- Reaching 1000 ends the run and shows the CloudEVA call to action.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow Left / Right, or A / D | Left analog joystick |
| Jump | Space, Arrow Up, or W | Jump button |
| Talk to an advisor | E or Enter | Talk button |

Drag the left joystick to move; drag farther for faster movement. Its center
dead zone prevents accidental movement. Hold it with your left thumb and tap
the large Jump button on the right. Talk remains beside Jump. Pointer capture
keeps both touches independent, and releasing, cancelling, rotating, or
backgrounding the page clears movement. Keyboard controls remain available.

## Run Locally

Open `index.html` in a browser. No server, build step, or API key is required.

For a local server instead (useful for testing on the same machine):

```sh
python serve.py     # http://127.0.0.1:8765/
```

`Start Game.cmd` does the same thing on Windows.

## World Generation

`src/levels.js` holds the zone definitions and a set of chunk templates in
local coordinates. `src/game.js` assembles them into an endless world, keeping
about two screens ahead of the camera and one behind, so a player can double
back without running off the edge of what exists.

Geometry is tuned against the movement constants in `game.js` (jump 560,
gravity 1480, speed 250, giving a 106px jump height and 189px reach). Three
rules keep every generated run crossable, and `qa/world-check.cjs` enforces all
of them against those constants rather than hardcoded numbers:

1. **Seams.** Every template is solid ground across its first and last 180px,
   so any template can follow any other and pits only fall mid-chunk.
2. **Head clearance.** Raised blocks sit clear of a standing player's head, so a
   platform is something to run under or land on, never a wall that stops a
   player who is holding Right.
3. **Pits stay clear of blocks.** A jump only clears a tier-1 platform's top
   after 66px but hits its underside after 4px, so a platform near a ledge is a
   ceiling that cancels the jump and drops the player in with no recovery. Pits
   are bare gaps under 150px, and blocks keep 200px away. Wide crossings use
   ground-level islands, which have no underside to bonk.

The same file also enforces three fairness rules for hazards, all of them about
hits the player has no way to avoid. A hazard may not sit in the landing band of
a platform's right edge (running off is a committed fall). A hazard may not sit
in the landing range on the far side of a pit, which runs from the landing ledge
to the furthest a jump taken at the pit's edge can carry: clearing a pit is
committed the moment the player leaves the ledge, so where they touch down is
already fixed. And the takeoff window for clearing a hazard may not fall under a
platform (the jump would bonk the ceiling).

The opening chunk of a run spawns no obstacles at all, whichever template it
draws. A run starts with the player standing still at x=64 with no run-up, often
before they have touched the controls, so the first screen is ground to move on.
The same template carries its obstacles as written when it comes round again
later in the run.

Obstacles come in two kinds, both worth exactly one life: a bobbing signal
blocker and a narrower spike strip. Neither travels horizontally. Every rule
above is proved at the single x a template declares, so an obstacle that swept
sideways could walk out of the geometry that was validated and into a pit or
under a platform. `qa/world-check.cjs` rejects any hazard carrying movement or
an obstacle kind the engine does not define, and `qa/motion-check.cjs` samples
each kind over 20 simulated seconds to confirm its box never leaves that x.

## Checks

```sh
node qa/world-check.cjs    # generator geometry and fairness invariants
node qa/motion-check.cjs   # movement, endless generation, scoring, lives
node qa/touch-check.cjs    # simultaneous touch controls and cleanup
node qa/viewport-check.cjs # camera framing and world coverage on every screen shape
node qa/render-check.cjs   # dialogue box fits its text at every camera width
```

## Folder Structure

```text
.                   served at the site root
  index.html
  manifest.webmanifest
  serve.py
  Start Game.cmd
  README.md
  src/
    game.js         endless world assembly, physics, scoring, drawing
    levels.js       zone definitions and chunk templates
    story.js        intro, zone banners, ending, game over
    main.js         DOM wiring, input, sprite loading
    styles.css
  qa/
    world-check.cjs
    motion-check.cjs
    touch-check.cjs
    viewport-check.cjs
    render-check.cjs
  assets/           coin and power sprites (tools/make_assets.py)
  mascot/           Eva sprite poses
  docs/             sprite generation notes
  tools/
    make_assets.py  regenerates assets/ with Pillow
```

## Deployment

In repository **Settings → Pages**, select **GitHub Actions** as the source.
Pages must be enabled by a repository administrator; the workflow token cannot
create the Pages site itself.

Pushing to `main` triggers `.github/workflows/static.yml`. It runs the game
checks and publishes only `index.html`, `manifest.webmanifest`, `.nojekyll`,
`src/`, `assets/`, and `mascot/`. Tests, development tools, and documentation
are excluded from the deployed site.

To deploy manually, open **Actions → Deploy static content to Pages → Run
workflow** and select `main`. Ensure repository Actions are enabled first.

Site URL:

<https://cloudeva-ai.github.io/Signal-Dash/>

Over HTTPS the manifest allows Add to Home Screen on mobile, which runs the
game fullscreen with no browser chrome.

## Notes

- No server is required for normal use.
- No API keys are required.
- All gameplay assets are local PNG, CSS, and JavaScript files.
- Progress stays in the page session.

## Mobile playfield

`src/styles.css` is mobile-first: its base rules are the phone layout, and the
only large media query at the end of the file restores the desktop document
layout for a mouse-driven window (`min-width: 761px` and `pointer: fine`). A
tablet keeps the phone layout at any size, because it still plays with thumbs.

On a phone the page is a fixed game viewport rather than a scrolling document.
The HUD, Pause, and progress bar float over the playfield; the page furniture
(brand, mission track, footer) is hidden, since the zone banner and score
already carry that information. Portrait gives the thumb controls a dedicated
strip below the canvas. Landscape has no height to spare, so the canvas fills
the screen and the controls float over it. The control deck itself ignores
touches -- only the stick and buttons take them -- so a resting thumb never
swallows a tap.

The camera always matches the playfield's proportions, so sprites never
stretch. How much world it shows depends on the shape of the screen. At 16/9 or
anything taller -- portrait, tablets, desktop -- it shows the full 540px of
world height, exactly as it always has. A phone held sideways is much wider
than that, and fitting all 540px onto one spent over half the screen on empty
sky and left Eva 86px tall, so past a 1.9 aspect the camera shows a shorter
slice (never less than `MIN_VIEW_H`, which is enough to frame a jump from the
ground) and follows her vertically instead.

That vertical camera has a single rest position, with the ground on the bottom
edge, and it holds there for almost the whole run: `MIN_VIEW_H` guarantees a
jump from the ground fits, so ordinary running never moves it. It only pans up
when Eva is on the raised platforms, and eases back down when she lands.
`qa/viewport-check.cjs` checks both ends across six screen shapes -- her head
stays in frame at the top of a jump from the high road, and the ground line
stays in frame when she is standing on it.

Landscape used to float the thumb controls over the playfield. In that
orientation the ground is the bottom sliver of the screen, so a thumb covered
the obstacle it was there to jump; the controls now get their own strip, and
the cropped sky pays for it. Use Fullscreen (where supported) to hide browser
bars. Resizing or rotating keeps the same run and releases held controls. Coin
pickups update the score without covering the playfield with a message.

The advisor dialogue box is sized to its wrapped text rather than a fixed
height. The same line takes two lines in landscape and six on a portrait phone,
where the camera is only ~300 world px wide, and a fixed box left the rest of
the words out on the sky. `qa/render-check.cjs` holds every string the game can
show inside its box at four camera widths.

The joystick direction arrows and the Jump chevron are drawn with CSS
`clip-path`, not text, so they render identically regardless of which glyphs
the system font happens to carry.
