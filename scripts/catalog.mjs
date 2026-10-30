import { CATEGORIES, REASSESSMENTS, categoryId, inferTopics } from '../site/model.js';

const english = (value) => value?.en || '';
const unique = (items) => [...new Set(items.filter(Boolean))];

export function createCatalog(rawPrizes, rawLaureates, editorial, snapshot) {
  const people = new Map(rawLaureates.laureates.map((p) => [p.id, p]));
  const notes = new Map(editorial.entries.map((e) => [e.id, e]));
  const prizes = rawPrizes.nobelPrizes.filter((p) => p.laureates?.length).map((prize) => {
    const category = categoryId(english(prize.category));
    if (!category) throw new Error(`Unknown category: ${english(prize.category)}`);
    const year = Number(prize.awardYear);
    const id = `${year}-${category}`;
    const recipients = prize.laureates.map((laureate) => {
      const person = people.get(laureate.id);
      if (!person) throw new Error(`Missing laureate ${laureate.id} for ${id}`);
      const award = person.nobelPrizes.find((p) => p.awardYear === prize.awardYear && english(p.category) === english(prize.category));
      if (!award) throw new Error(`Missing matching laureate award for ${id}/${person.id}`);
      const place = person.birth?.place || person.founded?.place;
      const officialLink = award.links?.find((link) => link.rel === 'external')?.href;
      return {
        id: person.id,
        name: english(laureate.knownName || laureate.orgName || person.knownName || person.orgName || person.fullName),
        motivation: english(laureate.motivation), portion: laureate.portion,
        organisation: !!person.orgName,
        country: english(place?.countryNow || place?.country),
        countryAtBirth: english(place?.country),
        affiliations: unique((award.affiliations || []).map((a) => english(a.name))),
        status: award.prizeStatus || 'received',
        ...(officialLink?.startsWith('https://www.nobelprize.org/') ? { url: officialLink } : {}),
      };
    });
    const entry = notes.get(id);
    return {
      id, year, category, fullCategory: english(prize.categoryFullName), recipients,
      officialUrl: `https://www.nobelprize.org/prizes/${category === 'economics' ? 'economic-sciences' : category}/${year}/summary/`,
      topics: entry?.topics || inferTopics(recipients.map((p) => p.motivation).join(' '), category),
      topicOrigin: entry ? 'editorial' : 'keyword',
      ...(entry || {}),
    };
  });
  validateEditorial(prizes, editorial);
  const years = prizes.map((p) => p.year);
  const ids = new Set(prizes.flatMap((p) => p.recipients.map((r) => r.id)));
  return {
    meta: {
      retrievedAt: snapshot.retrievedAt,
      minYear: Math.min(...years), maxYear: Math.max(...years), prizeCount: prizes.length,
      laureateCount: ids.size,
      contextCount: editorial.entries.length,
      reassessmentCount: editorial.entries.filter((p) => p.reassessment).length,
      connectionCount: editorial.connections.length,
      source: 'https://api.nobelprize.org/2.1/nobelPrizes',
      terms: 'https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/',
    },
    prizes, connections: editorial.connections, trails: editorial.trails,
  };
}

export function validateEditorial(prizes, editorial) {
  const ids = new Set(prizes.map((p) => p.id));
  const entryIds = new Set();
  const sources = (items, label) => {
    if (!items?.length) throw new Error(`Sources required: ${label}`);
    for (const source of items) {
      if (!source.title || !source.url?.startsWith('https://')) throw new Error(`Invalid source: ${label}`);
    }
  };
  for (const entry of editorial.entries) {
    if (!ids.has(entry.id) || entryIds.has(entry.id)) throw new Error(`Invalid or duplicate editorial ID: ${entry.id}`);
    entryIds.add(entry.id);
    for (const key of ['title', 'summary', 'impact', 'detail']) if (!entry[key]?.trim()) throw new Error(`Missing ${key}: ${entry.id}`);
    if (!entry.topics?.length) throw new Error(`Topics required: ${entry.id}`);
    sources(entry.sources, entry.id);
    if (entry.reassessment) {
      if (!REASSESSMENTS[entry.reassessment.kind]) throw new Error(`Invalid reassessment kind: ${entry.id}`);
      if (!entry.reassessment.text || !entry.reassessment.title) throw new Error(`Missing reassessment: ${entry.id}`);
      sources(entry.reassessment.sources, `${entry.id} reassessment`);
    }
  }
  const edges = new Set();
  for (const edge of editorial.connections) {
    if (!entryIds.has(edge.from) || !entryIds.has(edge.to) || edge.from === edge.to) throw new Error(`Invalid connection: ${edge.from}/${edge.to}`);
    const key = `${edge.from}/${edge.to}`;
    if (edges.has(key)) throw new Error(`Duplicate connection: ${key}`);
    edges.add(key);
    if (!edge.label || !edge.description || !edge.relation) throw new Error(`Incomplete connection: ${key}`);
    sources(edge.sources, key);
  }
  const trails = new Set();
  for (const trail of editorial.trails) {
    if (!trail.id || trails.has(trail.id)) throw new Error(`Invalid trail: ${trail.id}`);
    trails.add(trail.id);
    if (!trail.prizeIds?.length || trail.prizeIds.some((id) => !entryIds.has(id))) throw new Error(`Missing trail prize: ${trail.id}`);
  }
  if (CATEGORIES.some((c) => !prizes.some((p) => p.category === c.id))) throw new Error('Missing prize category');
}
