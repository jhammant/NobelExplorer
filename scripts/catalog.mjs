import { CATEGORIES, REASSESSMENTS, categoryId, inferTopics } from '../site/model.js';

const english = (value) => value?.en || '';
const unique = (items) => [...new Set(items.filter(Boolean))];

export function createCatalog(rawPrizes, rawLaureates, editorial, snapshot, explanations) {
  const people = new Map(rawLaureates.laureates.map((p) => [p.id, p]));
  const notes = new Map(editorial.entries.map((e) => [e.id, e]));
  const stories = new Map((explanations?.entries || []).map((e) => [e.id, e]));
  const lifeEvent = (event) => event ? { date: event.date || event.year || '', place: english(event.place?.locationString) } : undefined;
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
        fullName: english(person.fullName || person.orgName),
        motivation: english(laureate.motivation), portion: laureate.portion,
        organisation: !!person.orgName,
        birth: lifeEvent(person.birth), death: lifeEvent(person.death), founded: lifeEvent(person.founded),
        country: english(place?.countryNow || place?.country),
        countryAtBirth: english(place?.country),
        affiliations: unique((award.affiliations || []).map((a) => english(a.name))),
        status: award.prizeStatus || 'received',
        otherPrizes: person.nobelPrizes.map((p) => `${p.awardYear}-${categoryId(english(p.category))}`).filter((other) => other !== id),
        ...(officialLink?.startsWith('https://www.nobelprize.org/') ? { url: officialLink } : {}),
      };
    });
    const entry = notes.get(id);
    const explanation = stories.get(id);
    return {
      id, year, category, fullCategory: english(prize.categoryFullName), recipients,
      officialUrl: `https://www.nobelprize.org/prizes/${category === 'economics' ? 'economic-sciences' : category}/${year}/summary/`,
      topics: entry?.topics || inferTopics(recipients.map((p) => p.motivation).join(' '), category),
      topicOrigin: entry ? 'editorial' : 'keyword',
      ...(explanation ? { explanation, title: explanation.title, summary: explanation.overview } : {}),
      ...(entry || {}),
    };
  });
  validateEditorial(prizes, editorial);
  if (explanations) validateExplanations(prizes, explanations);
  const years = prizes.map((p) => p.year);
  const ids = new Set(prizes.flatMap((p) => p.recipients.map((r) => r.id)));
  return {
    meta: {
      retrievedAt: snapshot.retrievedAt,
      minYear: Math.min(...years), maxYear: Math.max(...years), prizeCount: prizes.length,
      laureateCount: ids.size,
      contextCount: editorial.entries.length,
      explanationCount: stories.size,
      reassessmentCount: editorial.entries.filter((p) => p.reassessment).length,
      connectionCount: editorial.connections.length,
      source: 'https://api.nobelprize.org/2.1/nobelPrizes',
      terms: 'https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/',
    },
    prizes, connections: editorial.connections, trails: editorial.trails,
  };
}

export function validateExplanations(prizes, explanations) {
  const ids = new Set(prizes.map((prize) => prize.id));
  const seen = new Set();
  if (!Array.isArray(explanations.entries)) throw new Error('Explanation entries must be an array');
  for (const entry of explanations.entries) {
    if (!ids.has(entry.id) || seen.has(entry.id)) throw new Error(`Invalid or duplicate explanation ID: ${entry.id}`);
    seen.add(entry.id);
    for (const key of ['title', 'overview', 'background', 'work', 'significance']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`Missing explanation ${key}: ${entry.id}`);
    }
    if (!entry.sources?.length) throw new Error(`Explanation sources required: ${entry.id}`);
    for (const source of [...entry.sources, ...(entry.furtherReading || [])]) {
      let valid = false;
      try { valid = new URL(source.url).protocol === 'https:'; } catch { /* Report the source with its prize below. */ }
      if (!source.title?.trim() || !valid) throw new Error(`Invalid explanation source: ${entry.id}`);
      if (source.recipientId && !prizes.find((prize) => prize.id === entry.id).recipients.some((person) => person.id === source.recipientId)) {
        throw new Error(`Invalid further reading recipient: ${entry.id}/${source.recipientId}`);
      }
    }
  }
  const missing = [...ids].filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`Missing explanations for ${missing.length} prizes: ${missing.slice(0, 5).join(', ')}`);
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
