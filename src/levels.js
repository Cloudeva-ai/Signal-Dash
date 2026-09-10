// Endless runner world data.
//
// The run is one continuous world assembled from chunk templates. Three themed
// zones rotate as the score climbs so the CloudEVA story still lands by 1000.
//
// Geometry is tuned against the movement constants in game.js:
//   jump 560, gravity 1480, speed 250  ->  106px high, 189px across.
//
// See the notes above RCQ_CHUNKS for the three geometry rules that keep every
// generated run crossable. qa/world-check.cjs enforces all of them.

window.RCQ_WORLD = {
  chunkWidth: 960,
  groundY: 444,
  groundH: 96,
  tier1Y: 348, // 8px above a standing head, so Eva can run under it or land on it
  tier2Y: 272, // one jump above tier 1
  target: 1000,
  coinValue: 10,
};

// Zones rotate by score. Each keeps its own palette, coin labels, hazard
// wording and advisor lines, so the Explain / Verify / Advise story survives.
window.RCQ_ZONES = [
  {
    id: "governance",
    name: "Governance Run",
    from: 0,
    theme: {
      sky: "#123b4b",
      far: "#24666f",
      ground: "#20283a",
      grass: "#39f2ae",
      block: "#356276",
      accent: "#9fffe0",
      water: "#2fb8ff",
    },
    hazardType: "noise",
    hazardLabels: ["NOISE", "DRIFT", "GAP", "BLIND"],
    coinLabels: ["SIGNAL", "OWNER", "POLICY", "REVIEW", "RECORD", "AUDIT"],
    npcs: [
      {
        label: "Gov Admin",
        text:
          "Governance signal: seeing a change is not enough. Record who owns it, why it matters, and what decision was taken.",
      },
      {
        label: "EVA Node",
        text:
          "EVA: every change enters the Decision Queue with context attached, so nothing is approved from memory alone.",
      },
    ],
  },
  {
    id: "cost",
    name: "Cost Control Run",
    from: 340,
    theme: {
      sky: "#2f2447",
      far: "#5e4765",
      ground: "#292738",
      grass: "#ffd35a",
      block: "#7c5573",
      accent: "#ffcf4a",
      water: "#3ce0c3",
    },
    hazardType: "waste",
    hazardLabels: ["OVER", "IDLE", "LATE", "SPIKE"],
    coinLabels: ["COST", "SPIKE", "BUDGET", "UNIT", "WASTE", "OUTCOME"],
    npcs: [
      {
        label: "FinOps",
        text:
          "FinOps signal: the fastest savings happen when cost impact is attached to the change while the owner still remembers the context.",
      },
      {
        label: "EVA Node",
        text:
          "EVA: Explain the spike, verify the baseline, advise the trade-off, then track whether the decision delivered.",
      },
    ],
  },
  {
    id: "risk",
    name: "Risk Signal Run",
    from: 670,
    theme: {
      sky: "#371f2d",
      far: "#704459",
      ground: "#251f2b",
      grass: "#53e6ff",
      block: "#814753",
      accent: "#ff5f7e",
      water: "#a7ff5e",
    },
    hazardType: "risk",
    hazardLabels: ["OPEN", "FAIL", "AUTO", "STALE"],
    coinLabels: ["RISK", "VERIFY", "CISO", "COMPLY", "EVID", "APPROVE"],
    npcs: [
      {
        label: "CISO",
        text:
          "Risk signal: confidence is not evidence. Verify posture, policy, owner, and prior decisions before approving the change.",
      },
      {
        label: "Reviewer",
        text:
          "Human review stays in the loop. EVA recommends, but your team accepts, modifies, dismisses, or defers.",
      },
    ],
  },
];

