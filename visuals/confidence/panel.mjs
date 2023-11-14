import { INVESTORS } from './investors.mjs';

export function mountInvestorPanel(container, controller) {
  const root = document.createElement('section');
  root.className = 'investor-panel';
  root.setAttribute('aria-label', 'Investor confidence');
  const cards = new Map();
  for (const investor of INVESTORS) {
    const card = document.createElement('article');
    card.className = 'investor-card';
    const photo = document.createElement('img');
    photo.src = new URL(investor.portrait, import.meta.url).href;
    photo.alt = `${investor.name}, fictional investor`;
    const details = document.createElement('div');
    details.className = 'investor-details';
    const title = document.createElement('h2');
    title.textContent = investor.name;
    const score = document.createElement('strong');
    const meter = document.createElement('progress');
    meter.max = 100;
    meter.setAttribute('aria-label', `${investor.name} confidence`);
    const status = document.createElement('span');
    status.className = 'investor-status';
    const reason = document.createElement('p');
    reason.setAttribute('aria-live', 'polite');
    details.append(title, score, meter, status, reason);
    card.append(photo, details);
    root.append(card);
    cards.set(investor.key, { card, score, meter, status, reason });
  }
  container.append(root);
  const labels = { engaged: 'Engaged', concerned: 'Concerned', 'nearly-out': 'Nearly out', out: 'Out', offered: 'Simulated offer' };
  const unsubscribe = controller.subscribe(states => {
    for (const state of states) {
      const view = cards.get(state.key);
      view.card.dataset.status = state.status;
      view.score.textContent = `${state.confidence} / 100`;
      view.meter.value = state.confidence;
      view.status.textContent = labels[state.status];
      view.reason.textContent = state.reason;
    }
  });
  return () => { unsubscribe(); root.remove(); };
}
