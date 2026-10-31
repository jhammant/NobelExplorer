import { CATEGORIES, REASSESSMENTS, groupPrizes } from './model.js';
import { escape, category, people, title, citation, sourceList, relationLabel, edgeId } from './view-helpers.js';

export function prizeRow(prize, reassessed = false) {
  const cat = category(prize.category);
  const description = reassessed && prize.reassessment ? prize.reassessment.text : prize.summary || citation(prize);
  return `<button class="prize-row" data-prize="${escape(prize.id)}" style="--category:${cat.colour}" aria-label="Open ${escape(`${prize.year} ${cat.name}: ${title(prize)}`)}">
    <span class="row-year">${prize.year}</span><span class="row-main"><span class="row-meta"><span class="category-label">${cat.name}</span>${prize.reassessment ? `<span class="reassessment-tag">${REASSESSMENTS[prize.reassessment.kind]}</span>` : ''}</span><span class="row-title">${escape(title(prize))}</span><span class="row-people">${escape(people(prize))}</span>${reassessed && prize.reassessment ? `<strong class="row-assessment">${escape(prize.reassessment.title)}</strong>` : ''}<span class="row-description">${escape(description)}</span></span><span class="row-arrow" aria-hidden="true">→</span></button>`;
}

export function catalogue(prizes, state, limit = 30) {
  const groups = groupPrizes(prizes, state.group, state.sort);
  const bucket = groups.some(([name]) => name === state.bucket) ? state.bucket : '';
  const selectedGroups = bucket ? groups.filter(([name]) => name === bucket) : groups;
  const overlap = ['country', 'institution', 'topic'].includes(state.group);
  const total = selectedGroups.reduce((sum, [, items]) => sum + items.length, 0);
  const groupName = { decade: 'decade', year: 'year', category: 'category', topic: 'topic', country: 'birth / founding country', institution: 'institution at award' }[state.group] || 'group';
  let used = 0;
  const rows = selectedGroups.map(([label, items]) => {
    const visible = items.slice(0, Math.max(0, limit - used));
    used += visible.length;
    if (!visible.length) return '';
    return `<section class="prize-group"><div class="group-heading"><h3>${escape(label)}</h3><span>${items.length} ${items.length === 1 ? 'prize' : 'prizes'}</span></div>${visible.map((prize) => prizeRow(prize, state.page === 'reassessments' || state.lens === 'reassessed' || REASSESSMENTS[state.lens])).join('')}</section>`;
  }).join('');
  return `<div class="group-navigation"><label for="group-choice">Choose ${escape(groupName)}</label><select id="group-choice"><option value="">All ${escape(groupName === 'category' ? 'categories' : 'groups')}</option>${groups.map(([name, items]) => `<option value="${escape(name)}" ${bucket === name ? 'selected' : ''}>${escape(name)} (${items.length})</option>`).join('')}</select>${bucket ? '<button class="text-button" data-group-choice="">Show all groups</button>' : ''}</div>
    ${state.group === 'category' ? `<div class="category-groups" role="group" aria-label="Choose a category group">${groups.map(([name, items]) => `<button data-group-choice="${escape(name)}" aria-pressed="${bucket === name}"><span>${escape(name)}</span><span>${items.length}</span></button>`).join('')}</div>` : ''}
    ${overlap ? '<p class="field-note group-note">A shared prize can appear in more than one group. Counts below are group entries; the result count above is unique prizes.</p>' : ''}
    ${state.group === 'country' ? '<p class="field-note">Grouped by birthplace or founding place using present-day borders, not nationality.</p>' : ''}
    ${state.group === 'institution' ? '<p class="field-note">Institutions are affiliations at the award, not necessarily where the work took place.</p>' : ''}
    ${rows}${total > limit ? `<button class="show-more" data-action="more">Show more · ${Math.min(limit, total)} of ${total}${overlap ? ' group entries' : ' prizes'}</button>` : ''}`;
}

