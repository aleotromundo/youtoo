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

const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({
    id: 101,
    trackName: 'Everlong',
    artistName: 'Foo Fighters',
    albumName: 'The Colour and the Shape',
    duration: 250,
    instrumental: false,
    plainLyrics: 'Hello, I have waited here for you.\\nEverlong.',
    syncedLyrics: '[00:00.00] Hello, I have waited here for you.\\n[00:04.00] Everlong.'
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const positive = responseRecorder();
await handler({ method: 'GET', query: { title: 'Foo Fighters - Everlong (Official Music Video)', artist: 'Foo Fighters', duration: '252' } }, positive);
if (positive.statusCode !== 200 || !positive.payload?.found || !positive.payload?.verified) throw new Error(`positive match failed: ${JSON.stringify(positive)}`);
if (positive.payload.verification.duration !== true) throw new Error('duration verification was not reported');
if (!calls[0].url.includes('track_name=Foo+Fighters')) throw new Error(`title was not sent: ${calls[0].url}`);

const mismatchFetch = global.fetch;
global.fetch = async () => new Response(JSON.stringify({
  id: 102, trackName: 'Everlong', artistName: 'Foo Fighters', duration: 90, instrumental: false, plainLyrics: 'wrong duration'
}), { status: 200, headers: { 'content-type': 'application/json' } });
const mismatch = responseRecorder();
await handler({ method: 'GET', query: { title: 'Everlong', artist: 'Foo Fighters', duration: '250' } }, mismatch);
if (mismatch.statusCode !== 200 || mismatch.payload?.found) throw new Error('duration mismatch was accepted');

global.fetch = async () => new Response(JSON.stringify({
  id: 103, trackName: 'Ambient', artistName: 'Foo Fighters', duration: 250, instrumental: true, plainLyrics: '', syncedLyrics: ''
}), { status: 200, headers: { 'content-type': 'application/json' } });
const instrumental = responseRecorder();
await handler({ method: 'GET', query: { title: 'Ambient', artist: 'Foo Fighters', duration: '250' } }, instrumental);
if (instrumental.statusCode !== 200 || instrumental.payload?.found) throw new Error('instrumental record was accepted');

global.fetch = mismatchFetch;
console.log(JSON.stringify({
  passed: true,
  checks: { positiveMatch: true, durationMismatchRejected: true, instrumentalRejected: true },
  request: calls[0].url,
  cacheControl: positive.headers['Cache-Control']
}, null, 2));
