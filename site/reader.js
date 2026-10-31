import { REASSESSMENTS, relatedConnections } from './model.js';
import { escape, category, people, title, formatCitation, relationLabel } from './view-helpers.js';

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const transition = /^(?:However|Yet|Nevertheless|By contrast|In contrast|Later|Subsequent(?:ly)?|After|Following|Meanwhile|Over time|Today|The results?\b|These findings|This (?:result|work|approach|discovery)|It (?:helped|also)|In (?:18|19|20)\d{2})/i;
const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

// Keep the supplied wording intact. Prefer a change in argument or time for a
// paragraph break; otherwise use a complete sentence near the middle.
function paragraphs(value) {
  return String(value || '').split(/\n\s*\n/).filter((part) => part.trim()).flatMap((part) => {
    const sentences = [...sentenceSegmenter.segment(part)].map(({ segment }) => segment);
    if (wordCount(part) < 85 || sentences.length < 3) return [part];
    const candidates = sentences.slice(1).map((sentence, index) => {
      const before = sentences.slice(0, index + 1).join('');
      const after = sentences.slice(index + 1).join('');
      return { index: index + 1, before, after, pivot: transition.test(sentence.trim()), distance: Math.abs(before.length - after.length) };
    }).filter((candidate) => wordCount(candidate.before) >= 25 && wordCount(candidate.after) >= 25);
    if (!candidates.length) return [part];
    const totalWords = wordCount(part);
    const balanced = candidates.filter((candidate) => wordCount(candidate.before) >= totalWords * .35 && wordCount(candidate.after) >= totalWords * .35);
    const preferred = balanced.length ? balanced : candidates;
    preferred.sort((a, b) => Number(b.pivot) - Number(a.pivot) || a.distance - b.distance);
    const chosen = preferred[0];
    return [chosen.before.trimEnd(), chosen.after.trimStart()];
  });
}

function httpsUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Reader source has an invalid URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Reader sources require HTTPS URLs without credentials.');
  return String(value);
}

function externalLink(url, label, className = '') {
  return `<a${className ? ` class="${escape(className)}"` : ''} href="${escape(httpsUrl(url))}" target="_blank" rel="noopener noreferrer">${escape(label)} <span aria-hidden="true">↗</span></a>`;
}

