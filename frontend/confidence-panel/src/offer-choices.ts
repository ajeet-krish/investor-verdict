import type { InvestorRole } from './investor-call';

export function createOfferChoices(root: HTMLElement, seeds: { role: InvestorRole; name: string }[], hooks: {
  busy: () => boolean; decide: (role: InvestorRole, decision: 'accept' | 'decline') => void;
}) {
  let roles: InvestorRole[] = [], buttons: HTMLButtonElement[] = [], submitted = false;
  const refresh = () => buttons.forEach(button => { button.disabled = hooks.busy() || submitted; });
  return {
    refresh,
    focus() { buttons.find(button => !button.disabled)?.focus(); },
    update(pending: InvestorRole[]) {
      roles = [...pending]; submitted = false; buttons = []; root.replaceChildren(); root.hidden = !roles.length;
      if (!roles.length) return;
      const title = document.createElement('h2'), caption = document.createElement('p');
      title.textContent = roles.length > 1 ? 'You have investment offers' : 'You have an investment offer';
      caption.textContent = 'Accept an offer to win this practice round, or decline it to continue with the remaining investors.';
      root.append(title, caption);
      for (const role of roles) {
        const card = document.createElement('div'), name = document.createElement('strong');
        card.className = 'offer-card'; name.textContent = seeds.find(s => s.role === role)!.name;
        card.append(name);
        for (const decision of ['accept', 'decline'] as const) {
          const button = document.createElement('button'); button.type = 'button';
          button.className = `offer-${decision}`; button.textContent = decision === 'accept' ? 'Accept offer' : 'Decline';
          button.setAttribute('aria-label', `${decision === 'accept' ? 'Accept' : 'Decline'} ${name.textContent}'s simulated offer`);
          button.addEventListener('click', () => {
            if (hooks.busy() || submitted || !roles.includes(role)) return;
            submitted = true; refresh(); hooks.decide(role, decision);
          });
          buttons.push(button); card.append(button);
        }
        root.append(card);
      }
      refresh();
    },
    failed() { submitted = false; refresh(); },
  };
}
