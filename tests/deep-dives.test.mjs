import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCatalog } from '../scripts/catalog.mjs';
import { filterPrizes, searchText } from '../site/model.js';
import { detail, escape } from '../site/views.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const fileNames = ['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json', 'explanations.json'];
const inputs = await Promise.all(fileNames.map(read));
const baseline = createCatalog(...inputs);
const prizeIds = baseline.prizes.map((prize) => prize.id);
const selectedId = prizeIds[0];
const fixture = {
  updated: '2026-10-31',
  method: 'Locally generated draft, independently checked against identified official sources.',
  model: 'local-test-model',
  entries: baseline.prizes.map((prize) => ({
    id: prize.id,
    sections: [
      { heading: 'The problem and its setting', body: `Researchers working before the ${prize.year} award faced a specific unresolved problem. This section explains the starting point and the limits of the earlier approach.`, sourceIds: ['s1'] },
      { heading: 'How the contribution worked', body: 'The recipients used a distinct method to address that problem. The explanation separates their individual contributions and describes the evidence supporting the result.', sourceIds: ['s2', 's1'] },
      { heading: 'What changed and what remained uncertain', body: 'The result made new investigations possible, while leaving other questions unresolved. Later developments should be distinguished from the work that the award recognized.', sourceIds: ['s3'] },
    ],
    terms: [
      { term: 'Method', definition: 'A systematic way of investigating a question and obtaining evidence that others can examine.', sourceIds: ['s2'] },
      { term: 'Limitation', definition: 'A boundary on what a finding or method can establish from the available evidence.', sourceIds: ['s3'] },
    ],
    sources: [
      { id: 's1', title: `Official ${prize.year} award announcement`, url: prize.officialUrl },
      { id: 's2', title: `Official recipient background for ${prize.id}`, url: prize.recipients[0].url || `${prize.officialUrl}?view=recipient` },
      { id: 's3', title: `Detailed award presentation for ${prize.id}`, url: `${prize.officialUrl}?view=presentation` },
    ],
  })),
};
const build = (deepDives = fixture) => createCatalog(...inputs, deepDives);
const modified = (change) => {
  const value = structuredClone(fixture);
  change(value, value.entries[0]);
  return value;
};
const render = (catalog, id = selectedId) => {
  const lookup = new Map(catalog.prizes.map((prize) => [prize.id, prize]));
  return detail(lookup.get(id), lookup, catalog.connections, null);
};

// Fixtures make these checks independent of model wording and of batch completion.
test('the optional deep-dive collection attaches every matching entry and reports complete coverage', () => {
  const catalog = build();

  assert.equal(catalog.meta.deepDiveCount, prizeIds.length);
  assert.equal(catalog.prizes.length, baseline.prizes.length);
  for (const prize of catalog.prizes) {
    assert.deepEqual(prize.deepDive, fixture.entries.find((entry) => entry.id === prize.id), `${prize.id}: attached deep dive`);
  }
});

test('deep dives preserve short explanations, recipients, citations and curated coverage', () => {
  const catalog = build();

  for (let index = 0; index < baseline.prizes.length; index++) {
    const { deepDive, ...unchanged } = catalog.prizes[index];
    assert.ok(deepDive, `${unchanged.id}: a separate long-form layer is present`);
    assert.deepEqual(unchanged, baseline.prizes[index], `${unchanged.id}: the existing record is unchanged`);
  }
  for (const key of ['explanationCount', 'contextCount', 'reassessmentCount', 'laureateCount', 'connectionCount']) {
    assert.equal(catalog.meta[key], baseline.meta[key]);
  }
  assert.deepEqual(filterPrizes(catalog.prizes, { lens: 'context' }).map((prize) => prize.id), filterPrizes(baseline.prizes, { lens: 'context' }).map((prize) => prize.id));
});

test('the library remains usable without the optional deep-dive layer and renders no dead jump link', () => {
  const catalog = createCatalog(...inputs);
  const html = render(catalog);

  assert.equal(catalog.meta.deepDiveCount, 0);
  assert.ok(catalog.prizes.every((prize) => !prize.deepDive));
  assert.ok(!html.includes('id="prize-deep-dive"'));
  assert.ok(!html.includes('In more detail'));
  assert.ok(html.includes('prize-explanation'));
});

