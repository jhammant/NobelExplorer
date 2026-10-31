import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { draftBatch } from '../scripts/draft-details.mjs';

const run = promisify(execFile);
const runner = fileURLToPath(new URL('../scripts/draft-details.mjs', import.meta.url));
const template = 'Explain {{source_text}}.';
const source = {
  id: '1901-physics:s1', prizeId: '1901-physics', sourceId: 's1',
  year: 1901, category: 'physics', people: 'Wilhelm Conrad Röntgen',
  context: 'A reviewed introduction.', assessment: '',
  source_title: 'Official evidence', source_text: 'A verified historical account.',
  source_url: 'https://www.nobelprize.org/prizes/physics/1901/ceremony-speech/',
  word_budget: 180, body_min: 100, body_max: 140, term_role: 'a distinct useful concept',
};
const prose = {
  heading: 'Investigating a new observation', body: 'The supplied evidence explains the experiment and its limits.',
  term: 'Observation', definition: 'Information obtained by examining an event or measuring a property.',
};
const response = () => ({ ok: true, json: async () => ({ output: [{ type: 'message', content: JSON.stringify(prose) }] }) });

async function scratch(context) {
  const directory = await mkdtemp(join(tmpdir(), 'nobel-draft-qa-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function serve(context, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('resuming a valid JSONL file without a final newline preserves separate complete records', async (context) => {
  const output = join(await scratch(context), 'drafts.jsonl');
  await draftBatch({ items: [source], output, template, fetchImpl: async () => response() });
  await writeFile(output, (await readFile(output, 'utf8')).trimEnd());
  const additional = { ...source, id: '1901-physics:s2', sourceId: 's2' };

  const summary = await draftBatch({ items: [source, additional], output, template, fetchImpl: async () => response() });
  const lines = (await readFile(output, 'utf8')).trim().split('\n');

  assert.equal(summary.skipped, 1);
  assert.equal(summary.succeeded, 1);
  assert.equal(lines.length, 2, 'appending must not join two JSON objects on the same line');
  assert.deepEqual(lines.map(JSON.parse).map((entry) => entry.id), [source.id, additional.id]);
});

for (const [name, createAlias] of [['symbolic link', symlink], ['hard link', link]]) {
  test(`CLI rejects an output ${name} pointing to the evidence input before inference`, async (context) => {
    const directory = await scratch(context);
    const input = join(directory, 'evidence.jsonl');
    const output = join(directory, 'drafts.jsonl');
    const original = `${JSON.stringify(source)}\n`;
    await writeFile(input, original);
    await createAlias(input, output);
    let requests = 0;
    const endpoint = await serve(context, (request, reply) => {
      requests++;
      request.resume();
      reply.writeHead(200, { 'Content-Type': 'application/json' });
      reply.end(JSON.stringify({ output: [{ type: 'message', content: JSON.stringify(prose) }] }));
    });

    let exitCode = 0;
    try { await run(process.execPath, [runner, '--input', input, '--output', output, '--endpoint', endpoint]); }
    catch (error) { exitCode = error.code; }

    assert.deepEqual({ exitCode, requests, unchanged: await readFile(input, 'utf8') === original },
      { exitCode: 1, requests: 0, unchanged: true }, 'aliases must not append model output to source evidence');
  });
}

test('native fetch refuses HTTP redirects without forwarding the inference request', async (context) => {
  const output = join(await scratch(context), 'drafts.jsonl');
  let originalRequests = 0;
  let redirectedRequests = 0;
  const endpoint = await serve(context, (request, reply) => {
    request.resume();
    if (request.url === '/api/v1/chat') {
      originalRequests++;
      reply.writeHead(307, { Location: '/redirected' });
    } else {
      redirectedRequests++;
      reply.writeHead(200, { 'Content-Type': 'application/json' });
    }
    reply.end('{}');
  });

  const summary = await draftBatch({ items: [source], output, template, endpoint });
  const record = JSON.parse((await readFile(output, 'utf8')).trim());

  assert.equal(summary.failed, 1);
  assert.equal(record.ok, false);
  assert.equal(originalRequests, 1);
  assert.equal(redirectedRequests, 0);
});
