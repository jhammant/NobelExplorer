import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCatalog, validateEditorial } from '../scripts/catalog.mjs';
import { filterPrizes, groupPrizes, readState, writeState, relatedConnections, visibleConnections, searchText, inferTopics } from '../site/model.js';
import { escape, detail, catalogue, timeline } from '../site/views.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [rawPrizes, rawLaureates, editorial, snapshot] = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json'].map(read));
const catalog = createCatalog(rawPrizes, rawLaureates, editorial, snapshot);
const prizes = catalog.prizes;
const lookup = new Map(prizes.map((p) => [p.id, p]));
const bounds = { min: catalog.meta.minYear, max: catalog.meta.maxYear };

test('bundled catalogue contains every awarded official prize exactly once', () => {
  const awarded = rawPrizes.nobelPrizes.filter((p) => p.laureates?.length);
  assert.equal(prizes.length, awarded.length);
  assert.equal(new Set(prizes.map((p) => p.id)).size, prizes.length);
  assert.equal(catalog.meta.prizeCount, 639);
  assert.equal(catalog.meta.minYear, 1901);
  assert.equal(catalog.meta.maxYear, 2026);
  assert.equal(catalog.meta.laureateCount, 1028);
});

test('every citation and recipient survives normalisation without rewriting', () => {
  for (const source of rawPrizes.nobelPrizes.filter((p) => p.laureates?.length)) {
    const match = prizes.find((p) => p.year === Number(source.awardYear) && p.fullCategory === source.categoryFullName.en);
    assert.equal(match.recipients.length, source.laureates.length);
    for (const recipient of source.laureates) {
      const normalised = match.recipients.find((p) => p.id === recipient.id);
      assert.equal(normalised.motivation, recipient.motivation?.en || '');
      assert.equal(normalised.portion, recipient.portion);
      assert.ok(normalised.name.length > 0);
    }
  }
});

test('shared awards count once and repeat winners remain searchable in each year', () => {
  const curie = filterPrizes(prizes, { q: 'Marie Curie' });
  assert.deepEqual(curie.map((p) => p.id).sort(), ['1903-physics', '1911-chemistry']);
  assert.equal(lookup.get('1903-physics').recipients.length, 3);
});

test('search handles accents, multiple terms, editorial topics and reassessments', () => {
  assert.ok(filterPrizes(prizes, { q: 'Schrodinger' }).some((p) => p.id === '1933-physics'));
  assert.deepEqual(filterPrizes(prizes, { q: 'Curie 1911' }).map((p) => p.id), ['1911-chemistry']);
  assert.ok(filterPrizes(prizes, { q: 'Franklin' }).some((p) => p.id === '1962-medicine'));
  const cached = prizes.map((p) => ({ ...p, search: searchText(p) }));
  assert.deepEqual(filterPrizes(cached, { q: 'genetics' }).map((p) => p.id), filterPrizes(prizes, { q: 'genetics' }).map((p) => p.id));
});

test('filters intersect while multiple selected categories form a union', () => {
  const matches = filterPrizes(prizes, { categories: ['physics', 'chemistry'], from: 1901, to: 1903, q: 'Curie' });
  assert.deepEqual(matches.map((p) => p.id), ['1903-physics']);
  assert.equal(filterPrizes(prizes, { q: 'no-such-laureate-xyz' }).length, 0);
});

test('country is birthplace, with affiliations recorded for the correct award', () => {
  const marie = lookup.get('1911-chemistry').recipients.find((p) => p.name.includes('Marie'));
  assert.equal(marie.country, 'Poland');
  assert.ok(filterPrizes(prizes, { country: 'Poland' }).some((p) => p.id === '1911-chemistry'));
  assert.ok(marie.affiliations.length > 0);
  const institution = marie.affiliations[0];
  assert.ok(filterPrizes(prizes, { institution }).some((p) => p.id === '1911-chemistry'));
});

test('organisations have founding country and names rather than missing person fields', () => {
  const redCross = lookup.get('1917-peace').recipients[0];
  assert.ok(redCross.organisation);
  assert.equal(redCross.country, 'Switzerland');
  assert.ok(redCross.name.includes('Red Cross'));
});

test('reassessment lenses distinguish disproven claims, harms and disputed credit', () => {
  assert.deepEqual(filterPrizes(prizes, { lens: 'overturned' }).map((p) => p.id), ['1926-medicine']);
  assert.ok(filterPrizes(prizes, { lens: 'harmful' }).some((p) => p.id === '1949-medicine'));
  assert.ok(filterPrizes(prizes, { lens: 'credit' }).some((p) => p.id === '1962-medicine'));
  assert.equal(filterPrizes(prizes, { lens: 'reassessed' }).length, catalog.meta.reassessmentCount);
  assert.equal(filterPrizes(prizes, { lens: 'context' }).length, editorial.entries.length);
});