test('deep-dive bodies, headings, terms and definitions are searchable with and without a cached index', () => {
  const data = modified((value, entry) => {
    entry.sections[0].heading += ' Uniquediveheading';
    entry.sections[0].body += ' Uniquédivebody.';
    entry.terms[0].term = 'Uniqueglossaryterm';
    entry.terms[0].definition += ' Uniqueglossarydefinition.';
  });
  const catalog = build(data);
  const cached = catalog.prizes.map((prize) => ({ ...prize, search: searchText(prize) }));

  for (const query of ['Uniquediveheading', 'Uniquedivebody', 'Uniqueglossaryterm', 'Uniqueglossarydefinition']) {
    assert.deepEqual(filterPrizes(catalog.prizes, { q: query }).map((prize) => prize.id), [selectedId], query);
    assert.deepEqual(filterPrizes(cached, { q: query }).map((prize) => prize.id), [selectedId], `Cached ${query}`);
  }
});

test('every deep-dive section and glossary definition renders alongside the unchanged overview', () => {
  const catalog = build();
  const entry = fixture.entries[0];
  const html = render(catalog);

  assert.ok(html.includes('id="prize-deep-dive"'));
  assert.ok(html.includes('In more detail'));
  assert.match(html, /<dl\b[^>]*class="[^"]*\bkey-terms\b/);
  for (const section of entry.sections) {
    assert.ok(html.includes(escape(section.heading)), section.heading);
    assert.ok(html.includes(escape(section.body)), section.heading);
  }
  for (const term of entry.terms) {
    assert.ok(html.includes(escape(term.term)), term.term);
    assert.ok(html.includes(escape(term.definition)), term.term);
  }
  assert.ok(html.includes(escape(baseline.prizes[0].explanation.overview)));
});

test('deep-dive evidence links directly to its identified sources with readable names and safe new-tab attributes', () => {
  const html = render(build());
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];

  for (const source of fixture.entries[0].sources) {
    const matches = anchors.filter((match) => match[1].includes(`href="${escape(source.url)}"`));
    assert.ok(matches.length, `${source.id}: source URL renders as a link`);
    assert.ok(matches.some((match) => `${match[1]} ${match[2]}`.includes(escape(source.title))), `${source.id}: a readable source title accompanies the destination`);
    for (const match of matches) {
      assert.match(match[1], /target="_blank"/);
      assert.match(match[1], /rel="[^"]*\bnoopener\b/);
    }
  }
});

test('deep-dive headings, body text, glossary text and evidence titles cannot inject HTML', () => {
  const hostile = '<img src=x onerror="alert(1)"> & <script>bad()</script>';
  const data = modified((value, entry) => {
    entry.sections[0].heading = `Heading ${hostile}`;
    entry.sections[0].body = `Body ${hostile}`;
    entry.terms[0].term = `Term ${hostile}`;
    entry.terms[0].definition = `Definition ${hostile}`;
    entry.sources[0].title = `Source ${hostile}`;
  });
  const html = render(build(data));

  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  for (const label of ['Heading', 'Body', 'Term', 'Definition', 'Source']) assert.ok(html.includes(escape(`${label} ${hostile}`)), label);
});

test('provided deep-dive collections reject missing awards, duplicates and unknown prize IDs', () => {
  const incomplete = modified((value) => value.entries.pop());
  const duplicate = modified((value) => value.entries.push(structuredClone(value.entries[0])));
  const unknown = modified((value) => value.entries.push({ ...value.entries[0], id: '9999-physics' }));

  for (const data of [incomplete, duplicate, unknown, { ...fixture, entries: [] }]) {
    assert.throws(() => build(data), /deep.?dive|coverage|missing|duplicate|unknown|invalid/i);
  }
  for (const invalid of [null, 7, 'entry']) {
    assert.throws(() => build(modified((value) => { value.entries[0] = invalid; })), /Invalid or duplicate deep-dive ID/);
  }
});

test('invalid collection and prose-array shapes fail with a validation error', () => {
  for (const entries of [null, {}, 'entries']) {
    assert.throws(() => build({ ...fixture, entries }), /deep.?dive|entries|array|invalid/i);
  }
  for (const field of ['sections', 'terms', 'sources']) {
    for (const invalid of [null, {}, 'text', []]) {
      const data = modified((value, entry) => { entry[field] = invalid; });
      assert.throws(() => build(data), /deep.?dive|section|term|source|array|required|invalid/i, `${field}: ${JSON.stringify(invalid)}`);
    }
  }
});

