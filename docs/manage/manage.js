import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://sxfulqjshurmegsvcsrm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nGe3mfatg8TIdfWFNgu9_w_jt3FQDou';
const CATEGORIES = ['Alpine', 'Blue Cheese', 'Cheddar', 'Fresh Cheese', 'Gouda', 'Hard Aged Cheese', 'Soft Cheese', 'Tomme Style', 'Washed Rind'];
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const state = { user: null, profile: null, catalog: [], pending: [], activeTab: 'catalog', editorCheese: null, editorPhotoUrl: null };

const views = {
  auth: $('[data-auth-view]'), denied: $('[data-access-denied]'), workspace: $('[data-workspace]'),
  account: $('[data-account]'), modal: $('[data-editor-modal]'),
};

function setView(name) {
  views.auth.hidden = name !== 'auth';
  views.denied.hidden = name !== 'denied';
  views.workspace.hidden = name !== 'workspace';
  views.account.hidden = name === 'auth';
}

function message(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle('success', success);
}

function toast(text) {
  const element = $('[data-toast]');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 4200);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function splitList(value) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readableError(error) {
  if (!error) return 'Something went wrong.';
  if (error.code === '23505') return 'A cheese with this name or slug already exists.';
  if (String(error.message).includes('CONTENT_REVIEW_REQUIRED')) return 'Please remove potentially harmful, explicit, or spam-like language and try again.';
  return error.message || 'Something went wrong.';
}

async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('id,display_name,handle,role,role_approved,account_status').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

async function enterWorkspace(session) {
  if (!session?.user) { state.user = null; state.profile = null; setView('auth'); return; }
  try {
    state.user = session.user;
    state.profile = await loadProfile(session.user);
    $('[data-role]').textContent = state.profile.role;
    const approved = state.profile.role_approved && ['admin', 'cheesemonger'].includes(state.profile.role);
    const active = !state.profile.account_status || state.profile.account_status === 'active' || state.profile.account_status === 'warned';
    if (!approved || !active) {
      $('[data-access-message]').textContent = !active ? 'This account is not currently active. Contact an administrator for help.' : 'Your account must be an approved cheesemonger or administrator. Contact an administrator if you believe this is a mistake.';
      setView('denied');
      return;
    }
    setView('workspace');
    const reviewTab = $('[data-tab="review"]');
    reviewTab.hidden = state.profile.role !== 'admin';
    await loadEverything();
  } catch (error) {
    setView('auth');
    message($('[data-auth-message]'), readableError(error));
  }
}

async function loadEverything() {
    await Promise.all([loadCatalog(), loadPending()]);
}

async function loadCatalog() {
  $('[data-catalog-status]').textContent = 'Loading the catalog…';
  const { data, error } = await supabase.from('cheeses').select('*,cheese_photos(id,storage_path,moderation_status,created_at)').eq('status', 'published').order('name');
  if (error) { $('[data-catalog-status]').textContent = readableError(error); return; }
  state.catalog = data || [];
  $('[data-published-count]').textContent = state.catalog.length;
  $('[data-catalog-status]').textContent = `${state.catalog.length} published cheeses`;
  renderCatalog();
}

async function loadPending() {
  const { data, error } = await supabase.from('cheeses').select('*,cheese_photos(id,storage_path,moderation_status,created_at)').in('status', ['pending', 'draft']).order('created_at');
  if (error) { $('[data-review-status]').textContent = readableError(error); return; }
  state.pending = data || [];
  $('[data-pending-count]').textContent = state.pending.length;
  $('[data-review-badge]').textContent = state.pending.length ? `(${state.pending.length})` : '';
  renderPending();
}

function renderCatalog() {
  const query = $('[data-search]').value.trim().toLowerCase();
  const category = $('[data-category-filter]').value;
  const matches = state.catalog.filter((cheese) => {
    const haystack = [cheese.name, cheese.creamery_name, cheese.location_city, cheese.location_region, cheese.location_country, cheese.cheese_style, cheese.catalog_category].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!category || cheese.catalog_category === category);
  });
  $('[data-catalog-empty]').hidden = matches.length > 0;
  $('[data-catalog-list]').innerHTML = matches.map((cheese) => `
    <article class="catalog-row">
      <div><h3>${escapeHtml(cheese.name)}</h3><p>${escapeHtml(cheese.creamery_name)}</p><p>${cheese.in_curd_nerd_case ? 'In the case now' : 'Not in the case'}${cheese.case_availability_updated_at ? ` · updated ${new Date(cheese.case_availability_updated_at).toLocaleDateString()}` : ''}</p></div>
      <span>${escapeHtml([cheese.location_city, cheese.location_region, cheese.location_country].filter(Boolean).join(', '))}</span>
      <span class="category-chip">${escapeHtml(cheese.catalog_category || cheese.cheese_style)}</span>
      ${state.profile.role === 'admin' ? `<button class="small-button" type="button" data-toggle-case="${cheese.id}" aria-pressed="${Boolean(cheese.in_curd_nerd_case)}">${cheese.in_curd_nerd_case ? 'Mark out of case' : 'Mark in case'}</button><button class="small-button" type="button" data-edit-cheese="${cheese.id}">Edit cheese</button>` : '<span></span>'}
    </article>`).join('');
}

