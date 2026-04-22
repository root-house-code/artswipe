// Harvard Art Museums API client. Fallback to AIC.
// Docs: https://github.com/harvardartmuseums/api-docs
// Requires a free API key. Request at: https://harvardartmuseums.org/collections/api

const HARVARD_API = 'https://api.harvardartmuseums.org/object';

const FIELDS = [
  'id', 'title', 'people', 'dated', 'medium',
  'classification', 'culture', 'primaryimageurl',
  'description', 'url',
].join(',');

function normalize(item) {
  const artistName = item.people?.[0]?.name || 'Unknown artist';
  const artistLife = item.people?.[0]?.displaydate
    ? ` (${item.people[0].displaydate})`
    : '';

  return {
    id: `harvard-${item.id}`,
    rawId: item.id,
    title: item.title || 'Untitled',
    artist: artistName + artistLife,
    date: item.dated || '',
    medium: item.medium || '',
    classification: item.classification || '',
    origin: item.culture || '',
    image: item.primaryimageurl,
    imageSmall: item.primaryimageurl, // Harvard doesn't expose size variants directly
    altText: item.description || item.title || '',
    source: 'Harvard',
    sourceUrl: item.url,
  };
}

/**
 * Fetch one page of artworks.
 * @param {number} page - 1-indexed page number
 * @param {number} limit - items per page
 * @returns {Promise<{items: Array, hasMore: boolean}>}
 */
export async function fetchPage(page = 1, limit = 100) {
  const apiKey = import.meta.env.VITE_HARVARD_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Harvard API key missing. Add VITE_HARVARD_API_KEY to .env.local. ' +
      'Get a free key at https://harvardartmuseums.org/collections/api'
    );
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    page: String(page),
    size: String(limit),
    hasimage: '1',
    fields: FIELDS,
    sort: 'rank',
    classification: 'Prints',
  });

  const url = `${HARVARD_API}?${params}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Harvard API returned ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();

  const usable = (payload.records || []).filter(item => item.primaryimageurl);
  const items = usable.map(normalize);

  const totalPages = payload.info?.pages || 0;
  const hasMore = page < totalPages;

  const dropped = (payload.records?.length || 0) - usable.length;
  if (dropped > 0) {
    console.debug(`[Harvard] page ${page}: kept ${items.length}, dropped ${dropped}`);
  }

  return { items, hasMore };
}

export const SOURCE_NAME = 'Harvard Art Museums';