test('grouping never duplicates a shared award inside one country or institution', () => {
  const selected = [lookup.get('1903-physics')];
  for (const by of ['country', 'institution', 'topic']) {
    const groups = groupPrizes(selected, by);
    assert.ok(groups.length > 0);
    for (const [, members] of groups) assert.equal(members.length, 1);
  }
});

test('year and decade groups respect both sort directions', () => {
  const selected = [lookup.get('1903-physics'), lookup.get('1911-chemistry')];
  assert.deepEqual(groupPrizes(selected, 'year', 'oldest').map(([key]) => key), ['1903', '1911']);
  assert.deepEqual(groupPrizes(selected, 'decade', 'newest').map(([key]) => key), ['1910s', '1900s']);
});

test('URL state preserves all filters, selected award and trail', () => {
  const state = { ...readState('', bounds), q: 'Curie & DNA', from: 1920, to: 2000, categories: ['physics', 'medicine'], topic: 'DNA & genetics', country: 'Poland', institution: 'University of Cambridge', lens: 'credit', view: 'connections', group: 'institution', sort: 'oldest', prize: '1962-medicine', trail: 'reading-life' };
  assert.deepEqual(readState(writeState(state, bounds), bounds), state);
});

test('malformed URL filters and reversed ranges fall back to valid values', () => {
  const state = readState('?view=bad&group=bad&sort=bad&lens=bad&categories=fake,physics&from=9999&to=1', bounds);
  assert.equal(state.view, 'timeline'); assert.equal(state.group, 'decade'); assert.equal(state.sort, 'newest'); assert.equal(state.lens, 'all');
  assert.deepEqual(state.categories, ['physics']); assert.equal(state.from, bounds.max); assert.equal(state.to, bounds.max);
});

test('connection filtering requires both endpoints and related lookup works both ways', () => {
  const edge = catalog.connections[0];
  assert.ok(relatedConnections(edge.to, catalog.connections).includes(edge));
  assert.equal(visibleConnections([lookup.get(edge.from)], catalog.connections).length, 0);
  assert.ok(visibleConnections([lookup.get(edge.from), lookup.get(edge.to)], catalog.connections).includes(edge));
});

test('all editorial entries, reassessments, connections and trails have valid references and sources', () => {
  assert.doesNotThrow(() => validateEditorial(prizes, editorial));
  for (const entry of editorial.entries) {
    assert.ok(entry.summary && entry.impact && entry.detail);
    assert.ok(entry.sources.every((source) => new URL(source.url).protocol === 'https:'));
  }
});

test('invalid editorial endpoints or missing evidence fail the build', () => {
  const invalidId = structuredClone(editorial);
  invalidId.connections[0].to = '9999-physics';
  assert.throws(() => validateEditorial(prizes, invalidId), /Invalid connection/);
  const noEvidence = structuredClone(editorial);
  noEvidence.entries[0].sources = [];
  assert.throws(() => validateEditorial(prizes, noEvidence), /Sources required/);
});

test('topic suggestions match concrete citation subjects', () => {
  assert.ok(inferTopics('for the invention of the polymerase chain reaction (PCR) method within DNA chemistry', 'chemistry').includes('DNA & genetics'));
  assert.ok(inferTopics('for their discoveries concerning quantum entanglement', 'physics').includes('Quantum physics'));
});

test('HTML rendering escapes names, query values and citations', () => {
  const hostile = '<img src=x onerror=alert(1)>"&';
  assert.ok(!escape(hostile).includes('<img'));
  const prize = { ...lookup.get('1903-physics'), title: hostile, summary: hostile, topics: [hostile] };
  const html = detail(prize, lookup, [], null);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('catalogue pagination reports group-entry duplication explicitly', () => {
  const html = catalogue(prizes, { group: 'topic', sort: 'newest', view: 'catalogue' }, 30);
  assert.equal((html.match(/class="prize-row"/g) || []).length, 30);
  assert.ok(html.includes('group entries'));
});

test('timeline contains all matching awards and one keyboard entry point', () => {
  const html = timeline(prizes, bounds);
  assert.equal((html.match(/class="prize-dot/g) || []).length, prizes.length);
  assert.equal((html.match(/data-category="[^"]+" tabindex="0"/g) || []).length, 1);
});

test('unannotated entries state their actual coverage instead of inventing explanations', () => {
  const prize = prizes.find((p) => !p.summary);
  const html = detail(prize, lookup, [], null);
  assert.ok(html.includes('has not yet been added'));
  assert.ok(html.includes(escape(prize.recipients[0].motivation)));
});
