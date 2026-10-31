export const CATEGORIES = [
  { id: 'physics', name: 'Physics', fullName: 'Physics', colour: '#3478bd' },
  { id: 'chemistry', name: 'Chemistry', fullName: 'Chemistry', colour: '#b47715' },
  { id: 'medicine', name: 'Medicine', fullName: 'Physiology or Medicine', colour: '#157d70' },
  { id: 'literature', name: 'Literature', fullName: 'Literature', colour: '#a44c7c' },
  { id: 'peace', name: 'Peace', fullName: 'Peace', colour: '#6864b5' },
  { id: 'economics', name: 'Economics', fullName: 'Economic Sciences', colour: '#bb5c43' },
];

export const REASSESSMENTS = {
  overturned: 'Overturned claim',
  harmful: 'Harms & limitations',
  ethical: 'Ethical controversy',
  credit: 'Disputed credit',
  debated: 'Debated award',
};

export const TOPIC_RULES = [
  ['DNA & genetics', /\b(dna|rna|genetic|genome|chromosom|nucleic|heredity|gene\b|genes\b)/i],
  ['Quantum physics', /\b(quantum|quanta|photoelectric|entangl|wave mechanics)/i],
  ['Light & imaging', /\b(light|laser|optical|optics|microscop|x-ray|imaging|tomograph|photograph|holograph|diode)/i],
  ['Atoms & particles', /\b(atom|nuclear|neutron|proton|electron|particle|radioactiv|fission|neutrino|boson|meson)/i],
  ['Infection & immunity', /\b(infect|immun|bacter|virus|viral|malaria|parasite|antibod|vaccin|penicillin|tuberculosis|typhus)/i],
  ['Neuroscience', /\b(nervous|nerve|neuron|brain|synap|sense|vision|olfact|hearing|lobotom|leucotom|optogenetic)/i],
  ['Cells & molecules', /\b(cell|protein|enzyme|ribosom|metabol|membrane|biochem|molecular|hormon)/i],
  ['Energy & materials', /\b(energy|semiconductor|superconduct|transistor|polymer|battery|batteries|graphene|fullerene|magnet|crystal|liquid)/i],
  ['Chemistry & synthesis', /\b(synthes|cataly|reaction|chemical|organic|bond|molecule)/i],
  ['Climate & environment', /\b(climate|environment|ozone|atmospher|global warming|ecolog)/i],
  ['Cosmos & gravity', /\b(cosmic|cosmos|universe|cosmolog|astronom|astrophys|pulsar|gravit|relativity|planet|black hole|stars)/i],
  ['Health & treatment', /\b(therapy|therapies|treatment|disease|medicine|surgery|transplant|insulin|cancer|diagnos|vitamin|physiolog)/i],
  ['Markets & incentives', /\b(market|auction|incentive|game theory|mechanism|contract|finance|financial|option|equilibrium|allocation)/i],
  ['Growth & institutions', /\b(growth|institution|poverty|development|economic history|macroeconomic|employment|monetary|consumption|welfare)/i],
  ['Peace & human rights', /\b(peace|democra|rights|humanitarian|refugee|war|disarm|freedom|nuclear weapons|reconciliation)/i],
  ['Literature & language', /\b(poet|poetry|novel|literatur|literary|narrative|drama|writer|epic|story|stories|language)/i],
];

