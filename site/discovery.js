import { category, citation, edgeId, escape, people, relationLabel, sourceList, title } from './view-helpers.js';

const FEATURED_PRIZE = '1978-medicine';
const FEATURED_TRAIL = 'reading-life';
const PATH_PRIZES = ['1978-medicine', '1980-chemistry', '1993-chemistry', '2020-chemistry'];
const ALTERNATIVE_PRIZES = ['2016-literature', '1993-peace', '2002-economics'];

function prizeIdentity(prize) {
  return `<span class="discovery-year">${escape(prize.year)}</span><span>${escape(category(prize.category)?.name || prize.fullCategory)}</span>`;
}

function pathNode(prize, selected) {
  return `<button class="path-node${selected ? ' is-selected' : ''}" data-prize="${escape(prize.id)}" aria-label="${escape(`Read ${prize.year}: ${title(prize)}`)}">
    <span class="path-year">${escape(prize.year)}</span><span class="path-marker" aria-hidden="true"></span>
    <strong>${escape(title(prize))}</strong>
  </button>`;
}

function pathRelation(edge) {
  if (!edge) return '<span class="path-relation is-unrecorded">No sourced link yet</span>';
  return `<button class="path-relation${edge.relation === 'related idea' ? ' is-thematic' : ''}" data-connection="${escape(edgeId(edge))}" aria-label="${escape(`${relationLabel(edge.relation)}: ${edge.label}. Read the evidence.`)}">
    <span>${escape(edge.relation)}</span><i aria-hidden="true"></i>
  </button>`;
}

function ideaPlate(prizes, edges, featuredId) {
  if (prizes.length < 2) return '';
  return `<div class="idea-plate" aria-labelledby="idea-plate-title">
    <h2 id="idea-plate-title">A path through the ideas</h2>
    <div class="feature-path">${prizes.map((prize, index) => `<div class="path-stop${edges[index]?.relation === 'related idea' ? ' is-thematic' : ''}${index < prizes.length - 1 && !edges[index] ? ' is-unrecorded' : ''}">${pathNode(prize, prize.id === featuredId)}${index < prizes.length - 1 ? pathRelation(edges[index]) : ''}</div>`).join('')}</div>
    <p class="path-caption">Award years, not discovery dates. A related idea does not establish direct influence.</p>
    <div class="path-key" aria-hidden="true"><span><i></i>Built on earlier work</span><span><i class="is-thematic"></i>Thematic connection</span></div>
    ${edges.some(Boolean) ? `<details class="path-evidence"><summary>Evidence for these connections</summary><div>${edges.filter(Boolean).map((edge) => `<article class="path-explanation"><h3>${escape(edge.label)}</h3><span class="relation-caption">${escape(relationLabel(edge.relation))}</span><p>${escape(edge.description)}</p>${sourceList(edge.sources)}</article>`).join('')}</div></details>` : ''}
  </div>`;
}

function nextConnection(prizes, edge) {
  if (!edge || prizes.length < 2) return '';
  const next = prizes[1];
  return `<div class="path-next"><div class="path-next-label"><span>Next connection</span><button data-connection="${escape(edgeId(edge))}" aria-label="${escape(`Read the evidence: ${edge.label}`)}">${escape(edge.relation)}</button></div>
    <button class="path-next-prize" data-prize="${escape(next.id)}"><span>${escape(next.year)}</span><strong>${escape(title(next))}</strong></button>
    <p>The full trail labels each relationship and its evidence.</p>
  </div>`;
}

function elsewhere(prizes) {
  if (!prizes.length) return '';
  return `<section class="elsewhere" aria-labelledby="elsewhere-title"><h2 id="elsewhere-title">Other ways in</h2><div class="elsewhere-list">${prizes.map((prize) => `<button class="elsewhere-entry" data-prize="${escape(prize.id)}"><span class="elsewhere-meta">${prizeIdentity(prize)}</span><strong>${escape(title(prize))}</strong><span class="elsewhere-people">${escape(people(prize))}</span></button>`).join('')}</div></section>`;
}

export function discovery(catalog, lookup) {
  const prizes = catalog.prizes || [];
  const featured = lookup.get(FEATURED_PRIZE) || prizes.find((prize) => prize.title) || prizes[0];
  if (!featured) return '<section class="discovery-section"><h1>Explore the Nobel prizes</h1><p>The collection is not available yet.</p></section>';

  const trail = (catalog.trails || []).find((item) => item.id === FEATURED_TRAIL);
  const pathPrizes = PATH_PRIZES.map((id) => lookup.get(id)).filter(Boolean);
  const pathEdges = pathPrizes.slice(1).map((prize, index) => (catalog.connections || []).find((edge) => edge.from === pathPrizes[index].id && edge.to === prize.id));
  const alternatives = ALTERNATIVE_PRIZES.map((id) => lookup.get(id)).filter(Boolean);
  const reassessedCount = prizes.filter((prize) => prize.reassessment).length;
  const prizeCount = catalog.meta?.prizeCount ?? prizes.length;
  const laureateCount = catalog.meta?.laureateCount;
  const minYear = catalog.meta?.minYear ?? Math.min(...prizes.map((prize) => prize.year));
  const maxYear = catalog.meta?.maxYear ?? Math.max(...prizes.map((prize) => prize.year));
  const summary = featured.impact || featured.summary || featured.explanation?.overview || citation(featured);

  return `<section class="discovery-section" aria-labelledby="discovery-title">
    <div class="discovery-heading"><p>${trail ? escape(trail.title) : 'A closer look at the Nobel prizes'}</p><button class="text-button" data-destination="ideas">Choose a trail</button></div>
    <div class="feature"><div class="feature-copy"><div class="feature-meta">${prizeIdentity(featured)}</div>
      <h1 class="feature-title" id="discovery-title">${escape(title(featured))}</h1>
      <p class="feature-people">${escape(people(featured))}</p><p class="feature-summary">${escape(summary)}</p>
      <div class="feature-actions"><button class="primary-button" data-prize="${escape(featured.id)}">Read this prize</button>${trail ? `<button class="text-button" data-trail="${escape(trail.id)}">Explore the full trail</button>` : ''}</div>
    </div>${ideaPlate(pathPrizes, pathEdges, featured.id)}${nextConnection(pathPrizes, pathEdges[0])}</div>
    ${elsewhere(alternatives)}
    <div class="discovery-footer"><section class="discovery-browse"><h2>Every prize. A place to start.</h2><p>${escape(prizeCount.toLocaleString('en-GB'))} awarded prizes${laureateCount ? `, ${escape(laureateCount.toLocaleString('en-GB'))} people and organisations` : ''}, ${escape(minYear)}–${escape(maxYear)}.</p><button class="secondary-button" data-destination="browse">Browse all prizes</button></section>
    <section class="discovery-assessment"><h2>Prizes, reconsidered</h2><p>What changed after the award? Explore ${escape(reassessedCount)} sourced reassessments, from disputed credit to overturned claims.</p><button class="text-button" data-destination="reassessments">Explore the reassessments</button><small>A growing curated selection, not a complete account of disputed awards.</small></section></div>
    <p class="discovery-coverage">Official prize records form the complete collection. Historical connections and reassessments are curated selections.</p>
  </section>`;
}
