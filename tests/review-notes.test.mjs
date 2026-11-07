import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../docs/manage/review-notes.js', import.meta.url), 'utf8');
const { persistReviewNote, createQuickNotes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function client(result) {
  const calls = [];
  const query = { update(value) { calls.push(['update', value]); return this; }, insert(value) { calls.push(['insert', value]); return this; }, eq(...value) { calls.push(value); return this; }, select() { return this; }, async maybeSingle() { return result; } };
  return { calls, from(table) { assert.equal(table, 'cheese_review_notes'); return query; } };
}
test('notes are separate from public cheese records and updates check the saved version', async () => {
  const api = client({data: {cheese_id:'one', note:'Check origin', updated_at:'v2'}});
  await persistReviewNote(api, 'one', 'Check origin', {updated_at:'v1'});
  assert.deepEqual(api.calls, [['update',{note:'Check origin'}], ['cheese_id','one'], ['updated_at','v1']]);
  const fresh = client({data: {cheese_id:'two',note:'Verify rennet'}});
  await persistReviewNote(fresh, 'two', 'Verify rennet');
  assert.deepEqual(fresh.calls[0], ['insert',{cheese_id:'two',note:'Verify rennet'}]);
});
test('concurrent first notes, changed notes, and oversized notes are rejected', async () => {
  await assert.rejects(persistReviewNote(client({error:{code:'23505'}}),'one','Note'), /Another administrator/);
  await assert.rejects(persistReviewNote(client({data:null}),'one','Note',{updated_at:'old'}), /Another administrator/);
  await assert.rejects(persistReviewNote(client({}),'one','x'.repeat(4001)), /4,000/);
});
function fixture(save) {
  const elements = new Map();
  const root = { querySelector(key) { if (!elements.has(key)) elements.set(key, {value:'',disabled:false,hidden:false,textContent:'',classList:{toggle(){}},addEventListener(event,fn){this[event]=fn;},focus(){}}); return elements.get(key); } };
  globalThis.window = { addEventListener(){} };
  const notes = createQuickNotes(root,{load: async()=>[],save,returnFocus(){}});
  notes.connect('admin');
  return {notes, elements, type(value) { const input=elements.get('[data-note-input]');input.value=value;input.input(); }};
}
const settled = () => new Promise(resolve=>setImmediate(resolve));
test('switching rows saves the note against its original cheese', async () => {
  const writes=[];
  const f=fixture(async(id,note)=>{writes.push({id,note});return {cheese_id:id,note,updated_at:'v1'};});
  await settled(); f.notes.select({id:'one',name:'One'}); f.type('Check milk'); f.notes.select({id:'two',name:'Two'}); await settled();
  assert.deepEqual(writes,[{id:'one',note:'Check milk'}]);
  assert.equal(f.elements.get('[data-note-input]').value,'');
  f.notes.select({id:'one',name:'One'}); assert.equal(f.elements.get('[data-note-input]').value,'Check milk');
});
test('failed saves preserve text and block a dependent review decision until retried', async () => {
  let fail=true;
  const f=fixture(async(id,note)=>{if(fail)throw Error('Offline');return {cheese_id:id,note,updated_at:'v2'};});
  await settled(); f.notes.select({id:'one',name:'One'}); f.type('Needs source');
  assert.equal(await f.notes.flush(),false); assert.equal(f.notes.hasUnsaved(),true);
  assert.equal(f.elements.get('[data-note-input]').value,'Needs source');
  assert.match(f.elements.get('[data-note-state]').textContent,/Not saved/);
  fail=false; assert.equal(await f.notes.flush(),true);assert.equal(f.notes.hasUnsaved(),false);
});
test('edits typed during a save are serialized using the new version', async () => {
  let finish;const writes=[];
  const f=fixture(async(id,note,previous)=>{writes.push({note,previous});if(writes.length===1)await new Promise(resolve=>{finish=resolve;});return {cheese_id:id,note,updated_at:`v${writes.length}`};});
  await settled(); f.notes.select({id:'one',name:'One'}); f.type('First');const saving=f.notes.flush();
  f.type('Second');finish();await saving;
  assert.equal(writes.length,2);assert.equal(writes[1].previous.updated_at,'v1');assert.equal(writes[1].note,'Second');assert.equal(f.notes.hasUnsaved(),false);
});