export function normalise(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function categoryId(name) {
  return CATEGORIES.find((category) => category.fullName === name)?.id;
}

export function inferTopics(text, category) {
  const topics = TOPIC_RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (topics.length) return topics;
  const fallback = { peace: 'Peace & human rights', literature: 'Literature & language', economics: 'Economics', physics: 'Physics', chemistry: 'Chemistry', medicine: 'Health & treatment' };
  return [fallback[category]];
}

export function searchText(prize) {
  return normalise([
    prize.year, prize.category, prize.fullCategory, prize.title, prize.summary,
    prize.impact, prize.detail, ...prize.topics,
    prize.explanation?.title, prize.explanation?.overview, prize.explanation?.background,
    prize.explanation?.work, prize.explanation?.significance,
    prize.reassessment?.title, prize.reassessment?.text,
    ...prize.recipients.flatMap((person) => [person.name, person.fullName, person.motivation, person.country, ...person.affiliations]),
  ].filter(Boolean).join(' '));
}

export function filterPrizes(prizes, filters = {}) {
  const terms = normalise(filters.q || '').trim().split(/\s+/).filter(Boolean);
  return prizes.filter((prize) => {
    if (filters.categories?.length && !filters.categories.includes(prize.category)) return false;
    if (filters.from && prize.year < Number(filters.from)) return false;
    if (filters.to && prize.year > Number(filters.to)) return false;
    if (filters.topic && !prize.topics.includes(filters.topic)) return false;
    if (filters.country && !prize.recipients.some((p) => p.country === filters.country)) return false;
    if (filters.institution && !prize.recipients.some((p) => p.affiliations.includes(filters.institution))) return false;
    if (filters.lens === 'context' && !prize.detail) return false;
    if (filters.lens === 'reassessed' && !prize.reassessment) return false;
    if (REASSESSMENTS[filters.lens] && prize.reassessment?.kind !== filters.lens) return false;
    if (terms.length && !terms.every((term) => (prize.search || searchText(prize)).includes(term))) return false;
    return true;
  });
}

export function groupPrizes(prizes, by = 'decade', sort = 'newest') {
  const groups = new Map();
  for (const prize of [...prizes].sort((a, b) => sort === 'oldest' ? a.year - b.year : b.year - a.year)) {
    const keys = by === 'category' ? [CATEGORIES.find((c) => c.id === prize.category).name]
      : by === 'topic' ? prize.topics
        : by === 'country' ? prize.recipients.map((p) => p.country || 'Not recorded')
          : by === 'institution' ? prize.recipients.flatMap((p) => p.affiliations.length ? p.affiliations : ['Not recorded'])
            : by === 'year' ? [String(prize.year)] : [`${Math.floor(prize.year / 10) * 10}s`];
    for (const key of new Set(keys)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(prize);
    }
  }
  return [...groups].sort(([a], [b]) => ['year', 'decade'].includes(by)
    ? (sort === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)) : a.localeCompare(b));
}

export function relatedConnections(id, connections) {
  return connections.filter((edge) => edge.from === id || edge.to === id);
}

export function visibleConnections(prizes, connections) {
  const ids = new Set(prizes.map((p) => p.id));
  return connections.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
}

export function readState(search, bounds) {
  const params = new URLSearchParams(search);
  const from = Math.max(bounds.min, Math.min(bounds.max, Number(params.get('from')) || bounds.min));
  const to = Math.max(from, Math.min(bounds.max, Number(params.get('to')) || bounds.max));
  const valid = (name, values, fallback) => values.includes(params.get(name)) ? params.get(name) : fallback;
  return {
    q: (params.get('q') || '').slice(0, 300),
    categories: (params.get('categories') || '').split(',').filter((id) => CATEGORIES.some((c) => c.id === id)),
    from, to, topic: params.get('topic') || '', country: params.get('country') || '', institution: params.get('institution') || '',
    lens: valid('lens', ['all', 'context', 'reassessed', ...Object.keys(REASSESSMENTS)], 'all'),
    view: valid('view', ['timeline', 'catalogue', 'connections'], 'timeline'),
    group: valid('group', ['decade', 'year', 'category', 'topic', 'country', 'institution'], 'decade'),
    sort: valid('sort', ['newest', 'oldest'], 'newest'),
    prize: params.get('prize') || '', trail: params.get('trail') || '',
  };
}

export function writeState(state, bounds) {
  const params = new URLSearchParams();
  for (const key of ['q', 'topic', 'country', 'institution', 'prize', 'trail']) if (state[key]) params.set(key, state[key]);
  if (state.categories.length) params.set('categories', state.categories.join(','));
  if (state.from !== bounds.min) params.set('from', state.from);
  if (state.to !== bounds.max) params.set('to', state.to);
  for (const [key, fallback] of Object.entries({ lens: 'all', view: 'timeline', group: 'decade', sort: 'newest' })) {
    if (state[key] !== fallback) params.set(key, state[key]);
  }
  return params.toString();
}
