// Art Institute of Chicago API client.
// Docs: https://api.artic.edu/docs/
// No API key required. Be polite: <1 req/sec, keep page size reasonable.

const AIC_API = 'https://api.artic.edu/api/v1/artworks';
const IIIF_BASE = 'https://www.artic.edu/iiif/2';

// Fields we need. Keeping the list tight reduces response size.
const FIELDS = [
  'id',
  'title',
  'artist_display',
  'image_id',
  'date_display',
  'medium_display',
  'classification_title',
  'place_of_origin',
  'is_public_domain',
  'thumbnail',
].join(',');

function iiifUrl(imageId, width = 843) {
  // Pattern: {base}/{id}/full/{width},/0/default.jpg
  // width= controls the longest edge. 843 is AIC's recommended default.
  return `${IIIF_BASE}/${imageId}/full/${width},/0/default.jpg`;
}

function normalize(item) {
  return {
    id: `aic-${item.id}`,
    rawId: item.id,
    title: item.title || 'Untitled',
    artist: item.artist_display || 'Unknown artist',
    date: item.date_display || '',
    medium: item.medium_display || '',
    classification: item.classification_title || '',
    origin: item.place_of_origin || '',
    image: iiifUrl(item.image_id, 843),
    imageSmall: iiifUrl(item.image_id, 400),
    altText: item.thumbnail?.alt_text || item.title || '',
    source: 'AIC',
    sourceUrl: `https://www.artic.edu/artworks/${item.id}`,
  };
}

/**
 * Fetch one page of artworks.
 * @param {number} page - 1-indexed page number
 * @param {number} limit - items per page (max 100)
 * @returns {Promise<{items: Array, hasMore: boolean}>}
 */
export async function fetchPage(page = 1, limit = 100) {
  const url = `${AIC_API}?page=${page}&limit=${limit}&fields=${FIELDS}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AIC API returned ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();

  // Keep only items that have an image AND are public domain.
  // Non-public-domain items often have degraded or unavailable IIIF images.
  const usable = (payload.data || []).filter(
    item => item.image_id && item.is_public_domain
  );

  const items = usable.map(normalize);

  const hasMore = page < (payload.pagination?.total_pages || 0);

  // Log what we kept vs dropped so you can tune the filter.
  const dropped = (payload.data?.length || 0) - usable.length;
  if (dropped > 0) {
    console.debug(`[AIC] page ${page}: kept ${items.length}, dropped ${dropped}`);
  }

  return { items, hasMore };
}

export const SOURCE_NAME = 'Art Institute of Chicago';
