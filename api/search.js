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
  // Cinco minutos en navegador y hasta seis horas compartido para catálogos públicos.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
}

function boundedMax(value, fallback = 24) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 50) : fallback;
}

function parseChannelReference(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const idFromUrl = raw.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i)?.[1];
  if (idFromUrl || /^UC[\w-]{20,}$/i.test(raw)) return { id: idFromUrl || raw };
  const handleFromUrl = raw.match(/youtube\.com\/@([^/?#]+)/i)?.[1];
  const plainHandle = raw.match(/^@?([\w.-]{3,})$/)?.[1];
  const handle = handleFromUrl || plainHandle;
  return handle ? { handle: `@${decodeURIComponent(handle)}` } : null;
}

async function youtubeRequest(path, params) {
  const response = await fetch(`${YOUTUBE_API}/${path}?${params.toString()}`);
  const data = await response.json();
  return { response, data };
}

async function enrichVideoItems(items, apiKey) {
  const videoIds = (items || [])
    .map(item => item?.contentDetails?.videoId || (item?.id?.kind === 'youtube#video' ? item.id.videoId : null))
    .filter(Boolean);
  if (!videoIds.length) return items || [];

  const detailsParams = new URLSearchParams({
    part: 'contentDetails,status,statistics,snippet',
    id: videoIds.join(','),
    key: apiKey,
    fields: 'items(id,contentDetails(duration),status(embeddable),statistics(viewCount,likeCount,commentCount),snippet(publishedAt,liveBroadcastContent))'
  });
  const { response, data } = await youtubeRequest('videos', detailsParams);
  if (!response.ok) return items || [];

  const byId = new Map((data.items || []).map(item => [item.id, item]));
  return (items || []).filter(item => {
    const videoId = item?.contentDetails?.videoId || (item?.id?.kind === 'youtube#video' ? item.id.videoId : null);
    if (!videoId) return true;
    const detail = byId.get(videoId);
    if (detail?.status?.embeddable === false) return false;
    item.contentDetails = { ...item.contentDetails, ...detail?.contentDetails };
    item.statistics = detail?.statistics || {};
    item.videoSnippet = detail?.snippet || {};
    return true;
  });
}

async function fetchPlaylistItems({ playlistId, pageToken, maxResults, apiKey }) {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: String(maxResults),
    key: apiKey,
    fields: 'nextPageToken,prevPageToken,pageInfo(totalResults,resultsPerPage),items(contentDetails(videoId,videoPublishedAt),snippet(title,description,channelId,channelTitle,position,thumbnails,publishedAt))'
  });
  if (pageToken) params.set('pageToken', pageToken);
  const { response, data } = await youtubeRequest('playlistItems', params);
  if (!response.ok) return { response, data };
  data.items = await enrichVideoItems(data.items, apiKey);
  return { response, data };
}

async function fetchChannelPlaylists({ channelId, pageToken, maxResults, apiKey }) {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,status',
    channelId,
    maxResults: String(maxResults),
    key: apiKey,
    fields: 'nextPageToken,prevPageToken,pageInfo(totalResults,resultsPerPage),items(id,snippet(title,description,channelId,channelTitle,publishedAt,thumbnails),contentDetails(itemCount),status(privacyStatus))'
  });
  if (pageToken) params.set('pageToken', pageToken);
  return youtubeRequest('playlists', params);
}

