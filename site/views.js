import { CATEGORIES, REASSESSMENTS, groupPrizes, relatedConnections } from './model.js';

export const escape = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const category = (id) => CATEGORIES.find((c) => c.id === id);
export const people = (prize) => prize.recipients.map((p) => p.name).join(', ');
export const title = (prize) => prize.title || people(prize);
export const citation = (prize) => [...new Set(prize.recipients.map((p) => p.motivation).filter(Boolean))].join('; ');
export const sourceList = (sources) => `<ul class="source-list">${sources.map((s) => `<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a></li>`).join('')}</ul>`;

export function timeline(prizes, bounds) {
  const span = bounds.max - bounds.min + 1;
  const position = (year) => ((year - bounds.min + .5) / span * 100).toFixed(3);
  const years = [];
  for (let year = Math.ceil(bounds.min / 10) * 10; year <= bounds.max; year += 10) years.push(year);
  let first = true;
  return `<section class="timeline-panel" aria-label="Interactive Nobel Prize timeline">
    <div class="chart-heading"><h3>Every dot is a prize. Every prize is a starting point.</h3><p>${bounds.min}–${bounds.max} · ${prizes.length} matching prizes</p></div>
    <div class="timeline-scroll" tabindex="0" role="region" aria-label="Scrollable timeline; use arrow keys on a prize to explore nearby awards">
      <div class="timeline-chart" style="min-width:${Math.max(700, span * 8 + 100)}px">
        <div class="timeline-axis"><span></span><div class="axis-values">${years.map((year) => `<span style="left:${position(year)}%">${year}</span>`).join('')}</div></div>
        ${CATEGORIES.map((cat) => `<div class="timeline-lane" style="--category:${cat.colour}"><div class="lane-label"><i></i>${cat.name}</div><div class="lane-track">${prizes.filter((p) => p.category === cat.id).map((prize) => {
          const tab = first ? '0' : '-1'; first = false;
          return `<button class="prize-dot${prize.summary ? ' has-context' : ''}${prize.reassessment ? ' reassessed' : ''}" style="left:${position(prize.year)}%;width:${100 / span}%" data-prize="${prize.id}" data-year="${prize.year}" data-category="${prize.category}" tabindex="${tab}" aria-label="${escape(`${prize.year} ${cat.name}: ${title(prize)}`)}" title="${escape(`${prize.year} ${cat.name} · ${title(prize)}`)}"></button>`;
        }).join('')}</div></div>`).join('')}
      </div>
    </div>
    <div class="chart-note"><span><i class="ring-key"></i>Outlined dots have a reassessment</span><span>Click to open · Arrow keys to move · Blank years have no matching award</span></div>
  </section>`;
}

function prizeRow(prize) {
  const cat = category(prize.category);
  return `<button class="prize-row" data-prize="${prize.id}" style="--category:${cat.colour}" aria-label="Open ${escape(`${prize.year} ${cat.name}: ${title(prize)}`)}">
    <span class="row-year">${prize.year}</span><span class="row-main"><span class="row-meta"><span class="category-label">${cat.name}</span>${prize.reassessment ? `<span class="reassessment-tag">${REASSESSMENTS[prize.reassessment.kind]}</span>` : prize.summary ? '<span class="context-tag">With context</span>' : ''}</span><span class="row-title">${escape(title(prize))}</span>${prize.title ? `<span class="row-people" style="display:block">${escape(people(prize))}</span>` : ''}<span class="row-description">${escape(prize.summary || citation(prize))}</span></span><span class="row-arrow" aria-hidden="true">↗</span>
  </button>`;
}

