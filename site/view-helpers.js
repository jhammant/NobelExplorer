import { CATEGORIES } from './model.js';

export const escape = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export const category = (id) => CATEGORIES.find((item) => item.id === id);
export const people = (prize) => prize.recipients.map((person) => person.name).join(', ');
export const title = (prize) => prize.title || people(prize);
export const citation = (prize) => [...new Set(prize.recipients.map((person) => person.motivation).filter(Boolean))].join('; ');
export const formatCitation = (value) => escape(value).replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<em>$1</em>');
export const sourceList = (sources) => `<ul class="source-list">${sources.map((source) => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`;
export const relationLabel = (relation) => ({ 'built on': 'Built on earlier work', extended: 'Extended the work', 'related idea': 'Thematic connection', reinterpreted: 'Reinterpreted earlier work' }[relation] || relation);
export const edgeId = (edge) => `${edge.from}:${edge.to}`;
