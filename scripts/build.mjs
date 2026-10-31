import { readFile, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { createCatalog } from './catalog.mjs';

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [prizes, laureates, editorial, snapshot, explanations] = await Promise.all(['nobel-prizes.json', 'laureates.json', 'editorial.json', 'snapshot.json', 'explanations.json'].map(read));
const catalog = createCatalog(prizes, laureates, editorial, snapshot, explanations);
const destination = new URL('../dist/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(new URL('../site/', import.meta.url), destination, { recursive: true });
await mkdir(new URL('data/', destination), { recursive: true });
await writeFile(new URL('data/catalog.json', destination), JSON.stringify(catalog));
await writeFile(new URL('.nojekyll', destination), '');
console.log(`Built ${catalog.meta.prizeCount} prizes, ${catalog.meta.laureateCount} laureates, ${catalog.meta.explanationCount} explanations, ${catalog.meta.contextCount} context notes and ${catalog.meta.connectionCount} connections.`);
