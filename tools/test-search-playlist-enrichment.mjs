import handler from '../api/search.js';

process.env.YOUTUBE_API_KEY = 'test-key';
const requests = [];
global.fetch = async url => {
  const parsed = new URL(url);
  requests.push(parsed.pathname);
  if (parsed.pathname.endsWith('/search')) {
    return new Response(JSON.stringify({
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{ id: { kind: 'youtube#playlist', playlistId: 'PL-count-test' }, snippet: { title: 'Playlist con contador', description: '', channelId: 'UC-test', channelTitle: 'Canal de prueba', thumbnails: { medium: { url: 'https://img.test/playlist.jpg' } } } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (parsed.pathname.endsWith('/playlists')) {
    return new Response(JSON.stringify({ items: [{ id: 'PL-count-test', contentDetails: { itemCount: '37' }, snippet: { thumbnails: { high: { url: 'https://img.test/playlist-high.jpg' } } } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const result = {};
const res = {
  statusCode: 200,
  headers: {},
  status(code) { this.statusCode = code; return this; },
  setHeader(name, value) { this.headers[name] = value; },
  json(body) { result.body = body; return this; }
};
await handler({ query: { type: 'youtube', query: 'playlist test', resourceTypes: 'playlist', maxResults: '20' } }, res);
const item = result.body?.items?.[0];
const checks = {
  httpOk: res.statusCode === 200,
  countEnriched: item?.contentDetails?.itemCount === '37',
  artworkPreserved: item?.snippet?.thumbnails?.high?.url === 'https://img.test/playlist-high.jpg',
  searchCalled: requests.includes('/youtube/v3/search'),
  playlistDetailsCalled: requests.includes('/youtube/v3/playlists')
};
console.log(JSON.stringify({ passed: Object.values(checks).every(Boolean), checks, requests, item }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
