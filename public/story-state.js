window.StoryState = {
  editable: (data) => data,
  validate: (data) => null,
  merge: (base, local, remote, keepLocal) => ({ conflicts: [], content: keepLocal ? local : remote }),
  acknowledge: (sent, current, result) => result,
  listLimits: { timeline: 60, memories: 80 },
  textLimits: { himName: 50, herName: 50, envelopeTopText: 100, envelopeName: 100, heroTitle: 100, heroSubtitle: 200, counterCaption: 200, giftBoxTitle: 100, songTitle: 100, songUrl: 500 }
};