// Every element below is built with document.createElement/.textContent/
// .appendChild only (no raw-markup DOM APIs), so untrusted shop data
// (business name, tagline, services, etc.) can never be interpreted as markup.

function showNotFound() {
  document.getElementById('shop-header').replaceChildren();
  document.getElementById('shop-not-found').hidden = false;
}

function renderHeader(shop) {
  const header = document.getElementById('shop-header');
  header.replaceChildren();

  const heading = document.createElement('h1');
  heading.textContent = shop.businessName;
  header.appendChild(heading);

  if (shop.shopTagline) {
    const tagline = document.createElement('p');
    tagline.className = 'shop-tagline';
    tagline.textContent = shop.shopTagline;
    header.appendChild(tagline);
  }

  if (shop.city) {
    const city = document.createElement('p');
    city.className = 'shop-city';
    city.textContent = shop.city;
    header.appendChild(city);
  }

  if (shop.shopAvailability) {
    const availability = document.createElement('p');
    availability.className = 'shop-availability';
    availability.textContent = shop.shopAvailability;
    header.appendChild(availability);
  }
}

function renderAbout(shop) {
  if (!shop.shopAboutText) return;
  const section = document.getElementById('shop-about-section');
  const about = document.getElementById('shop-about');
  const paragraphs = shop.shopAboutText.split('\n\n').map((p) => p.trim()).filter((p) => p.length > 0);
  for (const paragraph of paragraphs) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    about.appendChild(p);
  }
  section.hidden = false;
}

function renderServices(shop) {
  if (!Array.isArray(shop.shopServices) || shop.shopServices.length === 0) return;
  const section = document.getElementById('shop-services-section');
  const list = document.getElementById('shop-services');
  for (const service of shop.shopServices) {
    const item = document.createElement('li');
    item.textContent = service;
    list.appendChild(item);
  }
  section.hidden = false;
}

function renderHours(shop) {
  if (!shop.shopHoursText) return;
  const section = document.getElementById('shop-hours-section');
  const hours = document.getElementById('shop-hours');
  hours.textContent = shop.shopHoursText;
  section.hidden = false;
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function renderTradingHours(shop) {
  const hours = shop.shopTradingHours;
  if (!hours || typeof hours !== 'object') return;
  const days = DAY_ORDER.filter((day) => hours[day]);
  if (days.length === 0) return;

  const section = document.getElementById('shop-trading-hours-section');
  const list = document.getElementById('shop-trading-hours');
  for (const day of days) {
    const dayHours = hours[day];
    const item = document.createElement('li');

    const label = document.createElement('span');
    label.className = 'shop-trading-hours__day';
    label.textContent = day.charAt(0).toUpperCase() + day.slice(1);
    item.appendChild(label);

    const value = document.createElement('span');
    value.textContent = dayHours.open ? `${dayHours.start} – ${dayHours.end}` : 'Closed';
    item.appendChild(value);

    list.appendChild(item);
  }
  section.hidden = false;
}

const SOCIAL_LINKS = [
  ['shopFacebookUrl', 'Facebook'],
  ['shopInstagramUrl', 'Instagram'],
  ['shopTwitterUrl', 'X / Twitter'],
  ['shopTiktokUrl', 'TikTok'],
  ['shopYoutubeUrl', 'YouTube'],
  ['shopLinkedinUrl', 'LinkedIn'],
  ['shopDiscordUrl', 'Discord'],
];

const MARKETPLACE_LINKS = [
  ['shopCults3dUrl', 'Cults3D'],
  ['shopPrintablesUrl', 'Printables'],
  ['shopThingiverseUrl', 'Thingiverse'],
  ['shopMakerworldUrl', 'MakerWorld'],
  ['shopThangsUrl', 'Thangs'],
  ['shopCrealityCloudUrl', 'Creality Cloud'],
  ['shopGrabcadUrl', 'GrabCAD'],
];

// Shared by renderSocial/renderMarketplace -- both are just a list of
// (field, label) pairs rendered as plain-text links when the field is set.
// No brand icon assets are added here (see design spec: text labels are an
// acceptable substitute for this pass).
function renderLinkRow(shop, sectionId, listId, fields) {
  const section = document.getElementById(sectionId);
  const list = document.getElementById(listId);
  let hasAny = false;
  for (const [field, label] of fields) {
    if (!shop[field]) continue;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'btn btn--ghost';
    link.href = shop[field];
    link.textContent = label;
    item.appendChild(link);
    list.appendChild(item);
    hasAny = true;
  }
  if (hasAny) {
    section.hidden = false;
  }
}

function renderSocial(shop) {
  renderLinkRow(shop, 'shop-social-section', 'shop-social-links', SOCIAL_LINKS);
}

function renderMarketplace(shop) {
  renderLinkRow(shop, 'shop-marketplace-section', 'shop-marketplace-links', MARKETPLACE_LINKS);
}

function renderGallery(shop) {
  if (!Array.isArray(shop.shopGalleryUrls) || shop.shopGalleryUrls.length === 0) return;
  const section = document.getElementById('shop-gallery-section');
  const gallery = document.getElementById('shop-gallery');
  for (const url of shop.shopGalleryUrls) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = `${shop.businessName} gallery photo`;
    img.loading = 'lazy';
    gallery.appendChild(img);
  }
  section.hidden = false;
}

function addContactLink(list, href, label) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'btn btn--ghost';
  link.href = href;
  link.textContent = label;
  item.appendChild(link);
  list.appendChild(item);
}

function renderContact(shop) {
  const list = document.getElementById('shop-contact-links');
  let hasAny = false;

  if (shop.shopContactWhatsapp) {
    const digits = shop.shopContactWhatsapp.replace(/[^\d]/g, '');
    addContactLink(list, `https://wa.me/${digits}`, 'WhatsApp');
    hasAny = true;
  }
  if (shop.phone) {
    addContactLink(list, `tel:${shop.phone}`, shop.phone);
    hasAny = true;
  }
  if (shop.email) {
    addContactLink(list, `mailto:${shop.email}`, shop.email);
    hasAny = true;
  }
  if (shop.website) {
    addContactLink(list, shop.website, 'Website');
    hasAny = true;
  }
  if (shop.shopGoogleReviewsUrl) {
    addContactLink(list, shop.shopGoogleReviewsUrl, 'Google reviews');
    hasAny = true;
  }

  if (hasAny) {
    document.getElementById('shop-contact-section').hidden = false;
  }
}

async function loadShop() {
  // Path is /shop/<slug>
  const match = location.pathname.match(/^\/shop\/([^/]+)\/?$/);
  const slug = match ? decodeURIComponent(match[1]) : '';
  if (!slug) {
    showNotFound();
    return;
  }

  try {
    const res = await fetch(`/api/public/shop/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      showNotFound();
      return;
    }
    const data = await res.json();
    if (!data.ok || !data.shop) {
      showNotFound();
      return;
    }

    document.title = `${data.shop.businessName} — Barkie`;
    renderHeader(data.shop);
    renderAbout(data.shop);
    renderServices(data.shop);
    renderHours(data.shop);
    renderTradingHours(data.shop);
    renderGallery(data.shop);
    renderSocial(data.shop);
    renderMarketplace(data.shop);
    renderContact(data.shop);
  } catch (err) {
    showNotFound();
  }
}

loadShop();
