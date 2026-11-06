import { getPublicCheese, locationLabel, ratingLabel } from './catalog-api.js';

const root = document.querySelector('[data-cheese-page]');
const slug = new URLSearchParams(window.location.search).get('slug') || root?.dataset.cheeseSlug;
const dynamicPage = !root?.dataset.cheeseSlug;

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value || 'Not specified'; });
}

function setList(selector, values) {
  const list = document.querySelector(selector);
  if (list) list.innerHTML = values.map((value) => `<li>${String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))}</li>`).join('');
}

function refresh(cheese) {
  setText('[data-cheese-name]', cheese.name);
  setText('[data-cheese-category]', cheese.catalog_category || cheese.cheese_style);
  setText('[data-cheese-creamery]', cheese.creamery_name);
  setText('[data-cheese-location]', locationLabel(cheese));
  setText('[data-cheese-milk]', cheese.milk_type);
  setText('[data-cheese-rennet]', cheese.rennet);
  setText('[data-cheese-style]', cheese.cheese_style);
  setText('[data-cheese-age]', cheese.age_description);
  setText('[data-cheese-case]', cheese.in_curd_nerd_case ? 'Yes' : 'No');
  setText('[data-cheese-case-updated]', cheese.case_availability_updated_at ? new Date(cheese.case_availability_updated_at).toLocaleDateString() : 'Not yet confirmed');
  setText('[data-cheese-story]', cheese.story_notes);
  setText('[data-cheese-rating]', cheese.rating_count ? cheese.average_rating.toFixed(1) : '—');
  setText('[data-cheese-rating-count]', ratingLabel(cheese));
  setList('[data-cheese-flavors]', cheese.flavor_profile);
  setList('[data-cheese-pairings]', cheese.pairings);
  const photo = document.querySelector('[data-cheese-photo]');
  if (photo) {
    photo.src = cheese.image_url || '/assets/by-the-whey-character.png?v=20260819-art-r2';
    photo.alt = cheese.image_url ? `${cheese.name} cheese` : '';
    photo.closest('.cheese-detail-photo')?.classList.toggle('is-placeholder', !cheese.image_url);
  }
  document.title = `${cheese.name} by ${cheese.creamery_name} — By the Whey`;
  document.querySelectorAll('a[href^="bythewhey://cheese/"]').forEach((link) => {
    link.href = `bythewhey://cheese/${encodeURIComponent(cheese.slug)}`;
  });
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical && dynamicPage) canonical.href = `https://bythe-whey.com/cheese/?slug=${encodeURIComponent(cheese.slug)}`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = `${cheese.name} by ${cheese.creamery_name}. ${cheese.story_notes || ''}`;

}

const detail = document.querySelector('.cheese-detail');
const pageStatus = document.querySelector('[data-cheese-status]');
const retry = document.querySelector('[data-cheese-retry]');

async function loadCheese() {
  if (retry) retry.hidden = true;
  if (pageStatus) pageStatus.textContent = 'Loading cheese…';
  root?.setAttribute('aria-busy', 'true');
  try {
    const cheese = slug ? await getPublicCheese(slug) : null;
    if (!cheese) {
      if (detail) detail.hidden = true;
      setText('[data-cheese-name]', 'Cheese unavailable');
      document.title = 'Cheese unavailable — By the Whey';
      if (pageStatus) pageStatus.textContent = 'This cheese is not available in the published catalog. Explore the catalog for more cheeses.';
      else if (detail) {
        const message = document.createElement('p');
        message.className = 'shell';
        message.textContent = 'This cheese is no longer available in the published catalog.';
        detail.before(message);
      }
      return;
    }
    refresh(cheese);
    if (detail) detail.hidden = false;
    if (pageStatus) pageStatus.hidden = true;
    root.dataset.live = 'true';
  } catch {
    if (pageStatus) pageStatus.textContent = 'This cheese could not be loaded. Check your connection and try again.';
    if (retry) retry.hidden = false;
    const notice = document.querySelector('[data-live-notice]');
    if (notice && !dynamicPage) notice.hidden = false;
  } finally {
    root?.removeAttribute('aria-busy');
  }
}
retry?.addEventListener('click', loadCheese);
loadCheese();
