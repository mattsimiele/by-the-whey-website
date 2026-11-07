import { createQuickNotes } from './review-notes.js?v=20261107';

const FIELDS = [
  ['creamery_name', 'Maker'], ['location_city', 'City'], ['location_region', 'Region'],
  ['location_country', 'Country'], ['catalog_category', 'Category'], ['cheese_style', 'Style'],
  ['milk_type', 'Milk'], ['rennet', 'Rennet'], ['age_description', 'Age'],
  ['flavor_profile', 'Flavor'], ['pairings', 'Pairings'], ['story_notes', 'Story'],
];
const text = (value) => Array.isArray(value) ? value.join(', ') : String(value ?? '');
const html = (value) => text(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cell = (value, small = false) => `<${small ? 'small' : 'span'} class="rt-cell-line" title="${html(value)}">${html(value) || '—'}</${small ? 'small' : 'span'}>`;
export const needsVerification = (value) => !text(value).trim() || /not provided|unknown|\btbd\b|require[s]? verification/i.test(text(value));
export const reviewFlags = (cheese) => FIELDS.filter(([key]) => needsVerification(cheese[key])).map(([, label]) => label);
export function filterReviewRows(rows, query = '', status = 'pending', flaggedOnly = false) {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (status === 'all' || row.status === status)
    && (!flaggedOnly || reviewFlags(row).length)
    && (!needle || [row.name, ...FIELDS.map(([key]) => text(row[key]))].join(' ').toLocaleLowerCase().includes(needle)));
}

// Compare the reviewed snapshot as well as status: another reviewer/editor must not be overwritten.
export async function persistReviewDecision(client, row, status, userId, approvedBy) {
  if (!['draft', 'pending', 'published'].includes(status)) throw new Error('Invalid review decision.');
  const payload = { status, approved_by: approvedBy === undefined ? (status === 'published' ? userId : null) : approvedBy, updated_at: new Date().toISOString() };
  let request = client.from('cheeses').update(payload).eq('id', row.id).eq('status', row.status);
  if (row.updated_at) request = request.eq('updated_at', row.updated_at);
  // Older clients do not bump updated_at, so also compare the content shown to this reviewer.
  for (const key of ['name', ...FIELDS.map(([field]) => field)]) {
    if (row[key] != null) request = request.eq(key, Array.isArray(row[key]) ? `{${row[key].map((value) => JSON.stringify(value)).join(',')}}` : row[key]);
  }
  const { data, error } = await request.select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This record changed or is no longer editable. Refresh the queue before reviewing it again.');
  return { ...row, ...data };
}

