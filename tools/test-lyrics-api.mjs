import { copyFileSync } from 'node:fs';

const source = new URL('../api/lyrics.js', import.meta.url);
const tempModule = `/tmp/nowarfy-lyrics-test-${Date.now()}.mjs`;
copyFileSync(source, tempModule);
const { default: handler } = await import(`file://${tempModule}`);

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

const everlong = {
  id: 101,
  trackName: 'Everlong',
  artistName: 'Foo Fighters',
  albumName: 'The Colour and the Shape',
  duration: 251,
  instrumental: false,
  plainLyrics: 'Hello, I have waited here for you.\nEverlong.',
  syncedLyrics: '[00:00.00] Hello, I have waited here for you.\n[00:04.00] Everlong.'
};

const numb = {
  id: 102,
  trackName: 'Numb',
  artistName: 'Linkin Park',
  albumName: 'Meteora',
  duration: 185,
  instrumental: false,
  plainLyrics: 'I am tired of being what you want me to be.',
  syncedLyrics: '[00:00.00] I am tired of being what you want me to be.'
};

const instrumental = {
  id: 103,
  trackName: 'Ambient',
  artistName: 'Foo Fighters',
  duration: 250,
  instrumental: true,
  plainLyrics: '',
  syncedLyrics: ''
};

function isSearch(url) {
  return new URL(url).pathname.endsWith('/search');
}

function isGet(url) {
  return new URL(url).pathname.endsWith('/get');
}

function invoke(query) {
  const res = responseRecorder();
  return handler({ method: 'GET', query }, res).then(() => res);
}

let calls = [];
function installFetch(fn) {
  calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return fn(new URL(String(url)));
  };
}

installFetch(url => isGet(url) ? jsonResponse(everlong) : jsonResponse([]));
const positive = await invoke({
  title: 'Foo Fighters - Everlong (Official Music Video)',
  artist: 'Foo Fighters',
  duration: '252'
});
if (positive.statusCode !== 200 || !positive.payload?.found || !positive.payload?.verified) {
  throw new Error(`positive match failed: ${JSON.stringify(positive)}`);
}
if (positive.payload.verification.duration !== true || positive.payload.verification.durationDelta !== 1) {
  throw new Error(`bounded duration verification failed: ${JSON.stringify(positive.payload.verification)}`);
}
if (!calls[0].url.includes('track_name=Foo+Fighters+-+Everlong')) {
  throw new Error(`cleaned title was not sent first: ${calls[0].url}`);
}

installFetch(url => {
  if (isGet(url)) return jsonResponse({}, 404);
  if (isSearch(url)) return jsonResponse([everlong]);
  return jsonResponse([]);
});
const fallback = await invoke({
  title: 'Everlong (Official Video)',
  artist: 'FooFightersVEVO',
  duration: '252'
});
if (fallback.statusCode !== 200 || !fallback.payload?.found || fallback.payload.verification.matchMethod !== 'search_fallback') {
  throw new Error(`search fallback failed: ${JSON.stringify(fallback)}`);
}
if (!calls.some(call => isSearch(call.url))) throw new Error('search fallback was not attempted');
if (fallback.payload.track.artist !== 'Foo Fighters') throw new Error('fallback returned the wrong artist');

installFetch(url => isGet(url) ? jsonResponse(numb) : jsonResponse([]));
const topicAndVersion = await invoke({
  title: 'Numb [Official Music Video]',
  artist: 'Linkin Park - Topic',
  duration: '185'
});
if (!topicAndVersion.payload?.found || topicAndVersion.payload.track.title !== 'Numb') {
  throw new Error(`Topic/version normalization failed: ${JSON.stringify(topicAndVersion)}`);
}

installFetch(url => {
  if (isGet(url)) return jsonResponse({
    ...everlong,
    artistName: 'Another Artist',
    trackName: 'Another Song'
  });
  if (isSearch(url)) return jsonResponse([]);
  return jsonResponse([]);
});
const metadataMismatch = await invoke({ title: 'Everlong', artist: 'Foo Fighters', duration: '250' });
if (metadataMismatch.statusCode !== 200 || metadataMismatch.payload?.found) {
  throw new Error('metadata mismatch was accepted');
}

installFetch(url => isGet(url) ? jsonResponse({ ...everlong, duration: 90 }) : jsonResponse([]));
const durationMismatch = await invoke({ title: 'Everlong', artist: 'Foo Fighters', duration: '250' });
if (durationMismatch.statusCode !== 200 || durationMismatch.payload?.found) {
  throw new Error('large duration mismatch was accepted');
}

installFetch(url => isGet(url) ? jsonResponse(instrumental) : jsonResponse([instrumental]));
const instrumentalResult = await invoke({ title: 'Ambient', artist: 'Foo Fighters', duration: '250' });
if (instrumentalResult.statusCode !== 200 || instrumentalResult.payload?.found) {
  throw new Error('instrumental record was accepted');
}

installFetch(url => {
  if (isGet(url)) return jsonResponse({}, 404);
  if (isSearch(url)) return jsonResponse([
    { ...everlong, trackName: 'Everlong A', id: 201 },
    { ...everlong, trackName: 'Everlong B', id: 202 }
  ]);
  return jsonResponse([]);
});
const ambiguous = await invoke({ title: 'Everlong', artist: 'Foo Fighters', duration: '250' });
if (ambiguous.statusCode !== 200 || ambiguous.payload?.found || ambiguous.payload?.reason !== 'ambiguous_match') {
  throw new Error(`ambiguous search was accepted: ${JSON.stringify(ambiguous)}`);
}

installFetch(() => jsonResponse({ message: 'Too many requests' }, 429, { 'retry-after': '17' }));
const rateLimited = await invoke({ title: 'Everlong', artist: 'Foo Fighters', duration: '250' });
if (rateLimited.statusCode !== 429 || rateLimited.headers['Retry-After'] !== '17' || calls.length !== 1) {
  throw new Error(`rate-limit handling failed: ${JSON.stringify(rateLimited)} calls=${calls.length}`);
}

installFetch(url => isGet(url) ? jsonResponse(everlong) : jsonResponse([]));
const noDuration = await invoke({ title: 'Everlong', artist: 'Foo Fighters' });
if (noDuration.statusCode !== 200 || !noDuration.payload?.found || noDuration.payload.verification.duration !== null) {
  throw new Error(`strong metadata without duration was rejected: ${JSON.stringify(noDuration)}`);
}

console.log(JSON.stringify({
  passed: true,
  checks: {
    youtubeTitleCleanup: true,
    boundedDurationAccepted: true,
    searchFallback: true,
    vevoAndTopicCleanup: true,
    metadataMismatchRejected: true,
    largeDurationMismatchRejected: true,
    instrumentalRejected: true,
    ambiguousSearchRejected: true,
    rateLimitReturnedWithoutRetryStorm: true,
    strongMatchWithoutDuration: true
  }
}, null, 2));
