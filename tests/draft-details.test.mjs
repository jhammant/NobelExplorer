import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftBatch, localEndpoint, parseDraft } from '../scripts/draft-details.mjs';

const template = 'Explain {{source_title}} using {{source_text}}.';
const source = { id: '1901-physics:s1', prizeId: '1901-physics', sourceId: 's1', source_title: 'Evidence', source_text: 'A verified source excerpt.', source_url: 'https://www.nobelprize.org/prizes/physics/1901/summary/' };
const prose = { heading: 'A new measurement', body: 'An explanation supported by the supplied evidence.', term: 'Measurement', definition: 'A comparison of an observed property with a defined reference.' };
const response = (draft = prose) => ({ ok: true, json: async () => ({ output: [{ type: 'reasoning', content: 'Do not save internal reasoning.' }, { type: 'message', content: JSON.stringify(draft) }], stats: { total_output_tokens: 30 } }) });
const scratch = async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'nobel-drafts-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'drafts.jsonl');
};
const saved = async (path) => (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);

test('local drafting refuses remote endpoints, credentials and URL suffixes before sending evidence', async (context) => {
  const output = await scratch(context);
  let requests = 0;
  for (const endpoint of ['https://example.com', 'http://127.0.0.1.example.com', 'file:///tmp/model', 'http://user:secret@localhost:1234', 'http://localhost:1234/proxy', 'http://localhost:1234/?redirect=remote', 'http://localhost:1234/#remote']) {
    await assert.rejects(draftBatch({ items: [source], output, template, endpoint, fetchImpl: async () => { requests++; return response(); } }), /loopback|URL/);
  }
  assert.equal(requests, 0);
  for (const endpoint of ['http://127.0.0.1:1234', 'http://localhost:1234/', 'http://[::1]:1234']) assert.equal(localEndpoint(endpoint).pathname, '/api/v1/chat');
});

test('saved drafts use message output only, retain source identity and disable storage and redirects', async (context) => {
  const output = await scratch(context);
  let request;
  const summary = await draftBatch({ items: [source], output, template, fetchImpl: async (url, options) => { request = { url, options }; return response({ ...prose, sources: ['https://invented.example/'] }); } });
  const [record] = await saved(output);

  assert.equal(summary.succeeded, 1);
  assert.equal(request.url.origin, 'http://127.0.0.1:1234');
  assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.parse(request.options.body).store, false);
  assert.equal(JSON.parse(request.options.body).reasoning, 'off');
  assert.equal(record.id, source.id);
  assert.deepEqual(record.response, prose);
  assert.equal(record.fingerprint.length, 64);
  assert.ok(!(await readFile(output, 'utf8')).includes('internal reasoning'));
});

test('resuming skips valid identical drafts and regenerates changed evidence, model or prompt', async (context) => {
  const output = await scratch(context);
  let requests = 0;
  const options = { items: [source], output, template, fetchImpl: async () => { requests++; return response(); } };
  await draftBatch(options);

  const resumed = await draftBatch(options);
  await draftBatch({ ...options, items: [{ ...source, source_text: 'Corrected source material.' }] });
  await draftBatch({ ...options, model: 'another-local-model' });
  await draftBatch({ ...options, template: `${template} Use a clearer explanation.` });

  assert.equal(resumed.skipped, 1);
  assert.equal(requests, 4);
  assert.equal((await saved(output)).length, 4);
});

test('failed requests are saved and retried on resume while other items remain usable', async (context) => {
  const output = await scratch(context);
  const items = [source, { ...source, id: '1901-physics:s2', sourceId: 's2' }];
  let requests = 0;
  const first = await draftBatch({ items, output, template, workers: 1, fetchImpl: async () => ++requests === 1 ? { ok: false, status: 503 } : response() });
  const retried = await draftBatch({ items, output, template, fetchImpl: async () => { requests++; return response(); } });
  const records = await saved(output);

  assert.equal(first.failed, 1);
  assert.equal(first.succeeded, 1);
  assert.equal(retried.skipped, 1);
  assert.equal(retried.succeeded, 1);
  assert.equal(requests, 3);
  assert.match(records[0].error, /HTTP 503/);
  assert.equal(records.at(-1).id, source.id);
});

test('missing evidence, duplicate IDs and missing template inputs fail before inference', async (context) => {
  const output = await scratch(context);
  let requests = 0;
  const fetchImpl = async () => { requests++; return response(); };
  for (const items of [[], [source, source], [{ ...source, source_text: '' }], [{ ...source, source_url: 'http://example.com' }]]) {
    await assert.rejects(draftBatch({ items, output, template, fetchImpl }));
  }
  await assert.rejects(draftBatch({ items: [source], output, template: '{{missing}}', fetchImpl }), /missing prompt field/);
  assert.equal(requests, 0);
});

test('worker limits bound simultaneous inference and append a complete record per item', async (context) => {
  const output = await scratch(context);
  const items = Array.from({ length: 7 }, (_, index) => ({ ...source, id: `1901-physics:s${index + 1}`, sourceId: `s${index + 1}` }));
  let active = 0;
  let peak = 0;
  const summary = await draftBatch({ items, output, template, workers: 2, fetchImpl: async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((done) => setTimeout(done, 5));
    active--;
    return response();
  } });

  assert.equal(peak, 2);
  assert.equal(summary.succeeded, items.length);
  assert.deepEqual(new Set((await saved(output)).map((record) => record.id)), new Set(items.map((item) => item.id)));
  for (const workers of [0, 9, 1.5, NaN]) await assert.rejects(draftBatch({ items, output, template, workers }), /Workers/);
});

test('malformed model text cannot become a successful draft or corrupt earlier output', async (context) => {
  const output = await scratch(context);
  assert.deepEqual(parseDraft(`\`\`\`json\n${JSON.stringify(prose)}\n\`\`\``), prose);
  for (const text of ['not JSON', 'null', JSON.stringify({ ...prose, definition: '' }), JSON.stringify({ ...prose, body: 4 })]) assert.throws(() => parseDraft(text));
  await writeFile(output, '{unfinished\n');
  let requests = 0;
  await assert.rejects(draftBatch({ items: [source], output, template, fetchImpl: async () => { requests++; return response(); } }), /repair it before resuming/);
  assert.equal(requests, 0);
  assert.equal(await readFile(output, 'utf8'), '{unfinished\n');
});
