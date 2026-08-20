// api/search.js
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

function respondYouTubeError(res, response, data) {
  return res.status(response.status).json({
    error: {
      source: 'youtube',
      code: data?.error?.code || response.status,
      reason: data?.error?.errors?.[0]?.reason || data?.error?.status || 'youtube_error',
      message: data?.error?.message || 'No se pudo consultar YouTube'
    }
  });
}

function compactCache(res) {
  // Cinco minutos en navegador y hasta seis horas compartido; las búsquedas no se repiten inútilmente.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
}

export default async function handler(req, res) {
  const { query, type } = req.query;

  if (type === 'youtube' && (!query || typeof query !== 'string') && req.query.action !== 'playlistItems') {
    return res.status(400).json({ error: { message: 'Falta el término de búsqueda' } });
  }

  try {
    if (type === 'youtube') {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: { message: 'Falta la clave YOUTUBE_API_KEY en Vercel' } });
      }

      // Carga diferida: solo se piden las canciones de una lista cuando el usuario decide abrirla.
      if (req.query.action === 'playlistItems') {
        const playlistId = String(req.query.playlistId || '').trim();
        if (!playlistId) return res.status(400).json({ error: { message: 'Falta playlistId' } });

        const requestedMax = Number.parseInt(req.query.maxResults, 10);
        const maxResults = Number.isInteger(requestedMax) ? Math.min(Math.max(requestedMax, 1), 25) : 20;
        const params = new URLSearchParams({
          part: 'snippet,contentDetails',
          playlistId,
          maxResults: String(maxResults),
          key: apiKey,
          fields: 'items(contentDetails(videoId,videoPublishedAt),snippet(title,channelId,channelTitle,thumbnails)),pageInfo(totalResults)'
        });
        const response = await fetch(`${YOUTUBE_API}/playlistItems?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) return respondYouTubeError(res, response, data);

        // Una consulta batch agrega la duración a cada video de la lista abierta.
        const videoIds = (data.items || []).map(item => item?.contentDetails?.videoId).filter(Boolean);
        if (videoIds.length) {
          const detailsParams = new URLSearchParams({
            part: 'contentDetails,status',
            id: videoIds.join(','),
            key: apiKey,
            fields: 'items(id,contentDetails(duration),status(embeddable))'
          });
          const detailsResponse = await fetch(`${YOUTUBE_API}/videos?${detailsParams.toString()}`);
          const details = await detailsResponse.json();
          if (detailsResponse.ok) {
            const byId = new Map((details.items || []).map(item => [item.id, item]));
            data.items = (data.items || []).filter(item => {
              const detail = byId.get(item?.contentDetails?.videoId);
              if (detail?.status?.embeddable === false) return false;
              item.contentDetails = { ...item.contentDetails, duration: detail?.contentDetails?.duration };
              return true;
            });
          }
        }

        compactCache(res);
        return res.status(200).json(data);
      }

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
        fields: 'items(id(kind,videoId,playlistId,channelId),snippet(title,channelId,channelTitle,thumbnails))'
      });
      if (req.query.channelId && typeof req.query.channelId === 'string') params.set('channelId', req.query.channelId);

      // Solo se filtra embebible cuando la consulta es exclusivamente de video: la API no permite
      // esos filtros al mezclar tipos de recurso.
      if (resourceTypes === 'video') {
        params.set('videoEmbeddable', 'true');
        params.set('videoSyndicated', 'true');
      }

      const response = await fetch(`${YOUTUBE_API}/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) return respondYouTubeError(res, response, data);

      // Una sola consulta batch añade la duración de todos los videos del resultado.
      const videoIds = (data.items || [])
        .filter(item => item?.id?.kind === 'youtube#video' && item.id.videoId)
        .map(item => item.id.videoId);
      if (videoIds.length) {
        const detailsParams = new URLSearchParams({
          part: 'contentDetails,status',
          id: videoIds.join(','),
          key: apiKey,
          fields: 'items(id,contentDetails(duration),status(embeddable))'
        });
        const detailsResponse = await fetch(`${YOUTUBE_API}/videos?${detailsParams.toString()}`);
        const details = await detailsResponse.json();
        if (detailsResponse.ok) {
          const byId = new Map((details.items || []).map(item => [item.id, item]));
          data.items = (data.items || []).filter(item => {
            if (item?.id?.kind !== 'youtube#video') return true;
            const detail = byId.get(item.id.videoId);
            // Ocultamos los que quedaron no embebibles entre la búsqueda y el detalle.
            if (detail?.status?.embeddable === false) return false;
            item.contentDetails = detail?.contentDetails || {};
            return true;
          });
        }
      }

      compactCache(res);
      return res.status(200).json(data);
    }

    if (type === 'openverse') {
      const clientId = process.env.OPENVERSE_CLIENT_ID;
      const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.status(500).json({ error: 'Faltan credenciales de Openverse en Vercel' });

      const tokenResp = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
      });
      const tokenData = await tokenResp.json();
      const searchUrl = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&page_size=20`;
      const searchResp = await fetch(searchUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const searchData = await searchResp.json();
      return res.status(200).json(searchData);
    }

    return res.status(400).json({ error: 'Tipo de búsqueda inválido' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
