(async function () {
  const strip = document.getElementById('stats-strip');
  const businessesEl = document.getElementById('stat-businesses');
  const subscriptionsEl = document.getElementById('stat-subscriptions');

  try {
    const res = await fetch('/api/public/stats');
    if (!res.ok) throw new Error('non-200 response');
    const data = await res.json();
    if (!data.ok) throw new Error('ok:false response');

    businessesEl.textContent = String(data.registeredBusinesses);
    subscriptionsEl.textContent = String(data.activeSubscriptions);
    strip.hidden = false;
  } catch (err) {
    // A marketing page silently showing no stats is better than a
    // visibly-broken widget — leave the strip hidden.
    console.error('Failed to load public stats:', err);
  }
})();

(async function () {
  const plansEl = document.getElementById('hero-plans');

  try {
    const res = await fetch('/api/public/plans');
    if (!res.ok) throw new Error('non-200 response');
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.plans) || data.plans.length === 0) {
      throw new Error('no plans returned');
    }

    const prices = data.plans.map((plan) => Number(plan.monthlyPrice));
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    plansEl.textContent = `${data.plans.length} plans, from R${min} to R${max}/month — `;
    const link = document.createElement('a');
    link.href = '/pricing.html';
    link.textContent = 'see pricing';
    plansEl.appendChild(link);
    plansEl.hidden = false;
  } catch (err) {
    // Same fallback posture as the stats strip above — hide the note
    // rather than show broken/missing pricing next to the CTA.
    console.error('Failed to load plan pricing:', err);
  }
})();
