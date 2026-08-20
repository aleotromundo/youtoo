// api/search.js
export default async function handler(req, res) {
  const { query, type } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: { message: 'Falta el término de búsqueda' } });
  }

  try {
    // --- BÚSQUEDA EN YOUTUBE (clave privada de Vercel) ---
    if (type === 'youtube') {
      const apiKey = process.env.YOUTUBE_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: { message: 'Falta la clave YOUTUBE_API_KEY en Vercel' } });
      }

      // Solo se admiten tipos válidos de la API. El frontend actual usa video.
      const requestedTypes = String(req.query.resourceTypes || 'video')
        .split(',')
        .map(value => value.trim())
        .filter(value => ['video', 'playlist', 'channel'].includes(value));
      const resourceTypes = requestedTypes.length ? requestedTypes.join(',') : 'video';
      const requestedMaxResults = Number.parseInt(req.query.maxResults, 10);
      const maxResults = Number.isInteger(requestedMaxResults)
        ? Math.min(Math.max(requestedMaxResults, 1), 25)
        : 20;

      const params = new URLSearchParams({
        part: 'snippet',
        type: resourceTypes,
        maxResults: String(maxResults),
        q: query.trim(),
        key: apiKey,
        // Solo devolvemos los datos que el frontend muestra.
        fields: 'items(id(kind,videoId,playlistId,channelId),snippet(title,channelId,channelTitle,thumbnails))'
      });

      if (req.query.channelId && typeof req.query.channelId === 'string') {
        params.set('channelId', req.query.channelId);
      }

      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      const data = await response.json();

      // No transformar errores de Google en 200: el frontend debe saber si se agotó la cuota.
      if (!response.ok) {
        return res.status(response.status).json({
          error: {
            source: 'youtube',
            code: data?.error?.code || response.status,
            reason: data?.error?.errors?.[0]?.reason || data?.error?.status || 'youtube_error',
            message: data?.error?.message || 'No se pudo consultar YouTube'
          }
        });
      }

      // Resultado público y temporal. La CDN evita repetir consultas idénticas entre visitantes.
      // El navegador conserva 5 min; Vercel puede reutilizarlo 6 h y revalidarlo en segundo plano.
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }

    // --- BÚSQUEDA EN OPENVERSE (sin cambios funcionales) ---
    if (type === 'openverse') {
      const clientId = process.env.OPENVERSE_CLIENT_ID;
      const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Faltan credenciales de Openverse en Vercel' });
      }

      const tokenResp = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials'
        })
      });

      const tokenData = await tokenResp.json();
      const token = tokenData.access_token;
      const searchUrl = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&page_size=20`;
      const searchResp = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const searchData = await searchResp.json();
      return res.status(200).json(searchData);
    }

    return res.status(400).json({ error: 'Tipo de búsqueda inválido' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