test('blank or non-string section and glossary prose is rejected before publication', () => {
  for (const [collection, field] of [['sections', 'heading'], ['sections', 'body'], ['terms', 'term'], ['terms', 'definition']]) {
    for (const invalid of ['', '  ', null, 7]) {
      const data = modified((value, entry) => { entry[collection][0][field] = invalid; });
      assert.throws(() => build(data), /deep.?dive|section|term|heading|body|definition|missing|invalid|required/i, `${collection}.${field}: ${JSON.stringify(invalid)}`);
    }
  }
});

test('every section and glossary term must identify at least one valid supporting source', () => {
  for (const collection of ['sections', 'terms']) {
    for (const references of [[], null, 's1', [null], [''], ['unknown-source'], ['s1', 'unknown-source']]) {
      const data = modified((value, entry) => { entry[collection][0].sourceIds = references; });
      assert.throws(() => build(data), /deep.?dive|source|reference|evidence|required|invalid/i, `${collection}: ${JSON.stringify(references)}`);
    }
  }
});

test('source references are resolved within their own prize rather than across the collection', () => {
  const data = modified((value, entry) => {
    value.entries[1].sources.push({ id: 'other-prize-only', title: 'Evidence belonging to another award', url: 'https://www.nobelprize.org/' });
    entry.sections[0].sourceIds = ['other-prize-only'];
  });

  assert.throws(() => build(data), /deep.?dive|source|reference|invalid/i);
});

test('source IDs are nonempty and unique within each prize and source titles are readable', () => {
  const duplicate = modified((value, entry) => entry.sources.push({ ...entry.sources[0], title: 'A different source with a duplicate ID' }));
  assert.throws(() => build(duplicate), /deep.?dive|source|duplicate|invalid/i);
  for (const field of ['id', 'title']) {
    for (const invalid of ['', '  ', null, 2]) {
      const data = modified((value, entry) => { entry.sources[0][field] = invalid; });
      assert.throws(() => build(data), /deep.?dive|source|missing|invalid|required/i, `${field}: ${JSON.stringify(invalid)}`);
    }
  }
});

test('deep-dive source destinations reject executable, insecure and malformed URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'http://www.nobelprize.org/', 'https://', '//www.nobelprize.org/', '', null]) {
    const data = modified((value, entry) => { entry.sources[0].url = url; });
    assert.throws(() => build(data), /deep.?dive|source|url|https|invalid/i, String(url));
  }
});

test('the production build requires the deep-dive file and validates full coverage before emitting it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nobel-deep-dive-build-'));
  const runBuild = () => spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: directory, encoding: 'utf8' });
  try {
    await Promise.all([
      cp(new URL('../scripts/', import.meta.url), join(directory, 'scripts'), { recursive: true }),
      cp(new URL('../site/', import.meta.url), join(directory, 'site'), { recursive: true }),
      mkdir(join(directory, 'data')),
      writeFile(join(directory, 'package.json'), '{"type":"module"}\n'),
    ]);
    await Promise.all(fileNames.map((name, index) => writeFile(join(directory, 'data', name), JSON.stringify(inputs[index]))));

    const absent = runBuild();
    assert.notEqual(absent.status, 0, 'Production must not silently omit all deep dives');
    assert.match(`${absent.stdout}\n${absent.stderr}`, /deep-dives|deep.?dive/i);
    await writeFile(join(directory, 'data/deep-dives.json'), JSON.stringify(modified((value) => value.entries.pop())));
    const incomplete = runBuild();
    assert.notEqual(incomplete.status, 0, 'Production must not silently omit one award');
    assert.match(`${incomplete.stdout}\n${incomplete.stderr}`, /deep.?dive|missing|coverage/i);
    await writeFile(join(directory, 'data/deep-dives.json'), JSON.stringify(fixture));
    const complete = runBuild();
    assert.equal(complete.status, 0, complete.stderr);
    const built = JSON.parse(await readFile(join(directory, 'dist/data/catalog.json'), 'utf8'));
    assert.equal(built.meta.deepDiveCount, prizeIds.length);
    assert.deepEqual(built.prizes.map((prize) => prize.deepDive), fixture.entries);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