export default async function handler(req, res) {
  const { query, type } = req.query;
  const action = String(req.query.action || '');
  const libraryActions = new Set(['playlistItems', 'channelOverview', 'channelPlaylists', 'channelUploads']);

  if (type === 'youtube' && (!query || typeof query !== 'string') && !libraryActions.has(action)) {
    return res.status(400).json({ error: { message: 'Falta el término de búsqueda' } });
  }

  try {
    if (type === 'youtube') {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) return res.status(500).json({ error: { message: 'Falta la clave YOUTUBE_API_KEY en Vercel' } });

      if (action === 'playlistItems') {
        const playlistId = String(req.query.playlistId || '').trim();
        if (!playlistId) return res.status(400).json({ error: { message: 'Falta playlistId' } });
        const { response, data } = await fetchPlaylistItems({
          playlistId,
          pageToken: String(req.query.pageToken || '').trim(),
          maxResults: boundedMax(req.query.maxResults, 24),
          apiKey
        });
        if (!response.ok) return respondYouTubeError(res, response, data);
        compactCache(res);
        return res.status(200).json(data);
      }

      if (action === 'channelOverview') {
        const reference = parseChannelReference(req.query.channelId || req.query.channelRef);
        if (!reference) return res.status(400).json({ error: { message: 'Falta un ID, handle o enlace público de canal' } });
        const channelsParams = new URLSearchParams({
          part: 'snippet,statistics,contentDetails',
          key: apiKey,
          fields: 'items(id,snippet(title,description,customUrl,publishedAt,thumbnails),statistics(subscriberCount,videoCount,viewCount),contentDetails(relatedPlaylists(uploads)))'
        });
        if (reference.id) channelsParams.set('id', reference.id);
        else channelsParams.set('forHandle', reference.handle);
        const { response: channelResponse, data: channelData } = await youtubeRequest('channels', channelsParams);
        if (!channelResponse.ok) return respondYouTubeError(res, channelResponse, channelData);
        const channel = channelData.items?.[0];
        if (!channel) return res.status(404).json({ error: { message: 'Canal no encontrado o handle no disponible' } });
        const channelId = channel.id;

        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
        const [playlistsResult, uploadsResult] = await Promise.all([
          fetchChannelPlaylists({ channelId, pageToken: String(req.query.playlistsPageToken || '').trim(), maxResults: boundedMax(req.query.maxResults, 24), apiKey }),
          uploadsPlaylistId
            ? fetchPlaylistItems({ playlistId: uploadsPlaylistId, pageToken: String(req.query.uploadsPageToken || '').trim(), maxResults: boundedMax(req.query.maxResults, 24), apiKey })
            : Promise.resolve({ response: { ok: true }, data: { items: [] } })
        ]);
        if (!playlistsResult.response.ok) return respondYouTubeError(res, playlistsResult.response, playlistsResult.data);
        if (!uploadsResult.response.ok) return respondYouTubeError(res, uploadsResult.response, uploadsResult.data);
        compactCache(res);
        return res.status(200).json({ channel, playlists: playlistsResult.data, uploads: uploadsResult.data });
      }

      if (action === 'channelPlaylists') {
        const channelId = String(req.query.channelId || '').trim();
        if (!channelId) return res.status(400).json({ error: { message: 'Falta channelId' } });
        const { response, data } = await fetchChannelPlaylists({
          channelId,
          pageToken: String(req.query.pageToken || '').trim(),
          maxResults: boundedMax(req.query.maxResults, 24),
          apiKey
        });
        if (!response.ok) return respondYouTubeError(res, response, data);
        compactCache(res);
        return res.status(200).json(data);
      }

      if (action === 'channelUploads') {
        const uploadsPlaylistId = String(req.query.uploadsPlaylistId || '').trim();
        if (!uploadsPlaylistId) return res.status(400).json({ error: { message: 'Falta uploadsPlaylistId' } });
        const { response, data } = await fetchPlaylistItems({
          playlistId: uploadsPlaylistId,
          pageToken: String(req.query.pageToken || '').trim(),
          maxResults: boundedMax(req.query.maxResults, 24),
          apiKey
        });
        if (!response.ok) return respondYouTubeError(res, response, data);
        compactCache(res);
        return res.status(200).json(data);
      }

      const requestedTypes = String(req.query.resourceTypes || 'video')
        .split(',')
        .map(value => value.trim())
        .filter(value => ['video', 'playlist', 'channel'].includes(value));
      const resourceTypes = requestedTypes.length ? requestedTypes.join(',') : 'video';
      const maxResults = boundedMax(req.query.maxResults, 20);

      const params = new URLSearchParams({
        part: 'snippet',
        type: resourceTypes,
        maxResults: String(maxResults),
        q: query.trim(),
        key: apiKey,
        fields: 'items(id(kind,videoId,playlistId,channelId),snippet(title,description,publishedAt,channelId,channelTitle,thumbnails))'
      });
      if (req.query.channelId && typeof req.query.channelId === 'string') params.set('channelId', req.query.channelId);
      if (resourceTypes === 'video') {
        params.set('videoEmbeddable', 'true');
        params.set('videoSyndicated', 'true');
      }

      const { response, data } = await youtubeRequest('search', params);
      if (!response.ok) return respondYouTubeError(res, response, data);
      data.items = await enrichVideoItems(data.items, apiKey);
      compactCache(res);
      return res.status(200).json(data);
    }

    if (type === 'openverse') {
      const clientId = process.env.OPENVERSE_CLIENT_ID;
      const clientSecret = process.env.OPENVERSE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.status(500).json({ error: { source: 'openverse', message: 'Faltan credenciales de Openverse en Vercel' } });
      if (!query || typeof query !== 'string') return res.status(400).json({ error: { source: 'openverse', message: 'Falta el término de búsqueda' } });

      const tokenResp = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
      });
      const tokenData = await tokenResp.json();
      if (!tokenResp.ok || !tokenData.access_token) {
        return res.status(tokenResp.status || 502).json({ error: { source: 'openverse', message: tokenData?.detail || 'No se pudo autenticar Openverse' } });
      }

      const pageSize = Math.min(boundedMax(req.query.maxResults, 20), 20);
      const searchUrl = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&page_size=${pageSize}`;
      const searchResp = await fetch(searchUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const searchData = await searchResp.json();
      if (!searchResp.ok) {
        return res.status(searchResp.status || 502).json({ error: { source: 'openverse', message: searchData?.detail || 'No se pudo consultar Openverse' } });
      }
      compactCache(res);
      return res.status(200).json(searchData);
    }

    return res.status(400).json({ error: 'Tipo de búsqueda inválido' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
