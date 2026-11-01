const initial = {
  pitch: 'Fictional test: we sell $49 monthly reporting software to repair shops. Technical Expert, please ask how we reject malformed spreadsheet imports. Market Researcher, please ask how many paying shops use the report weekly. Interrogator and Sympathizer, please sit out this round.',
  expect: { speakers: ['technical_expert', 'market_signals_researcher'],
    investors: { technical_expert: { answerStatus: 'none', concern: true }, market_signals_researcher: { answerStatus: 'none', concern: true } } },
};
const technicalAnswer = 'For the Technical Expert: import validation requires the exact column schema, ISO dates and numeric totals; malformed rows are rejected into a review queue, never silently imported. We replayed 200 malformed files and rejected all 200, with zero corrupt reports. A staff member reviews every failed import and the owner confirms the preview before release.';
const marketAnswer = 'For the Market Researcher: 12 independent repair shops paid $49 from their own budgets last month. Event logs show 10 of those 12 opened and used the report every week for four consecutive weeks, and eight documented a stock order changed using it. The denominator is all 12 paying shops, excluding staff and free trials.';
const resolved = { answerStatus: 'resolved', minDelta: 0, maxDelta: 20 };
const unanswered = { answerStatus: 'unanswered', minDelta: -20, maxDelta: -10, concern: true };
const partial = { answerStatus: 'partial', minDelta: -20, maxDelta: -5, concern: true };
const defer = { answerStatus: 'deferred', minDelta: 0, maxDelta: 0, concern: true };
export const scenarios = [
  { name: 'both', turns: [initial, { pitch: technicalAnswer + ' ' + marketAnswer + ' Those are my answers to both questions. Please acknowledge briefly without asking a new question.',
    expect: { investors: { technical_expert: { ...resolved, concern: false }, market_signals_researcher: { ...resolved, concern: false } } } }] },
  { name: 'one', turns: [initial,
    { pitch: technicalAnswer + ' I have no answer to the Market Researcher\'s usage question. My answer is finished.',
      expect: { investors: { technical_expert: resolved, market_signals_researcher: unanswered }, includesSpeaker: 'market_signals_researcher' } },
    { pitch: marketAnswer + ' That addresses the outstanding usage question. Please acknowledge without adding a new question.',
      expect: { investors: { market_signals_researcher: { ...resolved, concern: false } } } },
  ] },
  { name: 'neither', turns: [initial,
    { pitch: 'I am not answering either the import validation question or the paying-shop usage question. We will be huge, just trust me. That is my completed answer.',
      expect: { investors: { technical_expert: unanswered, market_signals_researcher: unanswered } } },
    { pitch: 'On imports, we currently reject blank rows but cannot yet validate dates or totals and have not measured bad files getting through. On usage, some shops say they look at reports, but I cannot supply a count of paying shops or how often they use them. That is my complete answer to both questions.',
      expect: { investors: { technical_expert: partial, market_signals_researcher: partial } } },
    { pitch: 'Please give me a moment to think. I am still composing my answer. Please stay quiet.',
      expect: { speakers: [], investors: { technical_expert: defer, market_signals_researcher: defer } } },
    { pitch: technicalAnswer + ' ' + marketAnswer + ' Please acknowledge both answers without asking a new question.',
      expect: { investors: { technical_expert: { ...resolved, concern: false }, market_signals_researcher: { ...resolved, concern: false } } } },
  ] },
];
