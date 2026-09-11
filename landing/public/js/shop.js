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
    renderServices(data.shop);
    renderHours(data.shop);
    renderGallery(data.shop);
    renderContact(data.shop);
  } catch (err) {
    showNotFound();
  }
}

loadShop();
