// api/music-tags.js
// Busca etiquetas de género públicas (MusicBrainz, sin clave) para elegir un
// perfil musical más preciso que las palabras clave del título.
const MB_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'YouToo/1.0 (https://github.com/aleotromundo/youtoo)';

function clean(value, max = 120) {
  return String(value || '')
    .replace(/\s*[([{][^)\]}]{0,120}[)\]}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function quoteLucene(value) {
  return `"${String(value).replace(/["\\]/g, ' ')}"`;
}

export default async function handler(req, res) {
  const title = clean(req.query?.title);
  const artist = clean(req.query?.artist, 80);
  if (!title) return res.status(400).json({ error: 'Falta el título' });

  // Un día en navegador y hasta una semana compartido: las etiquetas casi no cambian.
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');

  try {
    let query = `recording:${quoteLucene(title)}`;
    if (artist) query += ` AND artist:${quoteLucene(artist)}`;
    const search = await fetch(`${MB_API}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!search.ok) return res.status(200).json({ genres: [] });
    const found = (await search.json())?.recordings?.[0];
    const tags = (found?.tags || [])
      .filter((tag) => Number(tag.count) > 0)
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 8)
      .map((tag) => String(tag.name || '').toLowerCase());
    return res.status(200).json({ genres: tags, matched: Boolean(found) });
  } catch (error) {
    return res.status(200).json({ genres: [] });
  }
};
