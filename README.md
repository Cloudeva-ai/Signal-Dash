# Signal Dash

A static endless-runner platform game for Cloudeva.ai. The player controls Eva,
the CloudEVA mascot, running through an infinitely generated cloud estate to
collect 100 decision signals and reach **1000 points**.

The run is one continuous world. It shifts through three themed zones as the
score climbs, so the CloudEVA story still lands by the end:

| Zone | From | Theme |
| --- | --- | --- |
| Governance Run | 0 | Owners, policy, review, decision records |
| Cost Control Run | 340 | Cost spikes tied to the change that caused them |
| Risk Signal Run | 670 | Evidence and human approval before action |

The content is based on Cloudeva.ai positioning around Explain, Verify, Advise,
Decision Queue, Decision Records, human approval, and one governed view across
AWS, Azure, and GCP.

## Rules

- **Scoring is coins only.** Each decision signal is 10 points, so 1000 points
  is exactly 100 signals. Advisors you talk to are flavour and award nothing,
  which keeps the target on an exact coin boundary.
- **Three lives, then game over.** A hazard or a fall costs a life and respawns
  Eva on solid ground just behind the hit. Losing all three ends the run.
- **A 1-up every 200 points**, capped at 5 lives. Without this the run is
  effectively unfinishable, since reaching 1000 takes a few minutes.
- Reaching 1000 ends the run and shows the CloudEVA call to action.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow Left / Right, or A / D | Left / Right buttons |
| Jump | Space, Arrow Up, or W | Jump button |
| Talk to an advisor | E or Enter | Talk button |

Touch uses pointer capture, so holding Right with one thumb while tapping Jump
with the other works, and releasing, cancelling, or backgrounding the page
clears the held keys rather than leaving Eva running.

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

The same file also enforces two fairness rules for hazards: a hazard may not sit
in the landing band of a platform's right edge (running off is a committed fall,
so that hit is unavoidable), and the takeoff window for clearing a hazard may
not fall under a platform (the jump would bonk the ceiling).

## Checks

```sh
node qa/world-check.cjs    # generator geometry and fairness invariants
node qa/motion-check.cjs   # movement, endless generation, scoring, lives
node qa/touch-check.cjs    # simultaneous touch controls and cleanup
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
