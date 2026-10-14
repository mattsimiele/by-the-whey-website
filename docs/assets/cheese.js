import { getPublicCheese, locationLabel, ratingLabel } from './catalog-api.js';

const root = document.querySelector('[data-cheese-page]');
const slug = root?.dataset.cheeseSlug;

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
  if (photo && cheese.image_url) {
    photo.src = cheese.image_url;
    photo.alt = `${cheese.name} cheese`;
    photo.closest('.cheese-detail-photo')?.classList.remove('is-placeholder');
  }
}

if (slug) {
  getPublicCheese(slug).then((cheese) => {
    if (cheese) refresh(cheese);
    root.dataset.live = 'true';
  }).catch(() => {
    const notice = document.querySelector('[data-live-notice]');
    if (notice) notice.hidden = false;
  });
}
