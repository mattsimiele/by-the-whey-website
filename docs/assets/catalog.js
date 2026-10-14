import { CATEGORIES, getPublicCatalog, locationLabel, ratingLabel } from './catalog-api.js';

const state = { catalog: [], query: '', category: 'All', availability: 'all', sort: 'Highest rated' };
const grid = document.querySelector('[data-catalog-grid]');
const status = document.querySelector('[data-catalog-status]');
const empty = document.querySelector('[data-catalog-empty]');
const retry = document.querySelector('[data-catalog-retry]');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function visibleCatalog() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.catalog.filter((cheese) => {
    const text = [cheese.name, cheese.creamery_name, locationLabel(cheese), cheese.milk_type, cheese.cheese_style, cheese.catalog_category, ...cheese.flavor_profile].join(' ').toLowerCase();
    return (!query || text.includes(query)) && (state.category === 'All' || cheese.catalog_category === state.category) && (state.availability !== 'available' || cheese.in_curd_nerd_case);
  });
  return filtered.sort((a, b) => {
    if (state.sort === 'Highest rated') return b.average_rating - a.average_rating || b.rating_count - a.rating_count || a.name.localeCompare(b.name);
    if (state.sort === 'In the case first') return Number(b.in_curd_nerd_case) - Number(a.in_curd_nerd_case) || b.average_rating - a.average_rating || a.name.localeCompare(b.name);
    if (state.sort === 'Most tasted') return b.rating_count - a.rating_count || b.average_rating - a.average_rating || a.name.localeCompare(b.name);
    if (state.sort === 'Recently added') return new Date(b.created_at) - new Date(a.created_at);
    return a.name.localeCompare(b.name);
  });
}

function card(cheese) {
  const image = cheese.image_url
    ? `<img src="${escapeHtml(cheese.image_url)}" alt="${escapeHtml(cheese.name)} cheese" loading="lazy">`
    : `<div class="catalog-card-placeholder"><img src="/assets/by-the-whey-character.png?v=20260819-art-r2" alt="" loading="lazy"></div>`;
  return `<article class="public-cheese-card">
    <a class="public-cheese-image" href="/cheese/${encodeURIComponent(cheese.slug)}/">${image}</a>
    <div class="public-cheese-copy">
      <div class="public-cheese-meta"><span>${escapeHtml(cheese.catalog_category || cheese.cheese_style)}</span><span aria-label="${escapeHtml(ratingLabel(cheese))}">${cheese.rating_count ? `★ ${cheese.average_rating.toFixed(1)}` : 'New'}</span></div>
      <h2><a href="/cheese/${encodeURIComponent(cheese.slug)}/">${escapeHtml(cheese.name)}</a></h2>
      <p class="public-cheese-maker">${escapeHtml(cheese.creamery_name)}</p>
      <p>${escapeHtml(locationLabel(cheese))}</p>
      <p class="case-status ${cheese.in_curd_nerd_case ? 'is-available' : 'is-unavailable'}"><span aria-hidden="true">${cheese.in_curd_nerd_case ? '●' : '○'}</span> ${cheese.in_curd_nerd_case ? 'In the case at The Curd Nerd' : 'Not currently in the case'}${cheese.case_availability_updated_at ? `<small>Updated ${new Date(cheese.case_availability_updated_at).toLocaleDateString()}</small>` : ''}</p>
      <a class="card-link" href="/cheese/${encodeURIComponent(cheese.slug)}/">Explore this cheese <span aria-hidden="true">→</span></a>
    </div>
  </article>`;
}

function render() {
  const matches = visibleCatalog();
  grid.innerHTML = matches.map(card).join('');
  empty.hidden = matches.length > 0;
  status.textContent = `${matches.length} ${matches.length === 1 ? 'cheese' : 'cheeses'}${state.category === 'All' ? '' : ` in ${state.category}`}`;
}

function populateCategories() {
  const select = document.querySelector('[data-category-filter]');
  CATEGORIES.forEach((category) => select.insertAdjacentHTML('beforeend', `<option>${escapeHtml(category)}</option>`));
}

async function load() {
  retry.hidden = true;
  status.textContent = 'Loading the cheese catalog…';
  grid.setAttribute('aria-busy', 'true');
  try {
    state.catalog = await getPublicCatalog();
    render();
  } catch (error) {
    status.textContent = 'The catalog could not be loaded. Check your connection and try again.';
    retry.hidden = false;
  } finally {
    grid.removeAttribute('aria-busy');
  }
}

document.querySelector('[data-catalog-search]').addEventListener('input', (event) => { state.query = event.target.value; render(); });
document.querySelector('[data-category-filter]').addEventListener('change', (event) => { state.category = event.target.value; render(); });
document.querySelector('[data-availability-filter]').addEventListener('change', (event) => { state.availability = event.target.value; render(); });
document.querySelector('[data-sort]').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
retry.addEventListener('click', load);
populateCategories();
load();
