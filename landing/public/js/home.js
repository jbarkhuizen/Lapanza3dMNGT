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