export function timelineSelection(prize) {
  return `<p class="field-note">Selected award</p><button class="timeline-preview" data-prize="${escape(prize.id)}"><span>${prize.year} ${category(prize.category).name}</span><strong>${escape(title(prize))}</strong><span>${escape(people(prize))}</span><span class="preview-action">Read this prize</span></button>`;
}

export function timeline(prizes, bounds, fullBounds = bounds) {
  const span = bounds.max - bounds.min + 1;
  const position = (year) => ((year - bounds.min + .5) / span * 100).toFixed(3);
  const years = [];
  const interval = span <= 15 ? 1 : 10;
  for (let year = Math.ceil(bounds.min / interval) * interval; year <= bounds.max; year += interval) years.push(year);
  const periods = [];
  for (let year = Math.floor(fullBounds.min / 10) * 10; year <= fullBounds.max; year += 10) periods.push({ label: `${year}s`, value: year, min: Math.max(year, fullBounds.min), max: Math.min(year + 9, fullBounds.max) });
  const selected = periods.find((period) => period.min === bounds.min && period.max === bounds.max);
  const custom = !selected && (bounds.min !== fullBounds.min || bounds.max !== fullBounds.max);
  let first = true;
  return `<section class="timeline-panel" aria-label="Interactive Nobel Prize timeline"><div class="chart-heading"><div><h2>Explore by award year</h2><p>Choose a decade, then open a named prize. These are award dates, not discovery dates.</p></div><label class="timeline-period">Focus on a period<select id="period-choice"><option value="all" ${!selected && !custom ? 'selected' : ''}>All years</option>${custom ? `<option value="custom" selected>${bounds.min}–${bounds.max}</option>` : ''}${periods.map((period) => `<option value="${period.value}" ${selected === period ? 'selected' : ''}>${period.label}</option>`).join('')}</select></label></div>
    <div class="timeline-scroll" tabindex="0" role="region" aria-label="Scrollable timeline; use arrow keys on a prize to explore nearby awards"><div class="timeline-chart" style="min-width:${Math.max(620, span * 8 + 100)}px"><div class="timeline-axis"><span></span><div class="axis-values">${years.map((year) => `<span style="left:${position(year)}%">${year}</span>`).join('')}</div></div>
      ${CATEGORIES.map((cat) => `<div class="timeline-lane" style="--category:${cat.colour}"><div class="lane-label"><i></i>${cat.name}</div><div class="lane-track">${prizes.filter((prize) => prize.category === cat.id).map((prize) => {
        const tabindex = first ? '0' : '-1'; first = false;
        return `<button class="prize-dot${prize.reassessment ? ' reassessed' : ''}" style="left:${position(prize.year)}%;width:${100 / span}%" data-prize="${escape(prize.id)}" data-year="${prize.year}" data-category="${prize.category}" tabindex="${tabindex}" aria-label="${escape(`${prize.year} ${cat.name}: ${title(prize)}`)}" title="${escape(`${prize.year} ${cat.name}: ${title(prize)}`)}"></button>`;
      }).join('')}</div></div>`).join('')}</div></div><div class="chart-note"><span><i class="ring-key"></i>Outlined dots have a reassessment</span><span>Arrow keys move between awards. Named results follow below.</span></div><div id="timeline-selection">${prizes[0] ? timelineSelection(prizes[0]) : ''}</div></section>`;
}