function renderPending() {
  const list = $('[data-review-list]');
  $('[data-review-empty]').hidden = state.pending.length > 0;
  list.innerHTML = state.pending.map((cheese) => `
    <article class="review-card">
      <header><div><h3>${escapeHtml(cheese.name)}</h3><p>${escapeHtml(cheese.creamery_name)} · ${escapeHtml(cheese.catalog_category || cheese.cheese_style)}</p></div><button class="small-button" type="button" data-edit-pending="${cheese.id}">Review details</button></header>
      <div class="review-details">
        <div><strong>Origin</strong><span>${escapeHtml([cheese.location_city, cheese.location_region, cheese.location_country].filter(Boolean).join(', '))}</span></div>
        <div><strong>Milk</strong><span>${escapeHtml(cheese.milk_type)}</span></div>
        <div><strong>Rennet</strong><span>${escapeHtml(cheese.rennet)}</span></div>
        <div><strong>Style</strong><span>${escapeHtml(cheese.cheese_style)}</span></div>
        <div><strong>Age</strong><span>${escapeHtml(cheese.age_description)}</span></div>
        <div><strong>Flavor</strong><span>${escapeHtml((cheese.flavor_profile || []).join(', '))}</span></div>
      </div>
      <div class="review-actions"><button class="small-button danger-button" type="button" data-reject="${cheese.id}">Reject</button><button class="button" type="button" data-approve="${cheese.id}">Approve &amp; publish</button></div>
    </article>`).join('');
}

function publicCatalogPhotoUrl(storagePath) {
  if (!storagePath) return '';
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  return supabase.storage.from('cheese-photos').getPublicUrl(storagePath).data.publicUrl;
}

