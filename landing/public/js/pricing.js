(async function () {
  const TIER_COPY = {
    'Tier 1': {
      positioning: 'Recommended for a single-printer shop or a busy hobbyist going pro.',
      features: [
        'Unlimited customers, quotes and invoices',
        'Full costing engine (filament, time, machine wear, labour)',
        'PDF quotes/invoices with real email sending',
        'Printer, filament and consumables tracking',
      ],
    },
    'Tier 2': {
      positioning: 'Recommended for a small shop running 2-4 printers.',
      features: [
        'Unlimited customers, quotes and invoices',
        'Full costing engine (filament, time, machine wear, labour)',
        'PDF quotes/invoices with real email sending',
        'Printer, filament and consumables tracking',
      ],
    },
    'Tier 3': {
      positioning: 'Recommended for a multi-printer farm or a shop with a real staff.',
      features: [
        'Unlimited customers, quotes and invoices',
        'Full costing engine (filament, time, machine wear, labour)',
        'PDF quotes/invoices with real email sending',
        'Printer, filament and consumables tracking',
      ],
    },
  };

  const statusEl = document.getElementById('pricing-status');
  const grid = document.getElementById('tier-grid');

  function renderTierCard(plan) {
    const copy = TIER_COPY[plan.name] ?? { positioning: '', features: [] };
    const card = document.createElement('div');
    card.className = 'tier-card';

    const heading = document.createElement('h2');
    heading.textContent = plan.name;
    card.appendChild(heading);

    const positioning = document.createElement('p');
    positioning.className = 'tier-card__positioning';
    positioning.textContent = copy.positioning;
    card.appendChild(positioning);

    const price = document.createElement('p');
    price.className = 'tier-card__price';
    price.textContent = `R${plan.monthlyPrice} `;
    const perMonth = document.createElement('span');
    perMonth.textContent = '/ month';
    price.appendChild(perMonth);
    card.appendChild(price);

    const featureList = document.createElement('ul');
    featureList.className = 'tier-card__features';
    for (const feature of copy.features) {
      const li = document.createElement('li');
      li.textContent = feature;
      featureList.appendChild(li);
    }
    card.appendChild(featureList);

    const cta = document.createElement('a');
    cta.className = 'btn btn--primary';
    cta.href = '/app/register';
    cta.textContent = 'Start free trial';
    card.appendChild(cta);

    return card;
  }

  try {
    const res = await fetch('/api/public/plans');
    if (!res.ok) throw new Error('non-200 response');
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.plans) || data.plans.length === 0) {
      throw new Error('no plans returned');
    }

    for (const plan of data.plans) {
      grid.appendChild(renderTierCard(plan));
    }
    grid.hidden = false;
    statusEl.remove();
  } catch (err) {
    console.error('Failed to load plans:', err);
    statusEl.textContent = "Couldn't load pricing right now — please refresh, or contact hello@barkie.co.za.";
  }
})();
