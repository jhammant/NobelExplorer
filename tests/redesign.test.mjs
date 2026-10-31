import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readState, writeState } from '../site/model.js';
import { createCatalog } from '../scripts/catalog.mjs';
import { discovery } from '../site/discovery.js';
import { escape } from '../site/view-helpers.js';

const bounds = { min: 1901, max: 2026 };
const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const catalog = createCatalog(...await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json'].map(read)));
const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));

test('an empty URL opens discovery with a catalogue as its default browse view', () => {
  const state = readState('', bounds);

  assert.equal(state.page, 'discover');
  assert.equal(state.view, 'catalogue');
  assert.equal(writeState(state, bounds), '');
});

test('existing prize and filter links still open the archive rather than the homepage', () => {
  for (const query of ['?q=Curie', '?categories=physics&from=1901&to=1910', '?prize=1962-medicine', '?view=timeline']) {
    const state = readState(query, bounds);

    assert.equal(state.page, 'browse', query);
  }
});

test('legacy connection and trail links infer the ideas destination', () => {
  for (const query of ['?view=connections', '?trail=reading-life', '?trail=reading-life&prize=1962-medicine']) {
    const state = readState(query, bounds);

    assert.equal(state.page, 'ideas', query);
  }
});

test('legacy reassessment links infer the reconsidered collection for every kind', () => {
  for (const lens of ['reassessed', 'overturned', 'harmful', 'ethical', 'credit', 'debated']) {
    const state = readState(`?lens=${lens}`, bounds);

    assert.equal(state.page, 'reassessments', lens);
    assert.equal(state.lens, lens);
  }
  assert.equal(readState('?lens=context', bounds).page, 'browse');
});

test('explicit destinations survive sharing even when no filters are selected', () => {
  for (const page of ['discover', 'browse', 'ideas', 'reassessments']) {
    const state = { ...readState('', bounds), page };

    const restored = readState(writeState(state, bounds), bounds);

    assert.deepEqual(restored, state, page);
  }
});

test('group selection and relation selection survive sharing without losing the original filters', () => {
  const state = {
    ...readState('', bounds),
    page: 'ideas', view: 'connections', q: 'Curie & DNA', categories: ['physics', 'medicine'],
    from: 1901, to: 2020, country: 'Poland', institution: 'University of Cambridge',
    group: 'topic', bucket: 'DNA & genetics', sort: 'oldest',
    connection: '1962-medicine:1978-medicine', focus: '1962-medicine',
    trail: 'reading-life', prize: '1962-medicine',
  };

  const restored = readState(writeState(state, bounds), bounds);

  assert.deepEqual(restored, state);
});

test('invalid destinations and view values cannot create an unusable navigation state', () => {
  const state = readState('?page=missing&view=missing&q=Curie', bounds);

  assert.equal(state.page, 'browse');
  assert.equal(state.view, 'catalogue');
  assert.equal(state.q, 'Curie');
});

test('new URL selection fields remain bounded like the existing search field', () => {
  const query = new URLSearchParams({ bucket: 'b'.repeat(900), connection: 'c'.repeat(900), focus: 'f'.repeat(900) });

  const state = readState(query.toString(), bounds);

  assert.ok(state.bucket.length <= 300);
  assert.ok(state.connection.length <= 100);
  assert.ok(state.focus.length <= 40);
});

test('discovery features a real named prize and preserves its recipient identities', () => {
  const prize = lookup.get('1978-medicine');

  const html = discovery(catalog, lookup);

  assert.ok(html.includes(`id="discovery-title">${escape(prize.title)}</h1>`));
  assert.ok(html.includes('data-prize="1978-medicine">Read this prize'));
  for (const person of prize.recipients) assert.ok(html.includes(escape(person.name)));
});

test('discovery relation controls correspond to actual sourced edges and never invent a missing edge', () => {
  const html = discovery(catalog, lookup);
  const selectedIds = [...new Set([...html.matchAll(/data-connection="([^"]+)"/g)].map((match) => match[1]))];
  const recordedIds = new Set(catalog.connections.map((edge) => `${edge.from}:${edge.to}`));
  assert.equal(selectedIds.length, 3);
  assert.ok(selectedIds.every((id) => recordedIds.has(id)));

  const missingId = '1978-medicine:1980-chemistry';
  const withoutLink = { ...catalog, connections: catalog.connections.filter((edge) => `${edge.from}:${edge.to}` !== missingId) };
  const withoutLinkHtml = discovery(withoutLink, lookup);

  assert.ok(!withoutLinkHtml.includes(`data-connection="${missingId}"`));
  assert.ok(withoutLinkHtml.includes('No sourced link yet'));
});

test('discovery offers real Literature, Peace and Economics alternatives', () => {
  const html = discovery(catalog, lookup);
  const alternatives = [...html.matchAll(/class="elsewhere-entry" data-prize="([^"]+)"/g)].map((match) => lookup.get(match[1]));

  assert.equal(alternatives.length, 3);
  assert.deepEqual(alternatives.map((prize) => prize.category), ['literature', 'peace', 'economics']);
  for (const prize of alternatives) assert.ok(html.includes(escape(prize.title)));
});

test('discovery escapes supplied prize, person, relationship and evidence text', () => {
  const hostile = '<img src=x onerror="window.injected=true"> & "';
  const modified = structuredClone(catalog);
  const featured = modified.prizes.find((prize) => prize.id === '1978-medicine');
  featured.title = `Title ${hostile}`;
  featured.recipients[0].name = `Person ${hostile}`;
  const connection = modified.connections.find((edge) => edge.from === '1978-medicine' && edge.to === '1980-chemistry');
  connection.label = `Relation ${hostile}`;
  connection.description = `Explanation ${hostile}`;
  connection.sources[0].title = `Evidence ${hostile}`;

  const html = discovery(modified, new Map(modified.prizes.map((prize) => [prize.id, prize])));

  assert.ok(!html.includes('<img'));
  for (const label of ['Title', 'Person', 'Relation', 'Explanation', 'Evidence']) assert.ok(html.includes(escape(`${label} ${hostile}`)));
});