function approvedCatalogPhotos(cheese) {
  return (cheese?.cheese_photos || [])
    .filter((photo) => photo.moderation_status === 'approved')
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

function currentCatalogPhoto(cheese) {
  const approved = approvedCatalogPhotos(cheese)[0];
  if (approved) return { ...approved, source: 'record' };
  if (cheese?.image_path) return { id: null, storage_path: cheese.image_path, source: 'legacy' };
  return null;
}

function clearPhotoDraft() {
  if (state.editorPhotoUrl) URL.revokeObjectURL(state.editorPhotoUrl);
  state.editorPhotoUrl = null;
  const input = $('[data-photo-input]');
  if (input) input.value = '';
}

function setPhotoMessage(text, success = false) {
  message($('[data-photo-message]'), text, success);
}

function renderPhotoEditor(cheese) {
  clearPhotoDraft();
  state.editorCheese = cheese || null;
  const controls = $('[data-photo-controls]');
  const unavailable = $('[data-photo-unavailable]');
  const preview = $('[data-photo-preview]');
  const placeholder = $('[data-photo-placeholder]');
  const upload = $('[data-upload-photo]');
  const remove = $('[data-remove-photo]');
  setPhotoMessage('');

  if (!cheese?.id || state.profile.role !== 'admin') {
    controls.hidden = true;
    unavailable.hidden = false;
    unavailable.textContent = cheese?.id ? 'Only administrators can replace a published catalog photo.' : 'Save this cheese first, then reopen it to add its catalog photo.';
    return;
  }

  controls.hidden = false;
  unavailable.hidden = true;
  upload.disabled = true;
  upload.textContent = 'Upload photo';
  const current = currentCatalogPhoto(cheese);
  preview.hidden = !current;
  placeholder.hidden = Boolean(current);
  remove.hidden = !current;
  $('[data-photo-title]').textContent = current ? 'Current published photo' : 'No photo is currently published.';
  $('[data-photo-description]').textContent = current
    ? 'Choose a replacement or remove this image. Replacing it updates the association immediately.'
    : 'Choose a JPEG, PNG, or WebP image up to 10 MB. It will become the approved catalog photo immediately.';
  if (current) {
    preview.src = publicCatalogPhotoUrl(current.storage_path);
    preview.alt = `${cheese.name} catalog photo`;
  } else {
    preview.removeAttribute('src');
    preview.alt = '';
  }
}

function updateCheesePhotoState(cheeseId, photos, imagePath = null) {
  const update = (cheese) => cheese.id === cheeseId ? { ...cheese, cheese_photos: photos, image_path: imagePath } : cheese;
  state.catalog = state.catalog.map(update);
  state.pending = state.pending.map(update);
  state.editorCheese = [...state.catalog, ...state.pending].find((cheese) => cheese.id === cheeseId) || null;
}

async function uploadCatalogPhoto() {
  const cheese = state.editorCheese;
  const file = $('[data-photo-input]').files?.[0];
  const button = $('[data-upload-photo]');
  if (!cheese?.id || !file || state.profile.role !== 'admin') return;

  button.disabled = true;
  setPhotoMessage('Uploading and publishing photo…');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${state.user.id}/${cheese.id}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('cheese-photos').upload(storagePath, file, { contentType: file.type, cacheControl: '3600' });
  if (uploadError) { setPhotoMessage(readableError(uploadError)); button.disabled = false; return; }

  const reviewedAt = new Date().toISOString();
  const { data: inserted, error: recordError } = await supabase.from('cheese_photos').insert({
    cheese_id: cheese.id,
    storage_path: storagePath,
    submitted_by: state.user.id,
    moderation_status: 'approved',
    reviewed_by: state.user.id,
    reviewed_at: reviewedAt,
  }).select('id,storage_path,moderation_status,created_at').single();
  if (recordError) {
    await supabase.storage.from('cheese-photos').remove([storagePath]);
    setPhotoMessage(readableError(recordError));
    button.disabled = false;
    return;
  }

  const replaced = approvedCatalogPhotos(cheese);
  const replacedIds = replaced.map((photo) => photo.id).filter(Boolean);
  if (replacedIds.length) {
    const { error: demoteError } = await supabase.from('cheese_photos').update({ moderation_status: 'rejected', reviewed_by: state.user.id, reviewed_at: reviewedAt }).in('id', replacedIds);
    if (demoteError) {
      await supabase.from('cheese_photos').delete().eq('id', inserted.id);
      await supabase.storage.from('cheese-photos').remove([storagePath]);
      setPhotoMessage(`The replacement could not be activated: ${readableError(demoteError)}`);
      button.disabled = false;
      return;
    }
  }

  await supabase.from('cheeses').update({ image_path: null }).eq('id', cheese.id);
  if (replacedIds.length) await supabase.from('cheese_photos').delete().in('id', replacedIds);
  const replacedPaths = [...new Set([...replaced.map((photo) => photo.storage_path), cheese.image_path].filter((path) => path && path !== storagePath && !/^https?:\/\//i.test(path)))];
  const cleanup = replacedPaths.length ? await supabase.storage.from('cheese-photos').remove(replacedPaths) : { error: null };

  updateCheesePhotoState(cheese.id, [inserted], null);
  renderPhotoEditor(state.editorCheese);
  setPhotoMessage(cleanup.error ? 'Photo published. An older stored file could not be cleaned up.' : 'Photo published and associated with this cheese.', true);
  toast(`${cheese.name} now uses the new catalog photo.`);
}

async function removeCatalogPhoto() {
  const cheese = state.editorCheese;
  if (!cheese?.id || state.profile.role !== 'admin') return;
  const approved = approvedCatalogPhotos(cheese);
  const associatedPaths = [...new Set([...approved.map((photo) => photo.storage_path), cheese.image_path].filter(Boolean))];
  const storedPaths = associatedPaths.filter((path) => !/^https?:\/\//i.test(path));
  if (!associatedPaths.length || !confirm(`Remove the published catalog photo for ${cheese.name}? This also deletes the stored file.`)) return;

  const button = $('[data-remove-photo]');
  button.disabled = true;
  setPhotoMessage('Removing photo…');
  const ids = approved.map((photo) => photo.id).filter(Boolean);
  if (ids.length) {
    const { error } = await supabase.from('cheese_photos').delete().in('id', ids);
    if (error) { setPhotoMessage(readableError(error)); button.disabled = false; return; }
  }
  const { error: cheeseError } = await supabase.from('cheeses').update({ image_path: null }).eq('id', cheese.id);
  if (cheeseError) { setPhotoMessage(readableError(cheeseError)); button.disabled = false; return; }
  const { error: storageError } = storedPaths.length ? await supabase.storage.from('cheese-photos').remove(storedPaths) : { error: null };

  updateCheesePhotoState(cheese.id, [], null);
  renderPhotoEditor(state.editorCheese);
  setPhotoMessage(storageError ? 'Photo association removed. The old stored file could not be cleaned up.' : 'Catalog photo removed.', true);
  toast(`${cheese.name} no longer has a catalog photo.`);
}

function populateEditor(cheese = null) {
  const form = $('[data-cheese-form]');
  form.reset();
  form.elements.id.value = cheese?.id || '';
  const fields = ['name', 'creamery_name', 'location_city', 'location_region', 'location_country', 'catalog_category', 'cheese_style', 'milk_type', 'rennet', 'age_description', 'story_notes'];
  fields.forEach((field) => { form.elements[field].value = cheese?.[field] || (field === 'location_country' ? 'USA' : ''); });
  form.elements.in_curd_nerd_case.value = cheese?.in_curd_nerd_case ? 'true' : 'false';
  form.elements.flavor_profile.value = (cheese?.flavor_profile || []).join(', ');
  form.elements.pairings.value = (cheese?.pairings || []).join(', ');
  $('[data-editor-title]').textContent = cheese ? `Edit ${cheese.name}` : 'Add a cheese';
  $('[data-editor-kicker]').textContent = cheese?.status === 'published' ? 'Published catalog record' : cheese ? 'Submission review' : 'New catalog record';
  $('[data-save-cheese]').textContent = cheese?.status === 'published' ? 'Save corrections' : cheese && state.profile.role === 'admin' ? 'Save review changes' : 'Submit for review';
  message($('[data-editor-message]'), '');
  renderPhotoEditor(cheese);
  views.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => form.elements.name.focus(), 80);
}

function closeEditor() {
  clearPhotoDraft();
  state.editorCheese = null;
  views.modal.hidden = true;
  document.body.style.overflow = '';
}

async function saveCheese(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('[data-save-cheese]');
  const id = form.elements.id.value;
  const existing = [...state.catalog, ...state.pending].find((item) => item.id === id);
  const payload = {
    name: form.elements.name.value.trim(), creamery_name: form.elements.creamery_name.value.trim(),
    in_curd_nerd_case: form.elements.in_curd_nerd_case.value === 'true',
    location_city: form.elements.location_city.value.trim(), location_region: form.elements.location_region.value.trim(), location_country: form.elements.location_country.value.trim(),
    catalog_category: form.elements.catalog_category.value, cheese_style: form.elements.cheese_style.value.trim(), milk_type: form.elements.milk_type.value.trim(),
    rennet: form.elements.rennet.value.trim(), age_description: form.elements.age_description.value.trim(),
    flavor_profile: splitList(form.elements.flavor_profile.value), story_notes: form.elements.story_notes.value.trim(), pairings: splitList(form.elements.pairings.value),
  };
  if (!payload.flavor_profile.length || !payload.pairings.length) { message($('[data-editor-message]'), 'Add at least one flavor and one pairing.'); return; }
  button.disabled = true;
  message($('[data-editor-message]'), id ? 'Saving corrections…' : 'Submitting cheese…');
  let result;
  if (id) {
    if (state.profile.role !== 'admin' && existing?.status === 'published') { message($('[data-editor-message]'), 'Only administrators can edit published records.'); button.disabled = false; return; }
    payload.slug = slugify(payload.name);
    if (state.profile.role === 'admin' && existing?.status === 'published') { payload.status = 'published'; payload.approved_by = state.user.id; }
    result = await supabase.from('cheeses').update(payload).eq('id', id);
  } else {
    result = await supabase.from('cheeses').insert({ ...payload, slug: slugify(payload.name), status: 'pending', submitted_by: state.user.id, approved_by: null });
  }
  button.disabled = false;
  if (result.error) { message($('[data-editor-message]'), readableError(result.error)); return; }
  closeEditor();
  toast(id ? 'Cheese information saved.' : 'Cheese submitted for review.');
  await loadEverything();
}

async function reviewCheese(id, approve) {
  if (state.profile.role !== 'admin') return;
  const button = $(`[data-${approve ? 'approve' : 'reject'}="${id}"]`);
  if (button) button.disabled = true;
  const { error } = await supabase.from('cheeses').update({ status: approve ? 'published' : 'rejected', approved_by: approve ? state.user.id : null }).eq('id', id);
  if (error) { toast(readableError(error)); if (button) button.disabled = false; return; }
  toast(approve ? 'Cheese approved and published.' : 'Submission rejected.');
  await loadEverything();
}

function switchTab(tab) {
  state.activeTab = tab;
  $$('[data-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
}

CATEGORIES.forEach((category) => {
  $('[data-category-filter]').insertAdjacentHTML('beforeend', `<option value="${category}">${category}</option>`);
  $('[name="catalog_category"]').insertAdjacentHTML('beforeend', `<option value="${category}">${category}</option>`);
});

$('[data-auth-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('[data-email-sign-in]');
  button.disabled = true;
  message($('[data-auth-message]'), 'Signing in…');
  const { error } = await supabase.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
  button.disabled = false;
  if (error) message($('[data-auth-message]'), readableError(error));
});

$('[data-google-sign-in]').addEventListener('click', async () => {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/manage/` } });
  if (error) message($('[data-auth-message]'), readableError(error));
});

$('[data-reset-password]').addEventListener('click', async (event) => {
  event.preventDefault();
  const email = $('[name="email"]').value.trim();
  if (!email) { message($('[data-auth-message]'), 'Enter your email address first.'); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/manage/` });
  message($('[data-auth-message]'), error ? readableError(error) : 'Password reset email sent.', !error);
});

async function signOut() { await supabase.auth.signOut(); }
$('[data-sign-out]').addEventListener('click', signOut);
$('[data-denied-sign-out]').addEventListener('click', signOut);
$('[data-new-cheese]').addEventListener('click', () => populateEditor());
$$('[data-close-editor]').forEach((button) => button.addEventListener('click', closeEditor));
$('[data-cheese-form]').addEventListener('submit', saveCheese);
$('[data-photo-input]').addEventListener('change', (event) => {
  const file = event.currentTarget.files?.[0];
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!file) return;
  if (!allowed.includes(file.type)) { event.currentTarget.value = ''; setPhotoMessage('Choose a JPEG, PNG, or WebP image.'); return; }
  if (file.size > 10 * 1024 * 1024) { event.currentTarget.value = ''; setPhotoMessage('Choose an image smaller than 10 MB.'); return; }
  if (state.editorPhotoUrl) URL.revokeObjectURL(state.editorPhotoUrl);
  state.editorPhotoUrl = URL.createObjectURL(file);
  const preview = $('[data-photo-preview]');
  preview.src = state.editorPhotoUrl;
  preview.alt = `Selected replacement for ${state.editorCheese?.name || 'catalog cheese'}`;
  preview.hidden = false;
  $('[data-photo-placeholder]').hidden = true;
  $('[data-photo-title]').textContent = file.name;
  $('[data-photo-description]').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to upload`;
  $('[data-upload-photo]').disabled = false;
  $('[data-upload-photo]').textContent = currentCatalogPhoto(state.editorCheese) ? 'Replace photo' : 'Upload photo';
  setPhotoMessage('');
});
$('[data-upload-photo]').addEventListener('click', uploadCatalogPhoto);
$('[data-remove-photo]').addEventListener('click', removeCatalogPhoto);
$('[data-search]').addEventListener('input', renderCatalog);
$('[data-category-filter]').addEventListener('change', renderCatalog);
$$('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));

$('[data-catalog-list]').addEventListener('click', (event) => {
  const availability = event.target.closest('[data-toggle-case]');
  if (availability) {
    const cheese = state.catalog.find((item) => item.id === availability.dataset.toggleCase);
    if (cheese) supabase.from('cheeses').update({ in_curd_nerd_case: !cheese.in_curd_nerd_case }).eq('id', cheese.id).select('*').single().then(({ data, error }) => {
      if (error) return toast(readableError(error));
      Object.assign(cheese, data);
      renderCatalog();
      toast(`${cheese.name} availability updated.`);
    });
  }
  const button = event.target.closest('[data-edit-cheese]');
  if (button) populateEditor(state.catalog.find((item) => item.id === button.dataset.editCheese));
});
$('[data-review-list]').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-pending]');
  const approve = event.target.closest('[data-approve]');
  const reject = event.target.closest('[data-reject]');
  if (edit) populateEditor(state.pending.find((item) => item.id === edit.dataset.editPending));
  if (approve) reviewCheese(approve.dataset.approve, true);
  if (reject && confirm('Reject this cheese submission? The submitter can revise it later.')) reviewCheese(reject.dataset.reject, false);
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !views.modal.hidden) closeEditor(); });
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    setTimeout(async () => {
      const nextPassword = prompt('Enter a new password (at least 8 characters):');
      if (!nextPassword) return;
      if (nextPassword.length < 8) { toast('Your new password must be at least 8 characters.'); return; }
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      toast(error ? readableError(error) : 'Password updated. You can continue into Catalog Studio.');
    }, 100);
  }
  setTimeout(() => enterWorkspace(session), 0);
});
const { data: { session } } = await supabase.auth.getSession();
await enterWorkspace(session);
