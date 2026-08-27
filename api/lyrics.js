const LRCLIB_API = 'https://lrclib.net/api/get';
const APP_USER_AGENT = 'Nowarfy-YouToo/1.0 (https://nowarfy.vercel.app/)';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactCache(res, found = true) {
  res.setHeader('Cache-Control', found
    ? 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400'
    : 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
}

function cleanQuery(value, maxLength = 160) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function unwrapVersionSuffix(value) {
  return normalizeText(value)
    .replace(/\b(official|video|audio|music|lyrics?|lyric|visualizer|hd|hq|4k|remaster(?:ed)?|live|concert|full|version|edit|explicit|clean|topic|vevo)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesField(queryValue, resultValue) {
  const query = unwrapVersionSuffix(queryValue);
  const result = unwrapVersionSuffix(resultValue);
  if (!query || !result) return false;
  return query === result || query.includes(result) || result.includes(query);
}

function durationMatches(requestedDuration, resultDuration) {
  const requested = Number(requestedDuration);
  const result = Number(resultDuration);
  if (!Number.isFinite(requested) || requested <= 0 || !Number.isFinite(result) || result <= 0) return false;
  return Math.abs(requested - result) <= 3;
}

function formatResponse(record, requested) {
  const artistMatched = matchesField(requested.artist, record.artistName);
  const titleMatched = matchesField(requested.title, record.trackName || record.name);
  const durationMatched = durationMatches(requested.duration, record.duration);
  if (!artistMatched || !titleMatched || !durationMatched || record.instrumental || !(record.plainLyrics || record.syncedLyrics)) return null;

  return {
    found: true,
    verified: true,
    verification: {
      artist: artistMatched,
      title: titleMatched,
      duration: durationMatched,
      durationDelta: Number.isFinite(Number(requested.duration)) && Number.isFinite(Number(record.duration))
        ? Math.round((Number(record.duration) - Number(requested.duration)) * 10) / 10
        : null
    },
    track: {
      id: Number(record.id) || null,
      title: String(record.trackName || record.name || '').trim(),
      artist: String(record.artistName || '').trim(),
      album: String(record.albumName || '').trim(),
      duration: Number(record.duration) || null,
      plainLyrics: String(record.plainLyrics || '').trim(),
      syncedLyrics: String(record.syncedLyrics || '').trim(),
      source: 'LRCLIB',
      sourceUrl: 'https://lrclib.net/'
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Método no permitido' } });
  }

  const requested = {
    title: cleanQuery(req.query.title),
    artist: cleanQuery(req.query.artist),
    album: cleanQuery(req.query.album),
    duration: Number(req.query.duration)
  };
  if (!requested.title || !requested.artist) {
    return res.status(400).json({ found: false, error: { message: 'Faltan título y artista' } });
  }

  try {
    const params = new URLSearchParams({
      track_name: requested.title,
      artist_name: requested.artist
    });
    if (requested.album) params.set('album_name', requested.album);
    if (Number.isFinite(requested.duration) && requested.duration > 0 && requested.duration <= 3600) params.set('duration', String(Math.round(requested.duration)));

    const response = await fetch(`${LRCLIB_API}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': APP_USER_AGENT,
        'X-User-Agent': APP_USER_AGENT
      }
    });
    if (response.status === 404) {
      compactCache(res, false);
      return res.status(200).json({ found: false, reason: 'not_found' });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.setHeader('Retry-After', response.headers.get('retry-after') || '30');
      return res.status(response.status === 429 ? 429 : 502).json({
        found: false,
        error: { source: 'lrclib', message: data?.message || 'La fuente de letras no está disponible ahora' }
      });
    }

    const result = formatResponse(data, requested);
    if (!result) {
      compactCache(res, false);
      return res.status(200).json({ found: false, reason: 'metadata_mismatch' });
    }
    compactCache(res, true);
    return res.status(200).json(result);
  } catch (error) {
    console.error('lyrics proxy error', error);
    return res.status(502).json({ found: false, error: { source: 'lrclib', message: 'No se pudo consultar la fuente de letras' } });
  }
}