function dateLabel(value) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.endsWith('-00-00')) return value.slice(0, 4);
  const partial = value.endsWith('-00');
  const date = new Date(`${partial ? `${value.slice(0, 7)}-01` : value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { ...(partial ? {} : { day: 'numeric' }), month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function referenceLibrary(prize) {
  const entries = new Map();
  function add(source, context) {
    const url = httpsUrl(source.url);
    if (!source.title?.trim()) throw new TypeError('Reader source requires a readable title.');
    if (!entries.has(url)) entries.set(url, { number: entries.size + 1, url, titles: new Set(), kinds: new Set(), recipients: new Set(), uses: new Map() });
    const entry = entries.get(url);
    entry.titles.add(source.title);
    if (source.kind) entry.kinds.add(source.kind.replaceAll('-', ' '));
    if (source.recipientId) {
      const person = prize.recipients.find((recipient) => recipient.id === source.recipientId);
      if (person) entry.recipients.add(person.name);
    }
    if (context) entry.uses.set(context.id, context.label);
    return entry;
  }
  function references(sources, context) {
    const selected = [...new Set((sources || []).map((source) => add(source, context)))];
    if (!selected.length) return '';
    return `<span class="inline-sources">${selected.map((entry) => `<a href="#source-${entry.number}" data-jump="source-${entry.number}" aria-label="${escape(`Source ${entry.number}: ${[...entry.titles][0]}`)}">[${entry.number}]</a>`).join(' ')}</span>`;
  }
  function render() {
    return `<ol class="source-list reader-references">${[...entries.values()].map((entry) => {
      const [primaryTitle, ...aliases] = entry.titles;
      const metadata = [new URL(entry.url).hostname.replace(/^www\./, ''), ...entry.kinds, ...entry.recipients];
      const uses = [...entry.uses];
      return `<li id="source-${entry.number}" tabindex="-1" value="${entry.number}">
        <span class="reference-number" aria-hidden="true">${entry.number}.</span><div class="reference-content">
          ${externalLink(entry.url, primaryTitle, 'reference-title')}
          <p class="reference-metadata">${metadata.map(escape).join(' · ')}</p>
          ${uses.length ? `<p class="reference-uses">Used in ${uses.map(([id, label]) => `<a href="#${escape(id)}" data-jump="${escape(id)}" aria-label="${escape(`Return to ${label}`)}">${escape(label)}</a>`).join(', ')}</p>` : '<p class="reference-uses">Further reading</p>'}
          ${aliases.length ? `<details class="reference-aliases"><summary>Also cited as</summary>${aliases.map((label) => externalLink(entry.url, label)).join('')}</details>` : ''}
        </div>
      </li>`;
    }).join('')}</ol>`;
  }
  return { add, references, render };
}

function glossaryLinks(terms) {
  const linked = new Set();
  const patterns = terms.map((term, index) => ({
    index,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])${term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
  }));
  function text(value) {
    const remaining = String(value || '');
    const matches = patterns.filter(({ index }) => !linked.has(index)).map(({ index, pattern }) => ({ index, match: pattern.exec(remaining) })).filter(({ match }) => match);
    matches.sort((a, b) => a.match.index - b.match.index || b.match[0].length - a.match[0].length);
    if (!matches.length) return escape(remaining);
    const { index, match } = matches[0];
    linked.add(index);
    return `${escape(remaining.slice(0, match.index))}<a class="term-link" id="term-use-${index + 1}" href="#term-${index + 1}" data-jump="term-${index + 1}" aria-label="${escape(`${match[0]}: read definition`)}">${escape(match[0])}</a>${text(remaining.slice(match.index + match[0].length))}`;
  }
  return { text, linked };
}

function prose(value, renderText, references = '') {
  const parts = paragraphs(value);
  return parts.map((part, index) => `<p>${renderText(part)}${index === parts.length - 1 && references ? ` ${references}` : ''}</p>`).join('');
}

function recipientProfile(person, lookup) {
  const facts = [['Born', person.birth], ['Died', person.death], ['Founded', person.founded]].filter(([, event]) => event && (event.date || event.place));
  const otherPrizes = (person.otherPrizes || []).map((id) => lookup.get(id)).filter(Boolean);
  return `<article class="recipient">
    <h4>${escape(person.name)}</h4>
    ${person.fullName && person.fullName !== person.name ? `<p class="recipient-full-name">${escape(person.fullName)}</p>` : ''}
    <p class="recipient-meta">${escape([`Prize share: ${person.portion}`, person.status && person.status !== 'received' ? person.status : ''].filter(Boolean).join(' · '))}</p>
    ${person.motivation ? `<blockquote>${formatCitation(person.motivation)}</blockquote>` : '<p>The official data does not record a separate motivation.</p>'}
    <dl class="recipient-facts">
      ${facts.map(([label, event]) => `<div><dt>${label}</dt><dd>${escape([dateLabel(event.date), event.place].filter(Boolean).join(' · '))}</dd></div>`).join('')}
      ${person.affiliations?.length ? `<div><dt>At the award</dt><dd>${person.affiliations.map(escape).join('<br>')}</dd></div>` : ''}
    </dl>
    ${person.url ? externalLink(person.url, `${person.name}: official profile`, 'recipient-link') : ''}
    ${otherPrizes.length ? `<div class="repeat-awards"><span>Also awarded</span>${otherPrizes.map((other) => `<button data-prize="${escape(other.id)}">${escape(other.year)} ${escape(category(other.category).name)}</button>`).join('')}</div>` : ''}
  </article>`;
}

function section(id, label, heading, content, className = '') {
  return `<section id="${id}" class="reader-section detail-section ${className}" tabindex="-1" data-section-label="${escape(label)}"><h3>${escape(heading)}</h3>${content}</section>`;
}

export function detail(prize, lookup, allConnections = [], _trail = null) {
  const cat = category(prize.category);
  const explanation = prize.explanation;
  const deepDive = prize.deepDive;
  const terms = deepDive?.terms || [];
  const glossary = glossaryLinks(terms);
  const library = referenceLibrary(prize);
  const edges = relatedConnections(prize.id, allConnections).filter((edge) => lookup.has(edge.from === prize.id ? edge.to : edge.from));
  const contents = [['prize-overview', 'Overview']];
  if (explanation) contents.push(['prize-story', 'The story']);
  if (deepDive) contents.push(['prize-deep-dive', 'In more detail']);
  if (terms.length) contents.push(['prize-terms', 'Key ideas']);
  if (prize.reassessment) contents.push(['prize-reassessment', 'Reassessment']);
  if (prize.impact || prize.detail) contents.push(['prize-context', 'Historical context']);
  contents.push(['prize-laureates', 'Laureates & citation']);
  if (edges.length) contents.push(['prize-connections', 'Connections']);
  contents.push(['prize-reading', 'Sources & reading']);

  const overview = `<header id="prize-overview" class="reader-overview" tabindex="-1" data-section-label="Overview">
    <div class="detail-eyebrow" style="--category:${escape(cat.colour)}"><span class="category-label">${escape(prize.fullCategory)}</span><span class="detail-year">${escape(prize.year)}</span></div>
    <h2 id="prize-title">${escape(title(prize))}</h2>
    <p class="reader-recipients">${escape(people(prize))}</p>
    ${explanation || prize.summary ? `<div class="detail-summary" ${explanation ? 'data-explanation-field="overview"' : ''}>${prose(explanation?.overview || prize.summary, glossary.text)}</div>` : ''}
    <p class="reader-provenance">${explanation || deepDive ? 'An AI-assisted editorial explanation, separate from the official citation.' : 'The official award record, with selected editorial context.'} <a href="#prize-reading" data-jump="prize-reading">Sources and method</a></p>
    ${prize.reassessment ? `<div class="reader-assessment-signal"><strong>${escape(REASSESSMENTS[prize.reassessment.kind] || 'Reassessment')}</strong><span>${escape(prize.reassessment.title)}</span><a href="#prize-reassessment" data-jump="prize-reassessment">Read the reassessment</a></div>` : ''}
  </header>`;

  const story = explanation ? section('prize-story', 'The story', 'The story', [
    ['background', 'The setting'],
    ['work', prize.category === 'literature' ? 'The writing' : prize.category === 'peace' ? 'The work for peace' : 'What they did'],
    ['significance', 'Why it matters'],
  ].map(([field, heading]) => `<div class="story-section"><h4>${heading}</h4><div data-explanation-field="${field}">${prose(explanation[field], glossary.text)}</div></div>`).join('') + `<p class="section-evidence">Sources for this account ${library.references(explanation.sources, { id: 'prize-story', label: 'The story' })}</p>`, 'prize-explanation') : '';

  const deepSources = new Map((deepDive?.sources || []).map((source) => [source.id, source]));
  const identifiedSources = (ids) => ids.map((id) => {
    if (!deepSources.has(id)) throw new TypeError(`Unknown reader source: ${id}`);
    return deepSources.get(id);
  });
  const detailed = deepDive ? section('prize-deep-dive', 'In more detail', 'In more detail', deepDive.sections.map((item, index) => {
    const id = `deep-section-${index + 1}`;
    return `<article id="${id}" class="deep-dive-section" tabindex="-1"><h4>${escape(item.heading)}</h4>${prose(item.body, glossary.text, library.references(identifiedSources(item.sourceIds), { id, label: item.heading }))}</article>`;
  }).join(''), 'deep-dive') : '';

  const reassessment = prize.reassessment ? section('prize-reassessment', 'Reassessment', prize.reassessment.title,
    `<p class="reassessment-kind">${escape(REASSESSMENTS[prize.reassessment.kind] || 'Reassessment')}</p>${prose(prize.reassessment.text, glossary.text, library.references(prize.reassessment.sources, { id: 'prize-reassessment', label: 'Reassessment' }))}`, 'reassessment-box') : '';

  const context = prize.impact || prize.detail ? section('prize-context', 'Historical context', 'The wider story',
    `${prose(prize.impact, glossary.text)}${prose(prize.detail, glossary.text)}<p class="section-evidence">Historical context ${library.references(prize.sources, { id: 'prize-context', label: 'Historical context' })}</p>`) : '';

  const officialRecord = section('prize-laureates', 'Laureates & citation', 'Why it was awarded',
    `<p class="citation-intro">The Nobel citation, in its original wording, for each recipient.</p>${prize.recipients.map((person) => recipientProfile(person, lookup)).join('')}
    <p class="recipient-place-note">Birth and founding places do not indicate nationality. Institutions are those recorded at the award.</p>
    ${externalLink(prize.officialUrl, 'Read the official prize record', 'official-link')}
    ${!explanation ? '<p class="editorial-gap">An additional plain-English explanation has not yet been added for this award.</p>' : ''}`);

  const connections = edges.length ? section('prize-connections', 'Connections', 'Follow the connections', `<p class="reader-section-intro">A selection of sourced relationships. A shared theme does not by itself establish influence.</p>${edges.map((edge, index) => {
    const other = lookup.get(edge.from === prize.id ? edge.to : edge.from);
    const id = `prize-connection-${index + 1}`;
    return `<article class="reader-connection" id="${id}" tabindex="-1"><p class="connection-relation">${escape(relationLabel(edge.relation))}</p><h4>${escape(edge.label)}</h4>${prose(edge.description, glossary.text, library.references(edge.sources, { id, label: edge.label }))}<button class="detail-related" data-prize="${escape(other.id)}"><span class="related-identity">${escape(other.year)} · ${escape(category(other.category).name)}</span><strong>${escape(title(other))}</strong><span class="related-action">Read this prize <span aria-hidden="true">→</span></span></button></article>`;
  }).join('')}`) : '';

  // Render definitions after the narrative so return links can point to its
  // first use, even when that use is in a later historical or connection note.
  const definitions = terms.length ? section('prize-terms', 'Key ideas', 'Key ideas, explained', `<dl class="key-terms">${terms.map((term, index) => {
    const id = `term-${index + 1}`;
    const target = glossary.linked.has(index) ? `term-use-${index + 1}` : 'prize-deep-dive';
    return `<div><dt id="${id}" tabindex="-1">${escape(term.term)}</dt><dd>${escape(term.definition)} ${library.references(identifiedSources(term.sourceIds), { id, label: term.term })}<a class="definition-return" href="#${target}" data-jump="${target}">Back to ${glossary.linked.has(index) ? 'the text' : 'the explanation'}</a></dd></div>`;
  }).join('')}</dl>`, 'key-terms-panel') : '';

  // Include all supplied source records, including extra background reading
  // and alternate titles for an already cited URL. Do not mutate the data.
  for (const source of deepDive?.sources || []) library.add(source, { id: 'prize-deep-dive', label: 'In more detail' });
  for (const source of prize.sources || []) library.add(source, { id: context ? 'prize-context' : 'prize-overview', label: 'Historical context' });
  library.add({ title: 'Official prize record', url: prize.officialUrl }, { id: 'prize-laureates', label: 'Official citation' });
  for (const source of explanation?.furtherReading || []) library.add(source);

  const sources = section('prize-reading', 'Sources & reading', 'Sources & further reading',
    `<p class="reader-section-intro">Numbered references connect each account to its evidence. Follow a source to read the original, or return to the passage that cites it.</p>
    <div class="explanation-sources">${library.render()}</div>
    <div class="reader-method"><h4>How to read this account</h4><p>The explanation is an AI-assisted editorial paraphrase of the linked sources, separate from the official citation. Historical assessments and connections remain a curated selection. Absence of a note does not mean an award has never been questioned.</p><button class="text-button" data-action="about">About the data and methodology</button></div>`);

  const topics = prize.topics?.length ? `<div class="reader-topics"><p class="topic-origin">${prize.topicOrigin === 'keyword' ? 'Topic suggestions from the award citation' : 'Editorial topic labels'}</p><div class="detail-topics">${prize.topics.map((topic) => `<button data-topic="${escape(topic)}">${escape(topic)}</button>`).join('')}</div></div>` : '';

  return `<div class="reader-layout"><aside class="reader-navigation"><details id="reader-contents" open><summary><span>Contents</span><span id="reader-current-section">Overview</span></summary><nav class="detail-contents" aria-label="On this prize page">${contents.map(([id, label], index) => `<button data-jump="${id}"${index === 0 ? ' aria-current="location"' : ''}>${escape(label)}</button>`).join('')}</nav></details></aside>
    <article class="reader-article" aria-labelledby="prize-title">${overview}${story}${detailed}${definitions}${reassessment}${context}${officialRecord}${connections}${topics}${sources}</article></div>`;
}

export function trailNavigation(prize, trail, lookup) {
  if (!trail?.prizeIds?.length) return '';
  const index = trail.prizeIds.indexOf(prize.id);
  const previous = lookup.get(trail.prizeIds[index - 1]);
  const next = lookup.get(trail.prizeIds[index + 1]);
  const inTrail = index >= 0;
  return `<div class="reader-trail-controls"><button class="reader-trail-identity" data-action="trail-overview" aria-label="${escape(`View trail: ${trail.title}`)}"><span class="reader-trail-title">${escape(trail.title)}</span><span class="reader-trail-position">${inTrail ? `Step ${index + 1} of ${trail.prizeIds.length}` : 'Related reading · outside this trail'}</span></button>
    <div class="reader-trail-actions">${inTrail ? `<button data-trail-step="${index - 1}" aria-label="Previous prize"${previous ? ` title="${escape(title(previous))}"` : ' disabled'}><span aria-hidden="true">←</span> <span>Previous</span></button><button data-trail-step="${index + 1}" aria-label="Next prize"${next ? ` title="${escape(title(next))}"` : ' disabled'}><span>Next</span> <span aria-hidden="true">→</span></button>` : '<button data-action="trail-overview">Return to trail</button>'}</div></div>`;
}
