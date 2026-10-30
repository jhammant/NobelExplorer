// Cache full official responses. No visitor ever needs to call the Nobel API.
export async function fetchAll(endpoint, key, fetcher = fetch) {
  let next = `https://api.nobelprize.org/2.1/${endpoint}?limit=1000&sort=asc`;
  let result;
  const visited = new Set();
  while (next) {
    const url = new URL(next);
    const knownHosts = ['api.nobelprize.org', 'nobel-external-api-app.azurewebsites.net'];
    if (!['https:', 'http:'].includes(url.protocol) || !knownHosts.includes(url.hostname) || url.port || url.username || url.password || url.pathname !== `/2.1/${endpoint}`) throw new Error(`Unexpected pagination URL for ${key}`);
    // The official API returns HTTP pagination links to its legacy Azure host.
    // Keep pagination parameters but always use the public HTTPS endpoint.
    url.hostname = 'api.nobelprize.org';
    url.protocol = 'https:';
    next = url.href;
    if (visited.has(next)) throw new Error(`Unexpected pagination URL for ${key}`);
    visited.add(next);
    const response = await fetcher(next, { headers: { 'User-Agent': 'NobelExplorer/1.0 (https://github.com/jhammant/NobelExplorer)', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}; existing snapshot retained.`);
    const page = await response.json();
    if (!Array.isArray(page[key]) || !page[key].length) throw new Error(`Empty or invalid ${key} page`);
    if (!result) result = { ...page, [key]: [] };
    result[key].push(...page[key]);
    next = page.links?.next || null;
  }
  if (result.links) delete result.links.next;
  const expected = Number(result.meta?.count);
  if (Number.isFinite(expected) && expected > 0 && result[key].length !== expected) throw new Error(`${key} pagination incomplete: ${result[key].length}/${expected}`);
  return result;
}
