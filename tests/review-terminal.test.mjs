import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Import as a browser module without changing this Expo project's module mode.
const source = await readFile(new URL('../docs/manage/review-terminal.js', import.meta.url), 'utf8');
const { needsVerification, reviewFlags, filterReviewRows, shortcutAction, persistReviewDecision } = await import(`data:text/javascript;base64,${Buffer.from(source.replace(/^import .*;\n/, '')).toString('base64')}`);
const row = { id: 'one', name: 'Cave Cheddar', status: 'pending', updated_at: '2026-11-07T00:00:00Z', creamery_name: 'Example Dairy', location_city: 'Ithaca', location_region: 'NY', location_country: 'USA', catalog_category: 'Cheddar', cheese_style: 'Clothbound', milk_type: 'Cow', rennet: 'Animal', age_description: '12 months', flavor_profile: ['Nutty', 'Sweet, creamy'], pairings: ['Apples'], story_notes: 'A cave aged cheddar.' };

test('flags missing import placeholders without treating legitimate values as missing', () => {
  for (const value of [null, '', [], 'Not provided in source', 'Unknown', 'TBD', 'Product details require verification before publishing.']) assert.equal(needsVerification(value), true);
  for (const value of ['Not applicable', 'Raw cow milk', '12 months', ['Nutty']]) assert.equal(needsVerification(value), false);
  assert.deepEqual(reviewFlags(row), []);
  assert.deepEqual(reviewFlags({ ...row, rennet: 'Not provided in source', location_country: '' }), ['Country', 'Rennet']);
});

test('a 576-entry queue filters by status, text, and verification without truncating', () => {
  const rows = Array.from({ length: 576 }, (_, i) => ({ ...row, id: String(i), status: i < 500 ? 'pending' : 'draft' }));
  assert.equal(filterReviewRows(rows).length, 500);
  assert.equal(filterReviewRows(rows, '', 'all').length, 576);
  assert.equal(filterReviewRows(rows, ' APPLES ', 'draft').length, 76);
  assert.equal(filterReviewRows(rows, '', 'all', true).length, 0);
  assert.equal(filterReviewRows([{ ...row, milk_type: 'Unknown' }], 'unknown', 'pending', true).length, 1);
});

const key = (value, extras = {}) => ({ key: value, target: { closest: () => null }, ...extras });
test('all four arrows and left-hand keys map to the advertised actions', () => {
  const bindings = { ArrowUp: 'previous', ArrowDown: 'next', ArrowLeft: 'closeDetails', ArrowRight: 'details', a: 'approve', r: 'revise', d: 'edit', e: 'note', s: 'skip', z: 'undo', '/': 'search' };
  for (const [value, action] of Object.entries(bindings)) assert.equal(shortcutAction(key(value)), action);
  assert.equal(shortcutAction(key('Enter')), null);
});

test('typing, composition, modifiers, and held decision keys never mark rows', () => {
  for (const extras of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { defaultPrevented: true }, { target: { closest: () => ({}) } }]) assert.equal(shortcutAction(key('a', extras)), null);
  assert.equal(shortcutAction(key('ArrowDown', { repeat: true })), 'next');
});

function client(result) {
  const calls = [];
  const query = {
    update(payload) { calls.push(['update', payload]); return this; },
    eq(field, value) { calls.push(['eq', field, value]); return this; },
    select() { return this; },
    async maybeSingle() { return result; },
  };
  return { calls, from(table) { assert.equal(table, 'cheeses'); return query; } };
}
test('approval persists attribution and guards against changed status and reviewed content', async () => {
  const api = client({ data: { ...row, status: 'published', approved_by: 'admin' } });
  const saved = await persistReviewDecision(api, row, 'published', 'admin');
  assert.equal(saved.status, 'published');
  assert.equal(api.calls[0][1].approved_by, 'admin');
  assert.ok(api.calls.some((call) => call[1] === 'status' && call[2] === 'pending'));
  assert.ok(api.calls.some((call) => call[1] === 'updated_at' && call[2] === row.updated_at));
  assert.ok(api.calls.some((call) => call[1] === 'story_notes' && call[2] === row.story_notes));
  assert.ok(api.calls.some((call) => call[1] === 'flavor_profile' && call[2] === '{"Nutty","Sweet, creamy"}'));
});
test('revise is a durable draft and undo restores the original status and attribution', async () => {
  const api = client({ data: { ...row, status: 'draft' } });
  await persistReviewDecision(api, row, 'draft', 'admin');
  assert.equal(api.calls[0][1].status, 'draft');
  assert.equal(api.calls[0][1].approved_by, null);
  const undo = client({ data: row });
  await persistReviewDecision(undo, { ...row, status: 'published' }, row.status, 'admin', null);
  assert.equal(undo.calls[0][1].status, 'pending');
  assert.equal(undo.calls[0][1].approved_by, null);
});
test('conflicts, denied writes, and network errors are surfaced without claiming success', async () => {
  await assert.rejects(persistReviewDecision(client({ data: null }), row, 'published', 'admin'), /record changed/);
  await assert.rejects(persistReviewDecision(client({ error: Error('Permission denied') }), row, 'draft', 'admin'), /Permission denied/);
  const api = { from() { throw Error('Offline'); } };
  await assert.rejects(persistReviewDecision(api, row, 'published', 'admin'), /Offline/);
  await assert.rejects(persistReviewDecision(api, row, 'deleted', 'admin'), /Invalid/);
});
