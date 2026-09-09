import { MATERIALS } from './materials-data.js';
import { filterAndRank } from './materials-selector.js';

window.__MATERIALS__ = MATERIALS;

// ---- View switching ----
const TABS = ['selector', 'grid', 'compare'];

function switchView(name) {
  for (const tab of TABS) {
    const btn = document.getElementById(`tab-${tab}`);
    const panel = document.getElementById(`view-${tab}`);
    const active = tab === name;
    btn.setAttribute('aria-selected', String(active));
    panel.hidden = !active;
  }
}

for (const tab of TABS) {
  document.getElementById(`tab-${tab}`).addEventListener('click', () => switchView(tab));
}

// ---- Shared: printer-requirement list (used by the grid and the Selector's result cards) ----
function renderReqList(material) {
  const list = document.createElement('ul');
  list.className = 'req-list';

  const plain = (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  };
  const flagged = (text, state) => {
    const li = document.createElement('li');
    li.dataset.reqState = state;
    li.textContent = text;
    list.appendChild(li);
  };

  const req = material.printerRequirements;
  plain(`${req.nozzleTempC} °C nozzle`);
  plain(`${req.bedTempC} °C bed`);
  if (req.requiresEnclosure) flagged('Enclosure', 'hard');
  if (req.requiresHardenedNozzle) flagged('Hardened nozzle', 'hard');
  if (req.requiresDirectDrive) plain('Direct drive');
  if (req.recommendsDryFilament) flagged('Dry filament', 'soft');
  if (req.recommendsVentilation) flagged('Ventilation', 'soft');

  return list;
}

// ---- Grid view ----
const TAG_LABELS = {
  'beginner-friendly': 'Beginner-friendly',
  flexible: 'Flexible',
  'outdoor-safe': 'Outdoor-safe',
  'food-safe': 'Food-safe',
  engineering: 'Engineering',
};

function renderMaterialCard(material) {
  const card = document.createElement('div');
  card.className = 'material-card';

  const heading = document.createElement('h3');
  heading.textContent = material.name;
  card.appendChild(heading);

  const chemistry = document.createElement('p');
  chemistry.className = 'material-card__chemistry';
  chemistry.textContent = material.chemistry;
  card.appendChild(chemistry);

  const bestFor = document.createElement('p');
  bestFor.className = 'material-card__best-for';
  const bestForStrong = document.createElement('strong');
  bestForStrong.textContent = 'Best for: ';
  bestFor.appendChild(bestForStrong);
  bestFor.appendChild(document.createTextNode(material.bestFor));
  card.appendChild(bestFor);

  card.appendChild(renderReqList(material));

  const meta = document.createElement('dl');
  meta.className = 'material-card__meta';
  const metaRow = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    meta.appendChild(dt);
    meta.appendChild(dd);
  };
  metaRow('Difficulty', material.difficulty);
  metaRow('Moisture', material.moisture);
  metaRow('Abrasive', material.abrasive ? 'Yes' : 'No');
  metaRow(
    'Price',
    `R${material.priceZarPerKg.low}–R${material.priceZarPerKg.high}/kg${material.priceZarPerKg.estimated ? ' (est.)' : ''}`,
  );
  card.appendChild(meta);

  const why = document.createElement('p');
  why.className = 'material-card__why';
  const whyStrong = document.createElement('strong');
  whyStrong.textContent = 'Why choose it: ';
  why.appendChild(whyStrong);
  why.appendChild(document.createTextNode(material.whyChooseIt));
  card.appendChild(why);

  const avoid = document.createElement('p');
  avoid.className = 'material-card__avoid';
  const avoidStrong = document.createElement('strong');
  avoidStrong.textContent = 'Avoid when: ';
  avoid.appendChild(avoidStrong);
  avoid.appendChild(document.createTextNode(material.avoidWhenText));
  card.appendChild(avoid);

  return card;
}

let activeTag = null;
let searchTerm = '';

function matchesFilters(material) {
  if (activeTag && !material.tags.includes(activeTag)) return false;
  if (searchTerm) {
    const haystack = `${material.name} ${material.chemistry} ${material.bestFor}`.toLowerCase();
    if (!haystack.includes(searchTerm)) return false;
  }
  return true;
}

