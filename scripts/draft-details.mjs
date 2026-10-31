import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const proseFields = ['heading', 'body', 'term', 'definition'];

export function localEndpoint(value) {
  const endpoint = new URL(value);
  if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('The inference endpoint must be a loopback origin, such as http://127.0.0.1:1234.');
  }
  return new URL('/api/v1/chat', endpoint);
}

export function parseDraft(text) {
  const draft = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!draft || proseFields.some((field) => typeof draft[field] !== 'string' || !draft[field].trim())) {
    throw new Error('The model must return four nonempty prose strings.');
  }
  // Citation metadata is supplied by the input, never invented by the model.
  return Object.fromEntries(proseFields.map((field) => [field, draft[field].trim()]));
}

function preparedInputs(items, template, model) {
  const seen = new Set();
  return items.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) throw new Error(`Missing or duplicate input ID: ${item?.id}`);
    seen.add(item.id);
    for (const field of ['prizeId', 'sourceId', 'source_title', 'source_text', 'source_url']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`${item.id}: missing ${field}`);
    }
    if (new URL(item.source_url).protocol !== 'https:') throw new Error(`${item.id}: evidence URL must use HTTPS`);
    const prompt = template.replace(/\{\{(\w+)\}\}/g, (_, field) => {
      if (item[field] === undefined || item[field] === null) throw new Error(`${item.id}: missing prompt field ${field}`);
      return String(item[field]);
    });
    const fingerprint = createHash('sha256').update(JSON.stringify({ item, template, model })).digest('hex');
    return { item, prompt, fingerprint };
  });
}

async function previousResults(output) {
  let text;
  try { text = await readFile(output, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { records: [], needsSeparator: false }; throw error; }
  const records = text.split('\n').filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid saved output on line ${index + 1}; repair it before resuming.`); }
  });
  return { records, needsSeparator: !!text.trim() && !text.endsWith('\n') };
}

export async function draftBatch({ items, output, template, model = 'google/gemma-4-26b-a4b', endpoint = 'http://127.0.0.1:1234', workers = 4, fetchImpl = fetch, onProgress = () => {} }) {
  const url = localEndpoint(endpoint);
  if (!Array.isArray(items) || !items.length) throw new Error('A nonempty input collection is required.');
  if (!Number.isInteger(workers) || workers < 1 || workers > 8) throw new Error('Workers must be an integer from 1 to 8.');
  if (!model.trim() || !template.trim()) throw new Error('Model and prompt template are required.');
  const prepared = preparedInputs(items, template, model);
  const previous = await previousResults(output);
  const completed = new Set(previous.records.filter((entry) => {
    if (!entry.ok || !entry.fingerprint) return false;
    try { parseDraft(JSON.stringify(entry.response)); return true; } catch { return false; }
  }).map((entry) => `${entry.id}:${entry.fingerprint}`));
  const pending = prepared.filter(({ item, fingerprint }) => !completed.has(`${item.id}:${fingerprint}`));
  await mkdir(dirname(output), { recursive: true });
  if (pending.length && previous.needsSeparator) await appendFile(output, '\n');
  let cursor = 0;
  let succeeded = 0;
  let failed = 0;
  let writes = Promise.resolve();
  const started = Date.now();
  const worker = async () => {
    while (cursor < pending.length) {
      const { item, prompt, fingerprint } = pending[cursor++];
      const began = Date.now();
      let result;
      try {
        const response = await fetchImpl(url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(600_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: prompt, system_prompt: 'Return only the requested JSON object. Use only the supplied evidence.', temperature: 0.15, max_output_tokens: 1100, reasoning: 'off', store: false, stream: false }),
        });
        if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status}`);
        const raw = await response.json();
        const text = raw.output.filter((part) => part.type === 'message').map((part) => part.content).join('');
        result = { id: item.id, fingerprint, ok: true, response: parseDraft(text), usage: raw.stats || {} };
        succeeded++;
      } catch (error) {
        result = { id: item.id, fingerprint, ok: false, error: `${error.name}: ${error.message}`.slice(0, 250) };
        failed++;
      }
      result.ms = Date.now() - began;
      writes = writes.then(() => appendFile(output, `${JSON.stringify(result)}\n`));
      await writes;
      onProgress({ completed: succeeded + failed, pending: pending.length, succeeded, failed, skipped: items.length - pending.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, pending.length) }, worker));
  return { succeeded, failed, skipped: items.length - pending.length, elapsedMs: Date.now() - started };
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, output: { type: 'string', default: 'artifacts/detail-drafts.jsonl' },
    model: { type: 'string', default: 'google/gemma-4-26b-a4b' },
    endpoint: { type: 'string', default: 'http://127.0.0.1:1234' }, workers: { type: 'string', default: '4' },
  } });
  if (!values.input) throw new Error('Usage: node scripts/draft-details.mjs --input artifacts/source-items.jsonl');
  if (resolve(values.input) === resolve(values.output)) throw new Error('Input and output must be different files.');
  const inputFile = await stat(values.input);
  let outputFile;
  try { outputFile = await stat(values.output); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (outputFile && inputFile.dev === outputFile.dev && inputFile.ino === outputFile.ino) throw new Error('Input and output must be different files; aliases share the same file.');
  const items = (await readFile(values.input, 'utf8')).split('\n').filter((line) => line.trim()).map(JSON.parse);
  const template = await readFile(new URL('../prompts/prize-section.md', import.meta.url), 'utf8');
  const summary = await draftBatch({ ...values, items, template, workers: Number(values.workers), onProgress: (state) => console.log(`${state.completed}/${state.pending} attempts; ${state.succeeded} drafted; ${state.failed} failed; ${state.skipped} already complete`) });
  console.log(`Finished in ${(summary.elapsedMs / 1000).toFixed(1)}s. Drafts still require source review before publication.`);
  if (summary.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
