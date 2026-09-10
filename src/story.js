window.RCQ_STORY = {
  heroName: "Eva",
  petName: "EVA Advisor",
  intro: {
    kicker: "Cloud Decision Run",
    title: "Signal Dash",
    body:
      "Eva enters an endless cloud estate streaming signals from AWS, Azure, and GCP. Run right, collect 100 decision signals, and reach 1000 points. The estate shifts from governance to cost to risk as your score climbs, and Eva has three lives to get there.",
    action: "Start the run",
    showMascot: true,
  },
  // Shown as an in-game banner when the score crosses a zone threshold.
  zones: [
    {
      id: "governance",
      banner: "Every change needs an owner, a policy, and a decision record.",
    },
    {
      id: "cost",
      banner: "Catch spend before the bill: tie cost spikes to the change that caused them.",
    },
    {
      id: "risk",
      banner: "Verify before you approve. Confidence is not evidence.",
    },
  ],
  ending: {
    kicker: "Run Complete",
    title: "1000 Points: Cloud Governance Reaches EVA-A",
    body:
      "You finished the run on {score} points. Governance turned changes into accountable records, cost management caught waste early, and risk analysis gave security and compliance teams evidence before approval. One governed view, across every cloud.",
    action: "Explore CloudEVA",
    actionHref: "https://cloudeva.ai/",
  },
  gameOver: {
    kicker: "Run Ended",
    title: "Out of Lives",
    body:
      "Eva ran out of lives on {score} points with {coins} signals collected. Ungoverned cloud noise wins when decisions are not recorded. Take another run at it.",
  },
};