export function shortcutAction(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return null;
  if (event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return null;
  const key = event.key.toLowerCase();
  const action = { arrowup: 'previous', arrowdown: 'next', arrowleft: 'closeDetails', arrowright: 'details', a: 'approve', r: 'revise', s: 'skip', z: 'undo', d: 'edit', e: 'note', '/': 'search' }[key];
  if (event.repeat && !['previous', 'next'].includes(action)) return null;
  return action || null;
}

export function createReviewTerminal(root, { decide, edit, refresh, isActive, photoUrl, loadNotes, saveNote, storage }) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const $ = (selector) => root.querySelector(selector);
  let rows = [], visible = [], selectedId = null, userId = null, detailOpen = false, busy = false, loading = true, loadError = false;
  let undo = null, sessionDecisions = new Map();
  root.innerHTML = `
    <header class="rt-header"><div><span class="rt-eyebrow">BY THE WHEY / CATALOG OPERATIONS</span><h2>REVIEW TERMINAL<span class="rt-live"> ADMIN</span></h2></div><button type="button" data-rt-refresh>Refresh queue</button></header>
    <div class="rt-metrics"><div><span>Awaiting decision</span><strong data-rt-pending>—</strong></div><div><span>Revise / drafts</span><strong data-rt-drafts>—</strong></div><div><span>Reviewed this session</span><strong data-rt-reviewed>0</strong></div><div class="rt-instruction">One record. One decision.<br><span>Approve publishes immediately. Revise keeps a draft.</span></div></div>
    <div class="rt-toolbar"><label class="rt-search"><span class="sr-only">Search review entries</span><input type="search" data-rt-search placeholder="/ Search name, maker, origin, flavor…"></label><label><span class="sr-only">Review status</span><select data-rt-filter><option value="pending">Awaiting decision</option><option value="draft">Revise / drafts</option><option value="all">All unpublished</option></select></label><label class="rt-check"><input type="checkbox" data-rt-flagged>Needs verification</label><label class="rt-check"><input type="checkbox" data-rt-shortcuts checked>Shortcuts on</label></div>
    <div class="rt-status" role="status" aria-live="polite" data-rt-message>Loading review queue…</div>
    <div class="rt-workbench">
      <section class="rt-queue" aria-label="Review entries"><div class="rt-section-label"><span>01 / QUEUE</span><span data-rt-position>—</span></div>
        <div class="rt-table-scroll" tabindex="0" role="region" aria-label="Cheese queue. Use up and down arrows to select a row." data-rt-queue>
          <table><thead><tr><th scope="col">#</th><th scope="col">Cheese / maker</th><th scope="col" class="rt-col-origin">Origin</th><th scope="col">Milk</th><th scope="col" class="rt-col-classification">Style / age</th><th scope="col" class="rt-col-rennet">Rennet</th><th scope="col" class="rt-col-flavor">Flavor</th><th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody data-rt-rows></tbody></table><p class="rt-empty" data-rt-empty hidden></p>
        </div>
      </section>
      <section class="rt-inspector" aria-label="Selected cheese" hidden><div class="rt-section-label"><span>02 / RECORD INSPECTOR</span><button type="button" data-rt-close-details aria-label="Hide detail pane">← Close details</button></div><div class="rt-detail" data-rt-detail></div></section>
    </div>
    <div class="rt-quick-notes" data-rt-notes></div>
    <footer class="rt-footer"><div class="rt-actions"><button type="button" class="rt-approve" data-rt-action="approve"><kbd>A</kbd> Approve & publish</button><button type="button" data-rt-action="revise"><kbd>R</kbd> Revise</button><button type="button" data-rt-action="edit"><kbd>D</kbd> Edit details</button><button type="button" data-rt-action="skip"><kbd>S</kbd> Skip</button><button type="button" data-rt-action="undo"><kbd>Z</kbd> Undo last</button></div><div class="rt-key-guide"><span><kbd>↑</kbd><kbd>↓</kbd> Select row</span><span><kbd>→</kbd> Open details <kbd>←</kbd> Hide details</span><span>Decisions save automatically · Shortcuts pause while typing</span></div></footer>`;

  const quickNotes = createQuickNotes($('[data-rt-notes]'), { load: loadNotes, save: saveNote, returnFocus: () => $('[data-rt-queue]').focus({ preventScroll: true }) });

  function announce(message, error = false) {
    $('[data-rt-message]').textContent = message;
    $('[data-rt-message]').classList.toggle('rt-error', error);
  }
  function remember() {
    try { if (userId) storage?.setItem(`btw-review-cursor:${userId}`, JSON.stringify({ id: selectedId, filter: $('[data-rt-filter]').value })); } catch { /* Storage is optional; server decisions remain durable. */ }
  }
  function selected() { return visible.find((row) => row.id === selectedId); }
  function updateControls() {
    root.setAttribute('aria-busy', String(busy || loading));
    root.querySelectorAll('[data-rt-action]').forEach((button) => {
      button.disabled = busy || loading || loadError || (button.dataset.rtAction === 'undo' ? !undo : !selected());
    });
    $('[data-rt-refresh]').disabled = busy || loading;
    for (const selector of ['[data-rt-search]', '[data-rt-filter]', '[data-rt-flagged]']) $(selector).disabled = busy || loading;
  }
  function renderDetails() {
    const row = selected();
    quickNotes.select(row);
    $('[data-rt-position]').textContent = row ? `${visible.findIndex((item) => item.id === row.id) + 1} / ${visible.length}` : `0 / ${visible.length}`;
    root.classList.toggle('rt-detail-open', detailOpen);
    $('.rt-inspector').hidden = !detailOpen;
    if (!row) { $('[data-rt-detail]').innerHTML = '<div class="rt-detail-empty"><span>[ — ]</span><h3>No record selected</h3><p>Choose a queue or change the search to continue.</p></div>'; updateControls(); return; }
    const flags = reviewFlags(row);
    const field = (label, value) => `<div class="${needsVerification(value) ? 'rt-needs-check' : ''}"><dt>${html(label)}</dt><dd>${html(value) || 'Not provided'}</dd></div>`;
    const image = photoUrl(row);
    $('[data-rt-detail]').innerHTML = `
      <div class="rt-record-heading"><div><p class="rt-eyebrow">${html(row.catalog_category || 'Unclassified')} / ${row.status === 'draft' ? 'REVISE · DRAFT' : 'PENDING'}</p><h3>${html(row.name)}</h3><p>${html(row.creamery_name)}</p></div>${image ? `<img src="${html(image)}" alt="${html(row.name)} catalog photo" loading="lazy">` : '<span class="rt-no-photo">NO<br>PHOTO</span>'}</div>
      <div class="rt-flags">${flags.length ? `<strong>${flags.length} fields need verification</strong><span>${html(flags.join(' · '))}</span>` : '<strong>No missing-data flags</strong><span>Verify accuracy before publishing.</span>'}</div>
      <dl class="rt-facts">${FIELDS.slice(1, 9).map(([key, label]) => field(label, row[key])).join('')}${field('In the case', row.in_curd_nerd_case ? 'Yes' : 'No')}</dl>
      <div class="rt-tasting"><h4>Flavor profile</h4><p>${html(row.flavor_profile) || 'Not provided'}</p><h4>Pairings</h4><p>${html(row.pairings) || 'Not provided'}</p><h4>Story / notes</h4><p>${html(row.story_notes) || 'Not provided'}</p></div>
      <dl class="rt-facts rt-metadata">${field('Record ID', row.id)}${field('Slug', row.slug)}${field('Submitted', row.created_at ? new Date(row.created_at).toLocaleString() : 'Not provided')}${field('Last updated', row.updated_at ? new Date(row.updated_at).toLocaleString() : 'Not provided')}</dl>`;
    updateControls();
  }
  function highlight(scroll = false) {
    root.querySelectorAll('[data-rt-id]').forEach((element) => {
      const active = element.dataset.rtId === selectedId;
      element.classList.toggle('rt-selected', active);
      const button = element.querySelector('button');
      button.tabIndex = active ? 0 : -1;
      if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      if (active && scroll) {
        const queue = $('[data-rt-queue]');
        const bounds = queue.getBoundingClientRect();
        const rowBounds = element.getBoundingClientRect();
        const headerHeight = queue.querySelector('thead').getBoundingClientRect().height;
        if (rowBounds.top < bounds.top + headerHeight) queue.scrollTop += rowBounds.top - bounds.top - headerHeight;
        else if (rowBounds.bottom > bounds.bottom) queue.scrollTop += rowBounds.bottom - bounds.bottom;
      }
    });
    renderDetails();
    remember();
  }
  function render() {
    visible = filterReviewRows(rows, $('[data-rt-search]').value, $('[data-rt-filter]').value, $('[data-rt-flagged]').checked);
    if (!visible.some((row) => row.id === selectedId)) selectedId = visible[0]?.id || null;
    $('[data-rt-pending]').textContent = rows.filter((row) => row.status === 'pending').length;
    $('[data-rt-drafts]').textContent = rows.filter((row) => row.status === 'draft').length;
    $('[data-rt-reviewed]').textContent = sessionDecisions.size;
    $('[data-rt-rows]').innerHTML = visible.map((row, index) => {
      const flags = reviewFlags(row);
      return `<tr data-rt-id="${html(row.id)}"><td>${String(index + 1).padStart(3, '0')}</td><td><button type="button" class="rt-cell-line" title="${html(row.name)} — open details" data-rt-select="${html(row.id)}">${html(row.name)}</button>${cell(row.creamery_name, true)}</td><td class="rt-col-origin">${cell(row.location_country)}${cell([row.location_city, row.location_region].filter(Boolean).join(', '), true)}</td><td>${cell(row.milk_type)}</td><td class="rt-col-classification">${cell(row.cheese_style || row.catalog_category)}${cell(row.age_description, true)}</td><td class="rt-col-rennet">${cell(row.rennet)}</td><td class="rt-col-flavor">${cell(row.flavor_profile)}</td><td class="${flags.length ? 'rt-warning' : ''}">${flags.length ? `${flags.length} fields` : '—'}</td><td><span class="rt-state ${row.status === 'draft' ? 'rt-draft' : ''}">${row.status === 'draft' ? 'REVISE' : 'PENDING'}</span></td></tr>`;
    }).join('');
    $('[data-rt-empty]').hidden = visible.length > 0;
    $('[data-rt-empty]').textContent = loading ? 'Loading…' : loadError ? 'Queue unavailable. Refresh to retry.' : rows.length ? 'No entries in this view. Change the search or status filter.' : 'Queue clear. Every loaded entry has been reviewed.';
    highlight();
  }
  function move(offset) {
    if (!visible.length || busy || loading) return;
    const index = Math.max(0, visible.findIndex((row) => row.id === selectedId));
    selectedId = visible[Math.max(0, Math.min(visible.length - 1, index + offset))].id;
    highlight(true);
  }
  async function act(action) {
    if (busy || loading || loadError || !isActive()) return;
    if (action === 'previous' || action === 'next') { move(action === 'previous' ? -1 : 1); return; }
    if (action === 'search') { $('[data-rt-search]').focus(); return; }
    if (action === 'closeDetails' || action === 'details') { detailOpen = action === 'details'; renderDetails(); return; }
    const row = selected();
    if (action === 'note') { if (row) quickNotes.focus(); return; }
    if (action === 'edit') { if (row) edit(row); return; }
    if (action === 'skip') {
      if (row) { move(1); announce(`Skipped ${row.name}; no changes saved.${visible.at(-1)?.id === row.id ? ' End of this queue.' : ''}`); }
      return;
    }
    if (action === 'undo' ? !undo : !row) return;
    if (!['approve', 'revise', 'undo'].includes(action)) return;
    if (action === 'revise' && row.status === 'draft') { move(1); announce(`${row.name} is already marked for revision. No changes saved.`); return; }
    const previousUndo = undo;
    const target = action === 'undo' ? undo.after : row;
    const before = action === 'undo' ? undo.before : row;
    const nextId = visible[visible.indexOf(row) + 1]?.id || visible[visible.indexOf(row) - 1]?.id || null;
    const owner = userId;
    busy = true;
    announce(`Saving ${target.name}…`);
    updateControls();
    try {
      if (!await quickNotes.flush(target.id)) throw new Error('Save the review note before marking this cheese.');
      const updated = await decide(target, action === 'undo' ? before.status : action === 'approve' ? 'published' : 'draft', action === 'undo' ? before.approved_by : undefined);
      if (owner !== userId) return;
      rows = rows.filter((item) => item.id !== updated.id);
      if (['pending', 'draft'].includes(updated.status)) rows.push(updated);
      rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
      if (action === 'undo') {
        if (previousUndo.priorDecision) sessionDecisions.set(updated.id, previousUndo.priorDecision); else sessionDecisions.delete(updated.id);
        undo = null;
        // Make the restored row visible even when undoing from a different filtered queue.
        $('[data-rt-filter]').value = updated.status;
        $('[data-rt-search]').value = '';
        $('[data-rt-flagged]').checked = false;
        selectedId = updated.id;
      } else {
        undo = { before, after: updated, priorDecision: sessionDecisions.get(updated.id) };
        sessionDecisions.set(updated.id, action);
        selectedId = nextId;
      }
      announce(action === 'undo' ? `Undone: ${target.name} restored to ${updated.status}.` : `${target.name} — ${action === 'approve' ? 'approved and published' : 'marked for revision (draft)'}. Saved.`);
    } catch (error) {
      if (owner === userId) announce(`Not saved: ${error.message || 'Connection failed. Try again.'}`, true);
    } finally {
      if (owner === userId) { busy = false; render(); highlight(true); $('[data-rt-queue]').focus({ preventScroll: true }); }
    }
  }
  $('[data-rt-search]').addEventListener('input', render);
  $('[data-rt-search]').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('[data-rt-queue]').focus({ preventScroll: true }); } });
  $('[data-rt-filter]').addEventListener('change', () => { render(); $('[data-rt-queue]').focus({ preventScroll: true }); });
  $('[data-rt-flagged]').addEventListener('change', render);
  $('[data-rt-refresh]').addEventListener('click', refresh);
  root.addEventListener('click', (event) => {
    if (busy || loading) return;
    const row = event.target.closest('[data-rt-id]');
    if (row) { selectedId = row.dataset.rtId; detailOpen = true; highlight(); $('[data-rt-queue]').focus({ preventScroll: true }); }
    if (event.target.closest('[data-rt-close-details]')) { detailOpen = false; renderDetails(); $('[data-rt-queue]').focus({ preventScroll: true }); }
    const action = event.target.closest('[data-rt-action]');
    if (action) void act(action.dataset.rtAction);
  });
  // Keyboard commands only belong to this workspace, and never to the record editor.
  document.addEventListener('keydown', (event) => {
    if (!isActive() || !root.contains(event.target) || !$('[data-rt-shortcuts]').checked) return;
    const action = shortcutAction(event);
    if (action) { event.preventDefault(); void act(action); }
  });
  render();
  return {
    setRows(nextRows, nextUserId) {
      if (userId !== nextUserId) {
        userId = nextUserId; detailOpen = false; busy = false; undo = null; sessionDecisions = new Map(); selectedId = null;
        $('[data-rt-search]').value = ''; $('[data-rt-filter]').value = 'pending'; $('[data-rt-flagged]').checked = false;
        try {
          const saved = JSON.parse(storage?.getItem(`btw-review-cursor:${userId}`) || 'null');
          if (saved) { selectedId = saved.id; if (['pending', 'draft', 'all'].includes(saved.filter)) $('[data-rt-filter]').value = saved.filter; }
        } catch { /* Start from the first row when local storage is unavailable. */ }
      }
      quickNotes.connect(nextUserId);
      rows = nextRows; loading = false; loadError = false;
      render();
      if (!busy) announce('Queue ready. Select a row to review. Decisions are saved to the catalog.');
    },
    hasUnsavedNotes() { return quickNotes.hasUnsaved(); },
    setLoading() { loading = true; announce('Loading review queue…'); updateControls(); },
    setError(error) { loading = false; loadError = true; announce(`Could not load queue: ${error}`, true); render(); },
    focus() { $('[data-rt-queue]').focus({ preventScroll: true }); highlight(true); },
  };
}
