import { MATERIALS } from './materials-data.js';

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
  for (const material of MATERIALS) {
    if (matchesFilters(material)) {
      grid.appendChild(renderMaterialCard(material));
    }
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
