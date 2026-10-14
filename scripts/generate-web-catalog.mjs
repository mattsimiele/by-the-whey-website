import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs');
const cheeseRoot = path.join(docsRoot, 'cheese');
const siteUrl = 'https://bythe-whey.com';
const supabaseUrl = 'https://sxfulqjshurmegsvcsrm.supabase.co';
const publishableKey = 'sb_publishable_nGe3mfatg8TIdfWFNgu9_w_jt3FQDou';
const headers = { apikey: publishableKey, 'Content-Type': 'application/json' };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function descriptionFor(cheese) {
  const text = stripHtml(`${cheese.name} by ${cheese.creamery_name}. ${cheese.story_notes}`);
  return text.length > 190 ? `${text.slice(0, 187).trimEnd()}…` : text;
}

function locationLabel(cheese) {
  return [cheese.location_city, cheese.location_region, cheese.location_country].filter(Boolean).join(', ');
}

function publicPhotoUrl(storagePath) {
  if (!storagePath) return `${siteUrl}/assets/by-the-whey-character.png?v=20260819-art-r2`;
  return `${supabaseUrl}/storage/v1/object/public/cheese-photos/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function request(relativeUrl, options = {}) {
  const response = await fetch(`${supabaseUrl}${relativeUrl}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function loadCatalog() {
  const select = encodeURIComponent('*,cheese_photos(storage_path,moderation_status)');
  const [rows, ratingRows] = await Promise.all([
    request(`/rest/v1/cheeses?select=${select}&status=eq.published&order=name.asc`),
    request('/rest/v1/rpc/cheese_rating_summary', { method: 'POST', body: '{}' }),
  ]);
  const ratings = new Map(ratingRows.map((row) => [row.cheese_id, { average: Number(row.average_rating), count: Number(row.rating_count) }]));
  return rows.map((row) => {
    const photo = row.cheese_photos?.find((item) => item.moderation_status === 'approved');
    const storagePath = photo?.storage_path ?? row.image_path;
    return { ...row, image_url: publicPhotoUrl(storagePath), has_photo: Boolean(storagePath), rating: ratings.get(row.id) ?? { average: 0, count: 0 } };
  });
}

function listMarkup(values, className, attribute) {
  return `<ul class="${className}" ${attribute}>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function fact(label, value, attribute) {
  return `<div class="cheese-fact"><span>${escapeHtml(label)}</span><strong ${attribute}>${escapeHtml(value || 'Not specified')}</strong></div>`;
}

function detailPage(cheese) {
  const canonical = `${siteUrl}/cheese/${encodeURIComponent(cheese.slug)}/`;
  const description = descriptionFor(cheese);
  const ratingText = cheese.rating.count ? cheese.rating.average.toFixed(1) : '—';
  const ratingLabel = cheese.rating.count ? `${cheese.rating.average.toFixed(1)} from ${cheese.rating.count} ${cheese.rating.count === 1 ? 'tasting' : 'tastings'}` : 'Not rated yet';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: cheese.name, description, image: cheese.image_url,
    brand: { '@type': 'Brand', name: cheese.creamery_name }, category: cheese.catalog_category || cheese.cheese_style,
    aggregateRating: cheese.rating.count ? { '@type': 'AggregateRating', ratingValue: cheese.rating.average, ratingCount: cheese.rating.count, bestRating: 5, worstRating: 0.5 } : undefined,
    url: canonical,
  }).replace(/</g, '\\u003c');
  const photoClass = cheese.has_photo ? '' : ' is-placeholder';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#9ed6f9">
  <meta property="og:title" content="${escapeHtml(cheese.name)} — By the Whey"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${escapeHtml(cheese.image_url)}"><meta name="twitter:card" content="summary_large_image">
  <title>${escapeHtml(cheese.name)} by ${escapeHtml(cheese.creamery_name)} — By the Whey</title><link rel="canonical" href="${canonical}">
  <link rel="icon" href="/assets/by-the-whey-icon.png?v=20260819-art-r2"><link rel="stylesheet" href="/assets/styles.css?v=20260830-navigation"><link rel="stylesheet" href="/assets/catalog.css?v=20260901-availability-push">
  <script type="application/ld+json">${jsonLd}</script><script src="/assets/site.js?v=20260830-navigation" defer></script><script type="module" src="/assets/cheese.js?v=20260901-availability-push"></script>
</head>
<body data-cheese-page data-cheese-slug="${escapeHtml(cheese.slug)}">
  <header class="site-header"><div class="shell nav"><a class="wordmark" href="/" aria-label="By the Whey home"><img class="wordmark-mark" src="/assets/by-the-whey-character.png?v=20260819-art-r2" alt=""><span><strong>By the Whey</strong><small>Built by The Curd Nerd</small></span></a><button class="menu-toggle" type="button" aria-expanded="false" data-menu-toggle>Menu</button><nav class="nav-links" data-menu><a href="/">Home</a><a href="/catalog/">Catalog</a><a href="/guidelines/">Community</a><a href="/manage/">Catalog Studio</a><a class="nav-cta" href="mailto:support@thecurdnerd.com?subject=Join%20the%20By%20the%20Whey%20beta">Join the beta</a></nav></div></header>
  <main><div class="shell cheese-breadcrumbs"><a href="/catalog/">Catalog</a> <span aria-hidden="true">/</span> <span data-cheese-name>${escapeHtml(cheese.name)}</span></div>
    <section class="cheese-detail"><div class="shell cheese-detail-grid">
      <div class="cheese-detail-photo${photoClass}"><img data-cheese-photo src="${escapeHtml(cheese.image_url)}" alt="${cheese.has_photo ? `${escapeHtml(cheese.name)} cheese` : ''}"></div>
      <article class="cheese-detail-copy"><p class="eyebrow" data-cheese-category>${escapeHtml(cheese.catalog_category || cheese.cheese_style)}</p><h1 data-cheese-name>${escapeHtml(cheese.name)}</h1>
        <p class="cheese-byline">Made by <strong data-cheese-creamery>${escapeHtml(cheese.creamery_name)}</strong> · <span data-cheese-location>${escapeHtml(locationLabel(cheese))}</span></p>
        <div class="cheese-rating-panel"><strong>★ <span data-cheese-rating>${ratingText}</span></strong><span data-cheese-rating-count>${escapeHtml(ratingLabel)}</span></div>
        <p class="cheese-story" data-cheese-story>${escapeHtml(cheese.story_notes)}</p>
        <div class="cheese-facts">${fact('Creamery', cheese.creamery_name, 'data-cheese-creamery')}${fact('Location', locationLabel(cheese), 'data-cheese-location')}${fact('Milk type', cheese.milk_type, 'data-cheese-milk')}${fact('Rennet', cheese.rennet, 'data-cheese-rennet')}${fact('Style', cheese.cheese_style, 'data-cheese-style')}${fact('Age', cheese.age_description, 'data-cheese-age')}${fact('In the Case at The Curd Nerd?', cheese.in_curd_nerd_case ? 'Yes' : 'No', 'data-cheese-case')}${fact('Availability updated', cheese.case_availability_updated_at ? new Date(cheese.case_availability_updated_at).toLocaleDateString('en-US') : 'Not yet confirmed', 'data-cheese-case-updated')}</div>
        <section class="cheese-section"><h2>Flavor profile</h2>${listMarkup(cheese.flavor_profile, 'flavor-list', 'data-cheese-flavors')}</section>
        <section class="cheese-section"><h2>Pair it with</h2>${listMarkup(cheese.pairings, 'pairing-list', 'data-cheese-pairings')}</section>
        <div class="cheese-actions"><a class="button" href="bythewhey://cheese/${encodeURIComponent(cheese.slug)}">Open in By the Whey</a><a class="button secondary" href="mailto:support@thecurdnerd.com?subject=Join%20the%20By%20the%20Whey%20beta">Join the beta</a></div>
        <p class="live-notice" data-live-notice hidden>Showing the latest generated catalog information. Live refresh is temporarily unavailable.</p>
      </article>
    </div></section>
  </main>
  <footer class="site-footer"><div class="shell"><div class="footer-grid"><a class="wordmark" href="/"><img class="wordmark-mark" src="/assets/by-the-whey-character.png?v=20260819-art-r2" alt=""><span><strong>By the Whey</strong><small>Built by The Curd Nerd</small></span></a><nav class="footer-links"><a href="/catalog/">Catalog</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/support/">Support</a></nav></div><p class="copyright">© 2026 The Curd Nerd LLC. By the Whey is currently in beta.</p></div></footer>
</body></html>`;
}

async function removeStalePages(validSlugs) {
  await mkdir(cheeseRoot, { recursive: true });
  for (const entry of await readdir(cheeseRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !validSlugs.has(entry.name)) await rm(path.join(cheeseRoot, entry.name), { recursive: true });
  }
}

async function writeSitemap(catalog) {
  const fixedRoutes = ['', 'catalog/', 'privacy/', 'terms/', 'guidelines/', 'support/', 'delete-account/'];
  const urls = [...fixedRoutes.map((route) => `${siteUrl}/${route}`), ...catalog.map((cheese) => `${siteUrl}/cheese/${encodeURIComponent(cheese.slug)}/`)];
  await writeFile(path.join(docsRoot, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`);
}

const catalog = await loadCatalog();
const validSlugs = new Set(catalog.map((cheese) => cheese.slug));
await removeStalePages(validSlugs);
for (const cheese of catalog) {
  const directory = path.join(cheeseRoot, cheese.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), detailPage(cheese));
}
await writeSitemap(catalog);
await writeFile(path.join(cheeseRoot, 'generated.json'), `${JSON.stringify({ count: catalog.length, slugs: [...validSlugs] }, null, 2)}\n`);
console.log(`Generated ${catalog.length} public cheese pages in ${path.relative(projectRoot, cheeseRoot)}.`);