function renderGrid() {
  const grid = document.getElementById('material-grid');
  grid.textContent = '';
  let shown = 0;
  for (const material of MATERIALS) {
    if (matchesFilters(material)) {
      grid.appendChild(renderMaterialCard(material));
      shown += 1;
    }
  }
  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'material-grid__empty';
    empty.textContent = 'No materials match this filter — try a different tag or search term.';
    grid.appendChild(empty);
  }
}

function renderTagFilters() {
  const container = document.getElementById('tag-filters');
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'tag-filter';
  allBtn.textContent = `All materials (${MATERIALS.length})`;
  allBtn.setAttribute('aria-pressed', 'true');
  allBtn.addEventListener('click', () => {
    activeTag = null;
    for (const btn of container.querySelectorAll('.tag-filter')) {
      btn.setAttribute('aria-pressed', String(btn === allBtn));
    }
    renderGrid();
  });
  container.appendChild(allBtn);

  for (const [tag, label] of Object.entries(TAG_LABELS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-filter';
    btn.textContent = label;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      activeTag = tag;
      for (const b of container.querySelectorAll('.tag-filter')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
      renderGrid();
    });
    container.appendChild(btn);
  }
}

document.getElementById('material-search').addEventListener('input', (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderGrid();
});

renderTagFilters();
renderGrid();

// ---- Selector view state ----
const CAPABILITY_TILES = [
  { key: 'outdoorUV', label: 'Outdoor / UV exposure', desc: 'Lives in the sun, rain or wind.' },
  { key: 'flexibility', label: 'Flexibility', desc: 'Must bend, stretch, grip or seal.' },
  { key: 'chemicalResistance', label: 'Chemical resistance', desc: 'Contact with fuels, solvents or cleaning agents.' },
  { key: 'foodContact', label: 'Food contact', desc: 'Touches food or drink (read the caveat below).' },
  { key: 'easyToPrint', label: 'Easy to print', desc: 'Want it to print first-time without tuning.' },
  { key: 'lowCost', label: 'Low cost', desc: 'Price per kilogram matters to the job.' },
  { key: 'smoothAppearance', label: 'Smooth appearance', desc: 'The part is seen, not hidden inside something.' },
  { key: 'highDimensionalAccuracy', label: 'High dimensional accuracy', desc: 'Press fits, threads, mating parts.' },
];

const CAPABILITY_LABELS = Object.fromEntries(CAPABILITY_TILES.map((tile) => [tile.key, tile.label]));

function droppedReason(entry) {
  if (entry.failedCapabilityKey) {
    const label = CAPABILITY_LABELS[entry.failedCapabilityKey] ?? entry.failedCapabilityKey;
    return `Doesn’t meet your "${label}" requirement.`;
  }
  return entry.reason;
}

const printerProfile = {
  maxNozzleTempC: 260,
  maxBedTempC: 100,
  hasEnclosure: false,
  hasHardenedNozzle: false,
  hasDirectDrive: false,
};
const requiredCapabilities = {};

function renderLabeledStrong(container, text) {
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = text;
  p.appendChild(strong);
  container.appendChild(p);
  return p;
}