// Chunk templates in local coordinates, 0..chunkWidth.
//
// Three invariants keep generated terrain crossable, all enforced by
// qa/world-check.cjs:
//
//   1. Seams. Every template is solid ground across its first and last 180px,
//      so any template can follow any other and pits only fall mid-chunk.
//   2. Head clearance. Blocks sit clear of a standing player's head, so a
//      platform is something to run under or land on, never a wall.
//   3. Pits stay clear of blocks. This is the subtle one. A jump only reaches
//      66px before the player's feet clear a tier-1 platform, but their head
//      hits its underside after 4px -- so a platform near a ledge is a ceiling
//      that cancels the jump and drops the player into the pit with no
//      recovery. Pits are therefore bare gaps under 150px, and blocks keep
//      200px away from them. Wide crossings use ground-level islands, which
//      have no underside to bonk.
//
// Obstacle kinds, all of which cost exactly one life:
//   static  a bobbing signal blocker, the default
//   spike   a still saw-tooth strip, narrower so it is quicker to clear
//   patrol  walks back and forth along `span` at `speed` px/s
//
// Obstacles obey two more fairness rules, also enforced by the world check: an
// obstacle may not sit under a platform (the jump over it would bonk the
// underside and drop the player back onto it), and may not sit in the landing
// band of a platform's right edge (running off is a committed fall, so that
// hit is unavoidable). For a patrol both are checked across the whole sweep.
//
// `ground` slabs sit at groundY. `blocks` carry an explicit y.
// `coins` and `hazards` are y-positioned by the template so they always rest on
// a real surface. Labels and hazard types are filled in per zone at spawn time.
// Coin placement carries the pacing. Every template puts at least two coins on
// the ground path so a player who never climbs still reaches 1000 in a few
// minutes, with the rest raised on platforms as a faster optional route.
window.RCQ_CHUNKS = [
  {
    id: "flat-run",
    weight: 3,
    ground: [{ x: 0, w: 960 }],
    blocks: [
      { x: 300, y: 348, w: 170, type: "brick" },
      { x: 620, y: 272, w: 190, type: "cloud" },
    ],
    coins: [
      { x: 120, y: 400 },
      { x: 880, y: 400 },
      { x: 340, y: 304 },
      { x: 400, y: 304 },
      { x: 690, y: 228 },
    ],
    // The only slot the blocks leave: everything further right is either under
    // a platform or inside one of their landing bands.
    hazards: [{ x: 190, y: 416, w: 44, h: 28 }],
  },
  {
    id: "single-pit",
    weight: 3,
    // The pit is the whole challenge here, so nothing hangs above it.
    ground: [{ x: 0, w: 400 }, { x: 550, w: 410 }],
    blocks: [{ x: 760, y: 348, w: 140, type: "brick" }],
    coins: [
      { x: 240, y: 400 },
      { x: 620, y: 400 },
      { x: 800, y: 304 },
      { x: 850, y: 304 },
    ],
    hazards: [{ x: 200, y: 416, w: 44, h: 28 }],
  },
  {
    id: "stair-up",
    weight: 2,
    ground: [{ x: 0, w: 960 }],
    blocks: [
      { x: 260, y: 348, w: 150, type: "brick" },
      { x: 470, y: 272, w: 150, type: "brick" },
      { x: 690, y: 348, w: 150, type: "brick" },
    ],
    coins: [
      { x: 120, y: 400 },
      { x: 900, y: 400 },
      { x: 300, y: 304 },
      { x: 520, y: 228 },
      { x: 730, y: 304 },
    ],
    hazards: [{ x: 170, y: 416, w: 44, h: 28 }],
  },
  {
    id: "island-hop",
    weight: 2,
    // Stepping stones at ground height: the same hopping rhythm as floating
    // platforms, with no underside to cancel a jump over the gap.
    ground: [{ x: 0, w: 300 }, { x: 420, w: 140 }, { x: 680, w: 280 }],
    blocks: [],
    coins: [
      { x: 200, y: 400 },
      { x: 470, y: 400 },
      { x: 880, y: 400 },
    ],
    hazards: [
      { x: 100, y: 416, w: 44, h: 28 },
      { x: 700, y: 416, w: 44, h: 28, kind: "patrol", span: 100, speed: 55 },
    ],
  },
  {
    id: "double-pit",
    weight: 2,
    ground: [{ x: 0, w: 280 }, { x: 400, w: 220 }, { x: 760, w: 200 }],
    blocks: [],
    coins: [
      { x: 150, y: 400 },
      { x: 560, y: 400 },
      { x: 830, y: 400 },
    ],
    hazards: [
      { x: 80, y: 416, w: 44, h: 28 },
      // Short span: the middle island is only 220px wide and a coin sits on it.
      { x: 420, y: 416, w: 44, h: 28, kind: "patrol", span: 60, speed: 50 },
    ],
  },
  {
    id: "high-road",
    weight: 2,
    ground: [{ x: 0, w: 960 }],
    // The step at 150 exists so the high road is reachable: 444 -> 348 -> 272
    // is two jumps. Without it the road sits 172px up and cannot be entered.
    blocks: [
      { x: 150, y: 348, w: 100, type: "brick" },
      { x: 300, y: 272, w: 380, type: "cloud" },
    ],
    coins: [
      { x: 100, y: 400 },
      { x: 740, y: 400 },
      { x: 380, y: 228 },
      { x: 480, y: 228 },
      { x: 580, y: 228 },
    ],
    // Past the road's right edge and clear of its landing band at 767..835.
    hazards: [{ x: 860, y: 416, w: 44, h: 28 }],
    npc: { x: 780, y: 382 },
  },
  {
    id: "hazard-alley",
    weight: 2,
    ground: [{ x: 0, w: 960 }],
    // Only one block here. A second block around 360..500 would put its landing
    // band at 556..624, right on top of the second obstacle.
    blocks: [{ x: 620, y: 348, w: 140, type: "brick" }],
    coins: [
      { x: 130, y: 400 },
      { x: 840, y: 400 },
      { x: 660, y: 304 },
      { x: 720, y: 304 },
    ],
    hazards: [
      { x: 200, y: 416, w: 44, h: 28 },
      { x: 500, y: 416, w: 44, h: 28 },
      { x: 920, y: 416, w: 28, h: 28, kind: "spike" },
    ],
  },
  {
    id: "tower",
    weight: 1,
    ground: [{ x: 0, w: 960 }],
    blocks: [
      { x: 300, y: 348, w: 120, type: "brick" },
      { x: 470, y: 272, w: 120, type: "brick" },
      { x: 650, y: 348, w: 120, type: "cloud" },
    ],
    coins: [
      { x: 130, y: 400 },
      { x: 880, y: 400 },
      { x: 330, y: 304 },
      { x: 500, y: 228 },
      { x: 680, y: 304 },
    ],
    hazards: [{ x: 180, y: 416, w: 44, h: 28 }],
    npc: { x: 850, y: 382 },
  },
  {
    id: "breather",
    weight: 1,
    // Deliberately empty of obstacles: the run needs a rest beat between the
    // obstacle courses or it reads as unrelenting rather than hard.
    ground: [{ x: 0, w: 960 }],
    blocks: [{ x: 430, y: 348, w: 200, type: "cloud" }],
    coins: [
      { x: 150, y: 400 },
      { x: 850, y: 400 },
      { x: 470, y: 304 },
      { x: 540, y: 304 },
    ],
    hazards: [],
    npc: { x: 220, y: 382 },
  },
  {
    id: "noise-field",
    weight: 2,
    // Block-free by design. Platforms are what constrain obstacle placement,
    // so the obstacle-heavy templates leave them out and get the whole floor
    // to work with.
    ground: [{ x: 0, w: 960 }],
    blocks: [],
    coins: [
      { x: 100, y: 400 },
      { x: 340, y: 400 },
      { x: 600, y: 400 },
      { x: 860, y: 400 },
    ],
    hazards: [
      { x: 200, y: 416, w: 44, h: 28 },
      { x: 460, y: 416, w: 44, h: 28 },
      { x: 720, y: 416, w: 44, h: 28 },
    ],
  },
  {
    id: "patrol-yard",
    weight: 2,
    ground: [{ x: 0, w: 960 }],
    blocks: [],
    coins: [
      { x: 100, y: 400 },
      { x: 440, y: 400 },
      { x: 780, y: 400 },
    ],
    hazards: [
      { x: 200, y: 416, w: 44, h: 28, kind: "patrol", span: 120, speed: 60 },
      { x: 560, y: 416, w: 44, h: 28, kind: "patrol", span: 120, speed: 70 },
      { x: 860, y: 416, w: 44, h: 28 },
    ],
  },
  {
    id: "spike-row",
    weight: 2,
    ground: [{ x: 0, w: 960 }],
    blocks: [],
    coins: [
      { x: 120, y: 400 },
      { x: 350, y: 400 },
      { x: 600, y: 400 },
      { x: 850, y: 400 },
    ],
    // Narrower than a signal blocker, so the timing window is wider even
    // though there are three of them.
    hazards: [
      { x: 220, y: 416, w: 28, h: 28, kind: "spike" },
      { x: 470, y: 416, w: 28, h: 28, kind: "spike" },
      { x: 720, y: 416, w: 28, h: 28, kind: "spike" },
    ],
  },
];
