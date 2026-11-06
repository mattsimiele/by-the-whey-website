import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../docs/assets/cheese.js', import.meta.url), 'utf8');
const route = await readFile(new URL('../docs/assets/cheese-route.js', import.meta.url), 'utf8');
function element() {
  return { hidden: false, dataset: {}, textContent: '', classList: { toggle() {} },
    setAttribute() {}, removeAttribute() {}, closest() { return null; },
    addEventListener(type, callback) { this[type] = callback; } };
}
async function detail(fetchCheese, search = '?slug=just-approved') {
  const selectors = ['[data-cheese-page]', '.cheese-detail', '[data-cheese-status]', '[data-cheese-retry]', '[data-cheese-name]', '[data-cheese-photo]', 'link[rel="canonical"]', 'meta[name="description"]', 'a[href^="bythewhey://cheese/"]'];
  const nodes = new Map(selectors.map((s) => [s, element()]));
  nodes.get('.cheese-detail').hidden = true;
  const document = { title: '', querySelector: (s) => nodes.get(s), querySelectorAll: (s) => nodes.has(s) ? [nodes.get(s)] : [] };
  const context = vm.createContext({ document, window: { location: { search } }, URLSearchParams,
    getPublicCheese: fetchCheese, locationLabel: () => 'New York', ratingLabel: () => 'Not rated yet' });
  vm.runInContext(source.replace(/^import .*;\n/, ''), context);
  await vm.runInContext('loadCheese()', context);
  return { nodes, document, context };
}
const cheese = { name: 'Just Approved', slug: 'just-approved', creamery_name: 'Test Creamery', flavor_profile: [], pairings: [], rating_count: 0 };

test('a newly approved cheese loads without a generated page and has the correct app link', async () => {
  const { nodes, document } = await detail(async (slug) => { assert.equal(slug, cheese.slug); return cheese; });
  assert.equal(nodes.get('.cheese-detail').hidden, false);
  assert.equal(nodes.get('[data-cheese-name]').textContent, cheese.name);
  assert.equal(nodes.get('a[href^="bythewhey://cheese/"]').href, 'bythewhey://cheese/just-approved');
  assert.match(document.title, /Just Approved/);
  assert.equal(nodes.get('[data-cheese-page]').dataset.live, 'true');
});

test('unpublished or unknown cheeses show an unavailable state', async () => {
  const { nodes } = await detail(async () => null);
  assert.equal(nodes.get('.cheese-detail').hidden, true);
  assert.match(nodes.get('[data-cheese-status]').textContent, /not available/);
});

test('network failure offers a retry that can recover', async () => {
  let failing = true;
  const { nodes, context } = await detail(async () => { if (failing) throw Error('offline'); return cheese; });
  assert.equal(nodes.get('[data-cheese-retry]').hidden, false);
  assert.equal(nodes.get('.cheese-detail').hidden, true);
  failing = false;
  await vm.runInContext('loadCheese()', context);
  assert.equal(nodes.get('.cheese-detail').hidden, false);
  assert.equal(nodes.get('[data-cheese-retry]').hidden, true);
});

test('pretty links for newly approved cheeses redirect; unrelated and malformed paths do not', () => {
  for (const [pathname, expected] of [
    ['/cheese/just-approved/', '/cheese/?slug=just-approved'],
    ['/cheese/t%C3%AAte/', '/cheese/?slug=t%C3%AAte'],
    ['/other/page/', undefined], ['/cheese/%zz/', undefined], ['/cheese/index.html', undefined],
  ]) {
    let destination;
    vm.runInNewContext(route, { window: { location: { pathname, replace(value) { destination = value; } } } });
    assert.equal(destination, expected);
  }
});

test('catalog cards point to the shared page, which survives optional generation', async () => {
  const catalog = await readFile(new URL('../docs/assets/catalog.js', import.meta.url), 'utf8');
  assert.equal((catalog.match(/href="\/cheese\/\?slug=/g) || []).length, 3);
  const page = await readFile(new URL('../docs/cheese/index.html', import.meta.url), 'utf8');
  assert.match(page, /data-cheese-status/);
  assert.doesNotMatch(page, /data-cheese-slug=/);
  const generator = await readFile(new URL('../scripts/generate-web-catalog.mjs', import.meta.url), 'utf8');
  assert.match(generator, /entry\.isDirectory\(\)/);
});
