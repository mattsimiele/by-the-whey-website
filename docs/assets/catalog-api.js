export const SUPABASE_URL = 'https://sxfulqjshurmegsvcsrm.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nGe3mfatg8TIdfWFNgu9_w_jt3FQDou';
export const CATEGORIES = ['Alpine', 'Blue Cheese', 'Cheddar', 'Fresh Cheese', 'Gouda', 'Hard Aged Cheese', 'Soft Cheese', 'Tomme Style', 'Washed Rind'];

const headers = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  'Content-Type': 'application/json',
};

function publicPhotoUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/cheese-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
  return response.json();
}

export function normalizeCheese(row, ratings = new Map()) {
  const approvedPhoto = row.cheese_photos?.find((photo) => photo.moderation_status === 'approved');
  const summary = ratings.get(row.id) ?? { average: 0, count: 0 };
  return {
    ...row,
    flavor_profile: Array.isArray(row.flavor_profile) ? row.flavor_profile : [],
    pairings: Array.isArray(row.pairings) ? row.pairings : [],
    average_rating: Number(summary.average || 0),
    rating_count: Number(summary.count || 0),
    image_url: publicPhotoUrl(approvedPhoto?.storage_path ?? row.image_path),
  };
}

export async function getRatingSummary() {
  const rows = await request('/rest/v1/rpc/cheese_rating_summary', { method: 'POST', body: '{}' });
  return new Map(rows.map((row) => [row.cheese_id, { average: Number(row.average_rating), count: Number(row.rating_count) }]));
}

export async function getPublicCatalog() {
  const select = encodeURIComponent('*,cheese_photos(storage_path,moderation_status)');
  const [rows, ratings] = await Promise.all([
    request(`/rest/v1/cheeses?select=${select}&status=eq.published&order=name.asc`),
    getRatingSummary(),
  ]);
  return rows.map((row) => normalizeCheese(row, ratings));
}

export async function getPublicCheese(slug) {
  const select = encodeURIComponent('*,cheese_photos(storage_path,moderation_status)');
  const safeSlug = encodeURIComponent(slug);
  const [rows, ratings] = await Promise.all([
    request(`/rest/v1/cheeses?select=${select}&status=eq.published&slug=eq.${safeSlug}&limit=1`),
    getRatingSummary(),
  ]);
  return rows[0] ? normalizeCheese(rows[0], ratings) : null;
}

export function locationLabel(cheese) {
  return [cheese.location_city, cheese.location_region, cheese.location_country].filter(Boolean).join(', ');
}

export function ratingLabel(cheese) {
  if (!cheese.rating_count) return 'Not rated yet';
  return `${cheese.average_rating.toFixed(1)} from ${cheese.rating_count} ${cheese.rating_count === 1 ? 'tasting' : 'tastings'}`;
}
