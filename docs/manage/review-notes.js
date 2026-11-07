export async function persistReviewNote(client, cheeseId, note, previous) {
  if (note.length > 4000) throw new Error('Keep review notes under 4,000 characters.');
  const table = client.from('cheese_review_notes');
  const request = previous
    ? table.update({ note }).eq('cheese_id', cheeseId).eq('updated_at', previous.updated_at)
    : table.insert({ cheese_id: cheeseId, note });
  const { data, error } = await request.select('cheese_id,note,updated_at').maybeSingle();
  if (error?.code === '23505' || (!data && !error)) throw new Error('Another administrator changed this note. Copy your text, then reload notes before retrying.');
  if (error) throw error;
  return data;
}

export function createQuickNotes(root, { load, save, returnFocus }) {
  root.innerHTML = `<div class="rt-note-heading"><label for="rt-note"><kbd>E</kbd> Review note <span data-note-cheese></span></label><span data-note-state role="status" aria-live="polite">Private to administrators</span></div><div class="rt-note-input"><textarea id="rt-note" data-note-input rows="1" maxlength="4000" placeholder="Add a correction, question, or follow-up…" disabled></textarea><button type="button" data-note-save disabled>Save note</button><button type="button" data-note-reload hidden>Reload notes</button></div>`;
  const $ = (selector) => root.querySelector(selector);
  const input = $('[data-note-input]');
  let owner = null, selected = null, ready = false, records = new Map(), drafts = new Map(), pending = new Map(), errors = new Map(), timer;
  let loadError = '';
  function render() {
    const id = selected?.id;
    input.disabled = !id || !ready;
    const value = drafts.get(id) ?? records.get(id)?.note ?? '';
    if (input.value !== value) input.value = value;
    $('[data-note-cheese]').textContent = selected ? ` / ${selected.name}` : '';
    $('[data-note-save]').disabled = !id || !ready || pending.has(id) || !drafts.has(id);
    $('[data-note-reload]').hidden = !loadError && !errors.has(id);
    const error = loadError || errors.get(id);
    $('[data-note-state]').textContent = error || (pending.has(id) ? 'Saving…' : drafts.has(id) ? 'Unsaved note' : !ready && owner ? 'Loading notes…' : records.get(id) ? 'Saved · Private to administrators' : 'Autosaves · Private to administrators');
    $('[data-note-state]').classList.toggle('rt-error', Boolean(error));
  }
  async function flush(id = selected?.id) {
    clearTimeout(timer);
    if (!id || !drafts.has(id)) return true;
    if (pending.has(id)) { await pending.get(id); return drafts.has(id) && !errors.has(id) ? flush(id) : !drafts.has(id); }
    const value = drafts.get(id), currentOwner = owner;
    const job = (async () => {
      try {
        const record = await save(id, value, records.get(id));
        if (owner !== currentOwner) return false;
        records.set(id, record);
        if (drafts.get(id) === value) drafts.delete(id);
        errors.delete(id);
        return true;
      } catch (error) {
        if (owner === currentOwner) errors.set(id, `Not saved: ${error.message || 'Connection failed. Retry Save note.'}`);
        return false;
      }
    })();
    pending.set(id, job); render();
    const success = await job;
    if (owner === currentOwner) { pending.delete(id); render(); }
    if (success && drafts.has(id) && owner === currentOwner) return flush(id);
    return success;
  }
  async function reload() {
    const currentOwner = owner;
    ready = false; loadError = ''; render();
    try {
      const notes = await load();
      if (owner !== currentOwner) return;
      records = new Map(notes.map((record) => [record.cheese_id, record]));
      // Keep unsaved text visible; reloading never silently discards a draft.
      errors.clear(); ready = true;
    } catch (error) {
      if (owner !== currentOwner) return;
      loadError = `Notes unavailable: ${error.message || 'Connection failed'}.`;
    }
    render();
  }
  input.addEventListener('input', () => {
    if (!selected || !ready) return;
    drafts.set(selected.id, input.value); errors.delete(selected.id);
    clearTimeout(timer); timer = setTimeout(() => void flush(), 700); render();
  });
  input.addEventListener('blur', () => { void flush(); });
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault(); event.stopPropagation();
      if (await flush()) returnFocus();
    }
  });
  $('[data-note-save]').addEventListener('click', async () => { if (await flush()) returnFocus(); });
  $('[data-note-reload]').addEventListener('click', reload);
  window.addEventListener('beforeunload', (event) => {
    if (drafts.size || pending.size) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    connect(userId) {
      if (owner === userId) return;
      clearTimeout(timer); owner = userId; ready = false; records = new Map(); drafts = new Map(); pending = new Map(); errors = new Map(); loadError = '';
      render(); if (owner) void reload();
    },
    select(row) {
      if (selected?.id !== row?.id) { if (selected) void flush(selected.id); selected = row; }
      else selected = row;
      render();
    },
    focus() { if (!input.disabled) input.focus(); },
    flush,
    hasUnsaved() { return drafts.size > 0 || pending.size > 0; },
  };
}