function renderPrinterPanel() {
  const panel = document.getElementById('selector-printer-panel');
  panel.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Your printer';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Start here — this rules more materials out than the requirements do.';
  panel.appendChild(intro);

  renderLabeledStrong(panel, 'Maximum nozzle temperature');
  const nozzleRow = document.createElement('div');
  nozzleRow.className = 'chip-row';
  for (const temp of [240, 260, 300, 350, 450]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${temp} °C`;
    chip.setAttribute('aria-pressed', String(printerProfile.maxNozzleTempC === temp));
    chip.addEventListener('click', () => {
      printerProfile.maxNozzleTempC = temp;
      renderPrinterPanel();
      renderSelectorResults();
    });
    nozzleRow.appendChild(chip);
  }
  panel.appendChild(nozzleRow);

  renderLabeledStrong(panel, 'Maximum bed temperature');
  const bedRow = document.createElement('div');
  bedRow.className = 'chip-row';
  for (const temp of [60, 80, 100, 110, 160]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = `${temp} °C`;
    chip.setAttribute('aria-pressed', String(printerProfile.maxBedTempC === temp));
    chip.addEventListener('click', () => {
      printerProfile.maxBedTempC = temp;
      renderPrinterPanel();
      renderSelectorResults();
    });
    bedRow.appendChild(chip);
  }
  panel.appendChild(bedRow);

  const toggles = [
    { key: 'hasEnclosure', label: 'Enclosed printer', desc: 'A closed chamber that holds heat in.' },
    { key: 'hasHardenedNozzle', label: 'Hardened nozzle', desc: 'Steel or ruby. Needed for anything filled.' },
    { key: 'hasDirectDrive', label: 'Direct-drive extruder', desc: 'Motor on the hotend rather than a bowden tube.' },
  ];
  for (const toggle of toggles) {
    const row = document.createElement('label');
    row.className = 'toggle-row';

    const textWrap = document.createElement('span');
    textWrap.className = 'toggle-row__text';
    const labelStrong = document.createElement('strong');
    labelStrong.textContent = toggle.label;
    const descSpan = document.createElement('span');
    descSpan.className = 'toggle-row__desc';
    descSpan.textContent = toggle.desc;
    textWrap.appendChild(labelStrong);
    textWrap.appendChild(descSpan);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = printerProfile[toggle.key];
    input.addEventListener('change', () => {
      printerProfile[toggle.key] = input.checked;
      renderSelectorResults();
    });

    row.appendChild(textWrap);
    row.appendChild(input);
    panel.appendChild(row);
  }
}

function renderCapabilityPanel() {
  const panel = document.getElementById('selector-capability-panel');
  panel.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = 'What does the part need to do?';
  panel.appendChild(heading);

  const intro = document.createElement('p');
  intro.textContent = 'Tick everything that applies. Each one is pass or fail, not a preference — anything that can’t meet it gets dropped rather than shown further down the list.';
  panel.appendChild(intro);

  const grid = document.createElement('div');
  grid.className = 'capability-grid';
  for (const tile of CAPABILITY_TILES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capability-tile';
    btn.setAttribute('aria-pressed', String(!!requiredCapabilities[tile.key]));

    const labelSpan = document.createElement('span');
    labelSpan.className = 'capability-tile__label';
    labelSpan.textContent = tile.label;
    const descSpan = document.createElement('span');
    descSpan.className = 'capability-tile__desc';
    descSpan.textContent = tile.desc;
    btn.appendChild(labelSpan);
    btn.appendChild(descSpan);

    btn.addEventListener('click', () => {
      requiredCapabilities[tile.key] = !requiredCapabilities[tile.key];
      renderCapabilityPanel();
      renderSelectorResults();
    });
    grid.appendChild(btn);
  }
  panel.appendChild(grid);
}

function renderSelectorResults() {
  const resultsEl = document.getElementById('selector-results');
  resultsEl.textContent = '';

  const { matches, dropped } = filterAndRank(window.__MATERIALS__, printerProfile, requiredCapabilities);

  if (matches.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nothing matches this combination — loosen a printer requirement or untick a capability.';
    resultsEl.appendChild(empty);
  } else {
    const best = matches[0];
    const bestCard = document.createElement('div');
    bestCard.className = 'best-match-card';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow-label';
    eyebrow.textContent = 'Best match';
    bestCard.appendChild(eyebrow);

    const nameHeading = document.createElement('h3');
    nameHeading.className = 'best-match-card__name';
    nameHeading.textContent = best.name;
    bestCard.appendChild(nameHeading);

    const whyPara = document.createElement('p');
    whyPara.className = 'best-match-card__why';
    whyPara.textContent = best.whyChooseIt;
    bestCard.appendChild(whyPara);

    const pricePara = document.createElement('p');
    pricePara.className = 'best-match-card__price';
    pricePara.textContent = `R${best.priceZarPerKg.low}–R${best.priceZarPerKg.high}/kg${best.priceZarPerKg.estimated ? ' (est.)' : ''}`;
    bestCard.appendChild(pricePara);

    bestCard.appendChild(renderReqList(best));

    const findShopsBtn = document.createElement('button');
    findShopsBtn.type = 'button';
    findShopsBtn.className = 'btn btn--ghost';
    findShopsBtn.disabled = true;
    findShopsBtn.textContent = 'Find shops printing this — Coming soon';
    bestCard.appendChild(findShopsBtn);

    resultsEl.appendChild(bestCard);

    if (matches.length > 1) {
      const altGrid = document.createElement('div');
      altGrid.className = 'alternatives-grid';
      for (const alt of matches.slice(1, 4)) {
        const altCard = document.createElement('div');
        altCard.className = 'material-card';

        const altEyebrow = document.createElement('p');
        altEyebrow.className = 'eyebrow-label';
        altEyebrow.textContent = 'Alternative';
        altCard.appendChild(altEyebrow);

        const altName = document.createElement('h4');
        altName.className = 'alternative-name';
        altName.textContent = alt.name;
        altCard.appendChild(altName);

        altCard.appendChild(renderReqList(alt));
        altGrid.appendChild(altCard);
      }
      resultsEl.appendChild(altGrid);
    }
  }

  const notRecommended = document.createElement('details');
  notRecommended.className = 'not-recommended';
  const summary = document.createElement('summary');
  summary.textContent = `Not recommended (${dropped.length})`;
  notRecommended.appendChild(summary);

  const list = document.createElement('ul');
  for (const entry of dropped) {
    const li = document.createElement('li');
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = entry.material.name;
    li.appendChild(nameStrong);
    li.appendChild(document.createTextNode(` — ${droppedReason(entry)}`));
    list.appendChild(li);
  }
  notRecommended.appendChild(list);
  resultsEl.appendChild(notRecommended);
}

function initSelectorView() {
  const container = document.getElementById('view-selector');
  container.textContent = '';

  const grid = document.createElement('div');
  grid.className = 'selector-grid';

  const printerPanel = document.createElement('div');
  printerPanel.className = 'selector-panel';
  printerPanel.id = 'selector-printer-panel';
  grid.appendChild(printerPanel);

  const capabilityPanel = document.createElement('div');
  capabilityPanel.className = 'selector-panel';
  capabilityPanel.id = 'selector-capability-panel';
  grid.appendChild(capabilityPanel);

  container.appendChild(grid);

  const results = document.createElement('div');
  results.id = 'selector-results';
  container.appendChild(results);

  renderPrinterPanel();
  renderCapabilityPanel();
  renderSelectorResults();
}

initSelectorView();

// ---- Compare view ----
const compareState = { first: null, second: null };

const COMPARE_ROWS = [
  // A higher required nozzle/bed temperature isn't an objective "win" — it's
  // a hardware-capability fact, same category as abrasiveness below. Both
  // stay informational-only (no winner highlighted) rather than misleadingly
  // rewarding whichever material happens to need more heat.
  { label: 'Nozzle temperature', get: (m) => m.printerRequirements.nozzleTempC, unit: '°C', lowerIsBetter: null },
  { label: 'Bed temperature', get: (m) => m.printerRequirements.bedTempC, unit: '°C', lowerIsBetter: null },
  { label: 'Difficulty', get: (m) => m.difficulty, rank: () => ({ Beginner: 0, Intermediate: 1, Advanced: 2 }), lowerIsBetter: true },
  { label: 'Moisture sensitivity', get: (m) => m.moisture, rank: () => ({ Low: 0, Medium: 1, High: 2 }), lowerIsBetter: true },
  { label: 'Abrasive to nozzles', get: (m) => (m.abrasive ? 'Yes' : 'No'), lowerIsBetter: null },
  { label: 'Typical price (low end)', get: (m) => m.priceZarPerKg.low, unit: '/kg', prefix: 'R', lowerIsBetter: true },
];

function renderCompareOptions(selectEl, excludeId) {
  const previousValue = selectEl.value;
  selectEl.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a material…';
  selectEl.appendChild(placeholder);

  for (const material of window.__MATERIALS__) {
    if (material.id === excludeId) continue;
    const opt = document.createElement('option');
    opt.value = material.id;
    opt.textContent = material.name;
    selectEl.appendChild(opt);
  }
  selectEl.value = previousValue;
}

function renderCompareResult() {
  const resultEl = document.getElementById('compare-result');
  resultEl.textContent = '';

  if (!compareState.first || !compareState.second) {
    const empty = document.createElement('div');
    empty.className = 'compare-empty';
    empty.textContent = 'Pick two materials to compare them side by side.';
    resultEl.appendChild(empty);
    return;
  }

  const a = window.__MATERIALS__.find((m) => m.id === compareState.first);
  const b = window.__MATERIALS__.find((m) => m.id === compareState.second);

  const table = document.createElement('table');
  table.className = 'compare-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const pointTh = document.createElement('th');
  pointTh.textContent = 'Point';
  const aTh = document.createElement('th');
  aTh.textContent = a.name;
  const bTh = document.createElement('th');
  bTh.textContent = b.name;
  headRow.appendChild(pointTh);
  headRow.appendChild(aTh);
  headRow.appendChild(bTh);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of COMPARE_ROWS) {
    const tr = document.createElement('tr');
    const aVal = row.get(a);
    const bVal = row.get(b);
    const aCell = document.createElement('td');
    const bCell = document.createElement('td');
    aCell.textContent = `${row.prefix ?? ''}${aVal}${row.unit ?? ''}`;
    bCell.textContent = `${row.prefix ?? ''}${bVal}${row.unit ?? ''}`;

    if (row.lowerIsBetter !== null) {
      // row.rank(), when present, returns a { value: rankNumber } lookup
      // table — index into it, never call the result as a function.
      const lookup = row.rank ? row.rank() : null;
      const aRank = lookup ? lookup[aVal] : aVal;
      const bRank = lookup ? lookup[bVal] : bVal;
      if (aRank !== bRank) {
        const aWins = row.lowerIsBetter ? aRank < bRank : aRank > bRank;
        aCell.dataset.winner = String(aWins);
        bCell.dataset.winner = String(!aWins);
      }
    }

    const labelCell = document.createElement('th');
    labelCell.textContent = row.label;
    tr.appendChild(labelCell);
    tr.appendChild(aCell);
    tr.appendChild(bCell);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  resultEl.appendChild(table);

  const verdict = document.createElement('p');
  verdict.style.marginTop = '16px';
  verdict.textContent = `${a.name} needs a ${a.printerRequirements.nozzleTempC}°C nozzle and ${a.difficulty.toLowerCase()}-level printing; ${b.name} needs ${b.printerRequirements.nozzleTempC}°C and is ${b.difficulty.toLowerCase()}-level. Pick whichever's requirements your printer and skill level actually clear.`;
  resultEl.appendChild(verdict);
}

function initCompareView() {
  const container = document.getElementById('view-compare');
  container.textContent = '';

  const heading = document.createElement('h2');
  heading.style.fontFamily = 'var(--font-serif)';
  heading.textContent = 'Head to head';
  container.appendChild(heading);

  const intro = document.createElement('p');
  intro.style.color = 'var(--ink-muted)';
  intro.style.fontSize = '14px';
  intro.style.margin = '0 0 16px';
  intro.textContent = 'Pick two materials and see how they actually differ.';
  container.appendChild(intro);

  const pickers = document.createElement('div');
  pickers.className = 'compare-pickers';

  const firstSelect = document.createElement('select');
  firstSelect.id = 'compare-first';
  firstSelect.setAttribute('aria-label', 'First material');

  const vsSpan = document.createElement('span');
  vsSpan.textContent = 'vs';

  const secondSelect = document.createElement('select');
  secondSelect.id = 'compare-second';
  secondSelect.setAttribute('aria-label', 'Second material');

  pickers.appendChild(firstSelect);
  pickers.appendChild(vsSpan);
  pickers.appendChild(secondSelect);
  container.appendChild(pickers);

  const result = document.createElement('div');
  result.id = 'compare-result';
  container.appendChild(result);

  renderCompareOptions(firstSelect, compareState.second);
  renderCompareOptions(secondSelect, compareState.first);

  firstSelect.addEventListener('change', () => {
    compareState.first = firstSelect.value || null;
    // Exclude whatever's now picked here from the other dropdown, so the
    // user can't compare a material against itself. If the excluded value
    // was the other dropdown's current selection, its option disappears and
    // the browser resets it to the placeholder — re-read its value so state
    // stays in sync with what's actually selected.
    renderCompareOptions(secondSelect, compareState.first);
    compareState.second = secondSelect.value || null;
    renderCompareResult();
  });
  secondSelect.addEventListener('change', () => {
    compareState.second = secondSelect.value || null;
    renderCompareOptions(firstSelect, compareState.second);
    compareState.first = firstSelect.value || null;
    renderCompareResult();
  });

  renderCompareResult();
}

initCompareView();