export function connectionMap(prizes, edges, bounds) {
  const ids = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes = prizes.filter((prize) => ids.has(prize.id)).sort((a, b) => a.year - b.year);
  const width = 1080;
  const min = nodes.length ? Math.min(...nodes.map((prize) => prize.year)) : bounds.min;
  const max = nodes.length ? Math.max(...nodes.map((prize) => prize.year)) : bounds.max;
  const positions = new Map();
  const lanes = [];
  let height = 38;
  for (const cat of CATEGORIES.filter((item) => nodes.some((prize) => prize.category === item.id))) {
    const rows = [];
    const start = height;
    for (const prize of nodes.filter((item) => item.category === cat.id)) {
      const x = 145 + (prize.year - min) / Math.max(1, max - min) * (width - 350);
      let slot = rows.findIndex((last) => x - last > 190);
      if (slot === -1) slot = rows.length;
      rows[slot] = x;
      positions.set(prize.id, { x, y: start + slot * 86 + 14 });
    }
    height += Math.max(1, rows.length) * 86 + 24;
    lanes.push({ cat, start, end: height });
  }
  const lines = (value) => {
    const output = [''];
    for (const word of value.split(' ')) {
      if (output.at(-1).length + word.length > 24) output.push('');
      output[output.length - 1] += `${output.at(-1) ? ' ' : ''}${word}`;
    }
    return [output[0], output.length > 2 ? `${output[1]}…` : output[1] || ''];
  };
  return `<div class="connection-map" role="region" aria-label="Connections across award years" tabindex="0"><svg viewBox="0 0 ${width} ${height + 30}" role="group" aria-label="${nodes.length} prizes connected by ${edges.length} sourced relationships"><defs><marker id="relation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#244ccc"/></marker></defs>
    ${lanes.map(({ cat, start, end }) => `<text class="map-category" x="0" y="${start + 18}">${cat.name}</text><path d="M115 ${end - 12}H${width - 10}" stroke="#d6dde5"/>`).join('')}
    ${edges.map((edge) => {
      const a = positions.get(edge.from), b = positions.get(edge.to);
      const path = `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
      return `<a class="graph-edge-link" href="#connection-evidence" data-connection="${escape(edgeId(edge))}" aria-label="${escape(`${edge.label}: ${relationLabel(edge.relation)}`)}"><path d="${path}" fill="none" stroke="transparent" stroke-width="16"/><path class="graph-edge" data-relation="${escape(edge.relation)}" d="${path}" fill="none" stroke="#244ccc" stroke-width="1.8" ${edge.relation === 'related idea' ? 'stroke-dasharray="5 6"' : 'marker-end="url(#relation-arrow)"'}/><title>${escape(`${edge.label}: ${edge.relation}`)}</title></a>`;
    }).join('')}
    ${nodes.map((prize) => { const point = positions.get(prize.id), label = lines(title(prize)); return `<a href="?prize=${escape(prize.id)}" data-prize="${escape(prize.id)}" class="graph-node" aria-label="${escape(`${prize.year} ${category(prize.category).name}: ${title(prize)}`)}"><rect class="node-hit" x="${point.x - 10}" y="${point.y - 28}" width="180" height="77" opacity="0"/><circle cx="${point.x}" cy="${point.y}" r="7" fill="${category(prize.category).colour}" stroke="white" stroke-width="2"/><text x="${point.x}" y="${point.y - 15}" class="graph-year">${prize.year}</text><text x="${point.x}" y="${point.y + 24}">${escape(label[0])}<tspan x="${point.x}" dy="17">${escape(label[1])}</tspan></text><title>${escape(title(prize))}</title></a>`; }).join('')}
    <text x="140" y="${height + 18}" class="graph-year">Award years ${min}–${max}. Select a connection for its evidence.</text></svg></div>`;
}

export function connections(prizes, edges, lookup, bounds, options = {}) {
  if (!edges.length) return '';
  const selected = edges.find((edge) => edgeId(edge) === options.connection) || edges[0];
  const from = lookup.get(selected.from), to = lookup.get(selected.to);
  const endpoint = (prize) => `<button data-prize="${escape(prize.id)}" class="connection-endpoint"><span>${prize.year} ${category(prize.category).name}</span><strong>${escape(title(prize))}</strong><small>${escape(people(prize))}</small></button>`;
  return `<section class="connection-browser" aria-label="Sourced connections"><div class="connection-picker"><label for="connection-choice">Choose a connection</label><select id="connection-choice">${edges.map((edge) => `<option value="${escape(edgeId(edge))}" ${edge === selected ? 'selected' : ''}>${lookup.get(edge.from).year}–${lookup.get(edge.to).year}: ${escape(edge.label)}</option>`).join('')}</select><p>${edges.length} sourced ${edges.length === 1 ? 'connection' : 'connections'} in this view. This is a growing selection.</p></div>
    ${options.focus ? `<div class="scope-notice"><p>Showing connections to ${escape(title(lookup.get(options.focus)))}. Related prizes outside your filters are included.</p><button data-action="clear-connection-focus">Return to filtered connections</button></div>` : ''}
    <article class="selected-connection" id="selected-connection" tabindex="-1"><div class="connection-route" data-relation="${escape(selected.relation)}">${endpoint(from)}<div class="relation-caption"><span aria-hidden="true">${selected.relation === 'related idea' ? '↔' : '→'}</span><strong>${escape(relationLabel(selected.relation))}</strong></div>${endpoint(to)}</div><div class="connection-explanation"><h2>${escape(selected.label)}</h2><p>${escape(selected.description)}</p>${selected.relation === 'related idea' ? '<p class="field-note">This is a thematic link, not a claim of direct influence.</p>' : ''}<details class="connection-evidence" id="connection-evidence" open><summary>Evidence for this connection</summary>${sourceList(selected.sources)}</details></div></article>
    <details class="full-map"><summary>View the full connection map (${edges.length} relationships)</summary><p class="field-note">Solid arrows show documented development or reinterpretation; dashed lines show thematic links. Each link opens its explanation. The list above offers the same relationships without a wide canvas.</p>${connectionMap(prizes, edges, bounds)}</details></section>`;
}

export function trailLanding(trail, lookup) {
  return `<section class="trail-banner" aria-labelledby="trail-title"><div class="trail-introduction"><div><h2 id="trail-title">${escape(trail.title)}</h2><p>${escape(trail.description)}</p><p class="field-note">${trail.prizeIds.length} prizes in a suggested reading order. The order does not by itself establish influence.</p></div><button class="text-button" data-action="clear-trail">Other trails</button></div><button class="primary-button" data-prize="${escape(trail.prizeIds[0])}">Start the trail</button><ol class="trail-stops">${trail.prizeIds.map((id, index) => { const prize = lookup.get(id); return `<li><button data-prize="${escape(id)}"><span class="trail-stop-number">${index + 1}</span><span class="trail-stop-year">${prize.year}</span><span class="trail-stop-title">${escape(title(prize))}<small>${category(prize.category).name}</small></span></button></li>`; }).join('')}</ol></section>`;
}

export function ideasIntro(catalog, trail) {
  return `<div class="ideas-intro"><p>Follow a reading trail or explore a relationship between two awards. Our ${catalog.meta.connectionCount} sourced connections are a growing editorial selection.</p><details class="trail-chooser" ${trail ? '' : 'open'}><summary>${trail ? 'Choose another trail' : 'Six trails through the prizes'}</summary><div class="trail-library" id="trail-list">${catalog.trails.map((item) => `<button class="trail-card${trail?.id === item.id ? ' active' : ''}" data-trail="${escape(item.id)}"><strong>${escape(item.title)}</strong><span>${escape(item.description)}</span><small>${item.prizeIds.length} prizes</small></button>`).join('')}</div></details></div>`;
}

export function reassessmentIntro(prizes, lens) {
  const descriptions = { overturned: 'An awarded claim was later overturned.', harmful: 'Documented harms or limits of the work.', ethical: 'Ethical questions about conduct or use.', credit: 'Who contributed and who was recognised.', debated: 'The choice or later record is contested.' };
  const all = prizes.filter((prize) => prize.reassessment);
  return `<section class="assessment-intro" aria-label="About reassessments"><p>${all.length} sourced reassessments in a growing editorial selection. An absent note does not mean an award has never been questioned. A recipient’s conduct is not automatically evidence against the awarded work.</p><div class="assessment-types" role="group" aria-label="Kind of reassessment"><button data-lens="reassessed" aria-pressed="${lens === 'reassessed'}"><strong>All reassessments <span>${all.length}</span></strong><small>Explore the different kinds of question.</small></button>${Object.entries(REASSESSMENTS).map(([key, label]) => `<button data-lens="${key}" aria-pressed="${lens === key}"><strong>${escape(label)} <span>${all.filter((prize) => prize.reassessment.kind === key).length}</span></strong><small>${descriptions[key]}</small></button>`).join('')}</div></section>`;
}
