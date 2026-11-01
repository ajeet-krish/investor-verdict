// Fixed, fictional roleplay facts. These are not claims about real businesses or people.
const cases = [
  {
    id: 'pantrypal', name: 'PantryPal', fictional: true,
    product: 'A meal-planning app that suggests recipes from ingredients already at home.',
    customers: 'Working parents with children aged 4-12 who cook at home at least four nights a week, initially in Toronto.',
    interviews: {
      count: 12, recruitment: 'A local parent group and a community-centre newsletter; all interviews lasted 20 minutes.',
      paymentFeedback: '8 of the 12 said they would pay $5 per month for weekly meal plans and an automatic shopping list. This is stated interest, not payment.',
      people: [
        { name: 'Maya Chen', description: 'Nurse and parent of two', feedback: 'Would pay $5 per month to avoid deciding what to cook after a shift.' },
        { name: 'Jordan Reed', description: 'Teacher and parent of one', feedback: 'Would pay $5 per month if the plan used ingredients already at home.' },
        { name: 'Alex Morgan', description: 'Office administrator and parent of two', feedback: 'Would use free recipe suggestions but would not pay yet.' },
      ],
      abandonedAlternatives: '6 of the 12 had stopped using meal planners. Maya and Jordan were among them. The main reasons were repeated ingredient entry and plans that required extra shopping. They now use notes or improvise.',
    },
    pilot: { households: 20, length: 'two weeks', returnedInWeekTwo: 14, payingHouseholds: 5, monthlyPrice: '$5', monthlyRevenue: '$25', feedback: 'Participants liked using leftovers; 7 asked for faster pantry entry.' },
    pricing: 'Free ingredient-based recipes; $5 per month for weekly plans and shopping lists. Five pilot households actually paid; eight interviewees expressed willingness.',
    technology: 'A working web prototype with manual ingredient entry and a small curated recipe library. No receipt scanning yet. Users review ingredients before cooking.',
    reliability: 'In 100 manual recipe checks, 92 suggestions used available ingredients correctly and 8 needed correction. Users can edit or reject suggestions. Typical response time was 2 seconds.',
    economics: 'Estimated variable cost is $0.30 per active household per month, excluding founder time and fixed hosting. One $60 pilot outreach test acquired the five paying households, an observed $12 per payer in this tiny sample.',
    team: 'Two cofounders: one builds the app and one handles customer interviews and recipe testing.',
    nextStep: 'Run a four-week trial with 50 households and test whether at least 25 return weekly and 10 pay $5. These are targets, not achieved results.',
    funding: 'Seeking a fictional $25,000 pre-seed investment for three months of development and a larger pilot.',
    unknowns: 'Long-term retention, measured reduction in food waste, profitability and expansion beyond this small pilot are not established.',
  },
  {
    id: 'borrowbox', name: 'BorrowBox', fictional: true,
    product: 'A neighbourhood marketplace for renting rarely used household tools.',
    customers: 'Apartment residents and occasional DIY users in one Toronto neighbourhood.',
    interviews: { count: 15, recruitment: 'An apartment residents group and a local repair workshop.', paymentFeedback: '10 would rent a tool for $8 per day instead of buying it. Five owners would list tools if deposits and handover were handled.', people: [
      { name: 'Priya Shah', description: 'Apartment renter', feedback: 'Would rent an $8 drill for a one-day shelving job.' },
      { name: 'Ben Carter', description: 'Tool owner', feedback: 'Would list a drill with a refundable deposit and clear return time.' },
      { name: 'Lena Ortiz', description: 'Occasional DIY user', feedback: 'Stopped informal borrowing because coordinating pickup was frustrating.' },
    ], abandonedAlternatives: '7 tried informal borrowing and stopped because pickup times were unreliable or they worried about damage.' },
    pilot: { residents: 30, length: 'four weeks', rentals: 12, averageRentalPrice: '$8', platformFee: '20%', platformRevenue: '$19.20', lateReturns: 1, reportedLosses: 0, repeatRenters: 4 },
    pricing: 'A 20% fee on completed rentals; owners set rental prices. No subscription. The pilot average was $8 per rental.',
    technology: 'A working web listing and booking prototype. Identity checks, a $25 refundable deposit and handover checks are handled manually. No insurance partnership is in place.',
    reliability: 'All 12 pilot bookings completed. One tool was returned a day late; support arranged its return. This small pilot does not establish damage or fraud rates.',
    economics: 'A typical $8 rental earns $1.60 before payment fees and support. The founders spent $90 on neighbourhood outreach and have not established a sustainable acquisition cost.',
    team: 'Two cofounders: a web developer and a community organiser.',
    nextStep: 'Test 50 rentals with clearer return reminders and a documented damage process before expanding. This is a target.',
    funding: 'Seeking a fictional $20,000 to improve booking, deposits and customer support over three months.',
    unknowns: 'Insurance, large-scale fraud risk and long-term unit economics remain unresolved.',
  },
  {
    id: 'studysprint', name: 'StudySprint', fictional: true,
    product: 'A study planner that turns deadlines and available time into daily study tasks.',
    customers: 'First- and second-year university students taking four or more courses.',
    interviews: { count: 18, recruitment: 'A university study club and library noticeboard.', paymentFeedback: '10 said they would pay $4 per month for automatic rescheduling when they miss a task.', people: [
      { name: 'Ava Thompson', description: 'First-year biology student', feedback: 'Would pay $4 to rebuild a study plan after missing a day.' },
      { name: 'Omar Hassan', description: 'Second-year engineering student', feedback: 'Would pay $4 for a realistic daily workload across courses.' },
      { name: 'Sophie Martin', description: 'First-year history student', feedback: 'Prefers a free calendar until the app proves useful.' },
    ], abandonedAlternatives: '11 had stopped using a planner because entering deadlines took too long or a missed task made the whole schedule feel outdated.' },
    pilot: { students: 40, length: 'two weeks', returnedInWeekTwo: 26, payingStudents: 8, monthlyPrice: '$4', monthlyRevenue: '$32' },
    pricing: 'Free weekly planning; $4 per month for automatic rescheduling and multi-course planning. Eight students paid; ten interviewees expressed willingness.',
    technology: 'A working web prototype with manual deadline entry and a rules-based scheduler. No learning-management-system integration yet.',
    reliability: 'In 100 schedule checks, 95 respected the entered deadlines and available hours. Five overloaded a day and were corrected. Users can edit every task.',
    economics: 'Estimated variable cost is $0.20 per active student per month, excluding founder time and fixed hosting. A $40 campus poster test acquired the eight paying students, $5 per payer in this small sample.',
    team: 'Two student cofounders: one builds the scheduler and one runs user testing.',
    nextStep: 'Run a six-week pilot with 100 students and measure weekly use and renewal. Those results do not exist yet.',
    funding: 'Seeking a fictional $15,000 for three months of product work and campus testing.',
    unknowns: 'Grade improvement, exam-season retention and long-term willingness to pay have not been measured.',
  },
];
export function practiceCaseById(id) { return structuredClone(cases.find(c => c.id === id) ?? null); }
export function practiceCaseFromText(text) {
  if (typeof text !== 'string') return null;
  const found = cases.filter(c => new RegExp(`\\b${c.name}\\b`, 'i').test(text));
  return found.length === 1 ? structuredClone(found[0]) : null;
}
export function practiceCaseForContext(context) {
  const pinned = practiceCaseById(context.practiceCaseId);
  if (pinned) return pinned;
  for (const round of [...context.history].reverse()) {
    const found = practiceCaseFromText(round.founder);
    if (found) return found;
  }
  return null;
}