export function catalogue(prizes, state, limit) {
  const groups = groupPrizes(prizes, state.group, state.sort);
  let used = 0;
  const total = groups.reduce((sum, [, items]) => sum + items.length, 0);
  const multiGroup = ['country', 'institution', 'topic'].includes(state.group);
  const rows = groups.map(([label, items]) => {
    const available = Math.max(0, limit - used);
    const visible = items.slice(0, available);
    used += visible.length;
    if (!visible.length) return '';
    return `<section class="prize-group"><div class="group-heading"><h3>${escape(label)}</h3><span>${items.length} ${items.length === 1 ? 'prize' : 'prizes'}</span></div>${visible.map(prizeRow).join('')}</section>`;
  }).join('');
  return `<div class="catalogue-heading"><h3>${state.view === 'timeline' ? 'Look a little closer' : 'The prize catalogue'}</h3><p>${multiGroup ? 'A shared prize can appear in more than one group.' : 'Open a prize to meet the people and follow the ideas.'}</p></div>${rows}${total > limit ? `<button class="show-more" data-action="more">Show more · ${Math.min(limit, total)} of ${total}${multiGroup ? ' group entries' : ' prizes'}</button>` : ''}`;
}

export function connectionMap(prizes, edges, bounds) {
  const connectedIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes = prizes.filter((p) => connectedIds.has(p.id)).sort((a, b) => a.year - b.year);
  const width = 1080;
  const min = nodes.length ? Math.min(...nodes.map((p) => p.year)) : bounds.min;
  const max = nodes.length ? Math.max(...nodes.map((p) => p.year)) : bounds.max;
  const activeCategories = CATEGORIES.filter((cat) => nodes.some((p) => p.category === cat.id));
  const positions = new Map();
  const lanes = [];
  let height = 38;
  for (const cat of activeCategories) {
    const rows = [];
    const start = height;
    for (const node of nodes.filter((p) => p.category === cat.id)) {
      const x = 145 + (node.year - min) / Math.max(1, max - min) * (width - 300);
      let slot = rows.findIndex((last) => x - last > 175);
      if (slot === -1) slot = rows.length;
      rows[slot] = x;
      positions.set(node.id, { x, y: start + slot * 72 + 12 });
    }
    height += Math.max(1, rows.length) * 72 + 18;
    lanes.push({ cat, start, end: height });
  }
  const labelLines = (text) => {
    const words = text.split(' '), lines = [''];
    for (const word of words) {
      if (lines.at(-1).length + word.length > 24) lines.push('');
      lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${word}`;
    }
    return [lines[0], lines.length > 2 ? `${lines[1]}…` : lines[1] || ''];
  };
  return `<div class="connection-map" role="region" aria-label="Connections across award years"><svg viewBox="0 0 ${width} ${height + 28}" role="group" aria-label="${nodes.length} prizes connected by ${edges.length} sourced relationships. Use the relationship list below for details.">
    ${lanes.map(({ cat, start, end }) => `<text x="0" y="${start + 17}" fill="${cat.colour}" font-size="12" font-family="inherit">${cat.name}</text><path d="M115 ${end - 12}H${width - 10}" stroke="#edf2f6"/>`).join('')}
    ${edges.map((edge) => { const a = positions.get(edge.from), b = positions.get(edge.to); return `<path class="graph-edge" d="M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}"><title>${escape(edge.label)} (${edge.relation})</title></path>`; }).join('')}
    ${nodes.map((prize) => { const p = positions.get(prize.id), lines = labelLines(title(prize)); return `<a href="?prize=${prize.id}" data-prize="${prize.id}" class="graph-node" aria-label="${escape(`${prize.year} ${category(prize.category).name}: ${title(prize)}`)}"><rect class="node-hit" x="${p.x - 10}" y="${p.y - 27}" width="170" height="68" opacity="0"/><circle cx="${p.x}" cy="${p.y}" r="6.5" fill="${category(prize.category).colour}" stroke="white" stroke-width="2"/><text x="${p.x}" y="${p.y - 14}" class="graph-year">${prize.year}</text><text x="${p.x}" y="${p.y + 23}">${escape(lines[0])}<tspan x="${p.x}" dy="14">${escape(lines[1])}</tspan></text><title>${escape(`${prize.year}: ${title(prize)}`)}</title></a>`; }).join('')}
    <text x="140" y="${height + 16}" font-size="11" fill="#6d8596">Award years ${min}–${max} · Open a node to explore</text>
  </svg></div><p class="field-note" style="margin:-12px 0 22px">Scroll the map sideways on smaller screens. Every connection is explained below.</p>`;
}

export function connections(prizes, edges, lookup, bounds) {
  return `<p class="connections-intro">${edges.length} sourced ${edges.length === 1 ? 'relationship' : 'relationships'} among your matching prizes. Lines connect ideas across award years. Each relationship below explains the link; a shared theme does not by itself establish influence.</p>${connectionMap(prizes, edges, bounds)}<div class="connections-list">${edges.map((edge) => {
    const from = lookup.get(edge.from), to = lookup.get(edge.to);
    return `<article class="connection-entry"><span class="connection-relation">Connection: ${escape(edge.relation)}</span><div class="connection-ends"><button data-prize="${from.id}">${from.year} · ${escape(title(from))}</button><span aria-hidden="true">↔</span><button data-prize="${to.id}">${to.year} · ${escape(title(to))}</button></div><p>${escape(edge.description)}</p><details><summary>Evidence for this connection</summary>${sourceList(edge.sources)}</details></article>`;
  }).join('')}</div>`;
}

export function detail(prize, lookup, allConnections, trail) {
  const cat = category(prize.category);
  const edges = relatedConnections(prize.id, allConnections);
  const reassessment = prize.reassessment;
  const trailIndex = trail?.prizeIds.indexOf(prize.id) ?? -1;
  return `<div class="detail-eyebrow" style="--category:${cat.colour}"><span class="category-label">${escape(prize.fullCategory)}</span><span class="detail-year">${prize.year}</span></div>
    <h2 id="prize-title">${escape(title(prize))}</h2>
    ${prize.summary ? `<p class="detail-summary">${escape(prize.summary)}</p>` : ''}
    <div class="detail-topics">${prize.topics.map((topic) => `<button data-topic="${escape(topic)}">${escape(topic)}</button>`).join('')}</div>
    <p class="topic-origin">${prize.topicOrigin === 'keyword' ? 'Topic suggestions from the award citation' : 'Editorial topic labels'}</p>
    <section class="detail-section"><h3>Why it was awarded</h3>${prize.recipients.map((person) => `<div class="recipient"><h4>${escape(person.name)}</h4><p class="recipient-meta">${escape([`Prize share: ${person.portion}`, person.status !== 'received' ? person.status : '', person.country ? `${person.organisation ? 'Founded' : 'Born'}: ${person.country}` : '', ...person.affiliations].filter(Boolean).join(' · '))}</p>${person.motivation ? `<blockquote>${escape(person.motivation)}</blockquote>` : '<p>The official data does not record a separate motivation.</p>'}</div>`).join('')}<a class="official-link" href="${escape(prize.officialUrl)}" target="_blank" rel="noopener noreferrer">Read the official prize record <span aria-hidden="true">↗</span></a></section>
    ${prize.impact ? `<section class="detail-section"><h3>Why it mattered</h3><p>${escape(prize.impact)}</p><details class="detail-disclosure"><summary>Go a little deeper</summary><p>${escape(prize.detail)}</p></details></section>` : `<div class="editorial-gap">This award has its complete official citation. An additional plain-English explanation has not yet been added. <a href="https://github.com/jhammant/NobelExplorer/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Help tell its story</a>.</div>`}
    ${reassessment ? `<section class="reassessment-box"><span>${REASSESSMENTS[reassessment.kind]}</span><h3>${escape(reassessment.title)}</h3><p>${escape(reassessment.text)}</p>${sourceList(reassessment.sources)}</section>` : ''}
    ${edges.length ? `<section class="detail-section"><h3>Follow the connections</h3><p>See how this work fits into a longer story.</p>${edges.map((edge) => { const related = lookup.get(edge.from === prize.id ? edge.to : edge.from); return `<button class="detail-related" data-prize="${related.id}"><span>${related.year}</span><span><strong>${escape(title(related))}</strong><small>${escape(edge.label)} · ${escape(edge.relation)}</small></span><span aria-hidden="true" style="margin-left:auto">↗</span></button><details class="detail-disclosure"><summary>Why these prizes are connected</summary><p>${escape(edge.description)}</p>${sourceList(edge.sources)}</details>`; }).join('')}</section>` : ''}
    ${prize.sources ? `<section class="detail-section"><h3>Sources for the context</h3>${sourceList(prize.sources)}<p class="field-note">Historical context is editorial commentary. It is separate from the official award citation.</p></section>` : ''}
    ${trailIndex >= 0 ? `<section class="detail-section"><h3>${escape(trail.title)}</h3><p>Step ${trailIndex + 1} of ${trail.prizeIds.length} in this discovery trail.</p><div class="detail-nav"><button data-trail-step="${trailIndex - 1}" ${trailIndex === 0 ? 'disabled' : ''}>← Previous prize</button><button data-trail-step="${trailIndex + 1}" ${trailIndex === trail.prizeIds.length - 1 ? 'disabled' : ''}>Next prize →</button></div></section>` : ''}`;
}

export function about(meta) {
  return `<h3>Every prize, with room to look closer</h3><p>This independent explorer contains ${meta.prizeCount} awarded prizes and ${meta.laureateCount} unique people and organisations, covering ${meta.minYear}–${meta.maxYear}. Shared prizes count once. Repeat winners count once in the laureate total. Years in which no prize was awarded are not counted as prizes.</p>
    <h3>Official facts and editorial context</h3><p>Award years, names, citations, prize shares and institutions come from the <a href="https://www.nobelprize.org/organization/developer-zone-2/" target="_blank" rel="noopener noreferrer">Nobel Prize API</a>. The bundled snapshot was retrieved on ${escape(new Date(meta.retrievedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}. Announced prizes are included in their award year; announcement and presentation can happen on different dates. Every prize links to the official record.</p><p>Additional explanations cover ${meta.contextCount} prizes, with ${meta.reassessmentCount} reassessments and ${meta.connectionCount} sourced connections. This editorial layer is a growing selection, not a complete history of every discovery or controversy. Absence of a note does not mean an award has never been questioned.</p>
    <h3>How to read the connections</h3><p>Each edge has a relationship label, an explanation and sources. “Built on” describes a documented connection. “Related idea” describes a thematic link rather than proof of direct influence. The timeline uses award years, which may be decades after the original discovery. A discovery trail is a reading order, not a claim that one laureate did all the work.</p>
    <h3>Grouping without losing the nuance</h3><ul><li>Country means birthplace (or an organisation’s founding place), using present-day borders as recorded by the API. It does not mean nationality.</li><li>Institution means affiliation at the time of the award, not necessarily where the prizewinning work took place.</li><li>Country, institution and topic groups can overlap. A shared prize may appear in several groups.</li><li>Topics for editorial entries are curated; other topics are suggested by citation keywords. Suggestions can be incomplete and do not establish connections.</li></ul>
    <h3>What does “reassessed” mean?</h3><p>Overturned claims, harms and limitations, ethical controversies, disputed credit and debated awards are separate labels. A later treatment improvement is not automatically a scientific refutation. A recipient’s conduct is not automatically evidence against the awarded discovery. Notes identify the person or part of a shared prize they concern.</p>
    <h3>Six categories</h3><p>The five original prize categories are shown alongside the Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel, first awarded in 1969. “Economics” is the short label used in the controls.</p>
    <h3>Open source, local browsing</h3><p>No account, tracking or paid API is needed. Filters and selected prizes live in the URL, so you can share a view. Prize data is provided under <a href="${escape(meta.terms)}" target="_blank" rel="noopener noreferrer">CC0 with the Nobel API terms of use</a>. This project's code is MIT licensed; its original editorial text is CC BY 4.0. Linked sources retain their own rights. Nobel Explorer is not affiliated with, sponsored by or endorsed by the Nobel Foundation or Nobel Prize Outreach.</p><p><a href="https://github.com/jhammant/NobelExplorer/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Suggest a correction or contribute a sourced connection ↗</a></p>`;
}
