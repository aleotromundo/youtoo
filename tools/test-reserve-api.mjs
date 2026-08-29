import { readFileSync, copyFileSync } from 'node:fs';

const source = readFileSync(new URL('../api/reserve.js', import.meta.url), 'utf8');
const tempModule = '/tmp/nowarfy-reserve-test.mjs';
copyFileSync(new URL('../api/reserve.js', import.meta.url), tempModule);
const { default: handler } = await import(`file://${tempModule}?case=${Date.now()}`);

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'content-range': '0-0/0', 'content-type': 'application/json' }
  });
};

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    send(value) { this.body = value; return this; }
  };
}

const searchResponse = responseRecorder();
await handler({ method: 'GET', query: { action: 'search', kind: 'playlist', discoveredBy: 'user-123', limit: '24' } }, searchResponse);
if (searchResponse.statusCode !== 200) throw new Error(`search status ${searchResponse.statusCode}`);
const searchUrl = calls.at(-1).url;
if (!searchUrl.includes('youtoo_discovery_attributions')) throw new Error('missing attribution join');
if (!searchUrl.includes('discovered_by%3Deq.user-123') && !searchUrl.includes('discovered_by=eq.user-123')) throw new Error(`missing owner filter: ${searchUrl}`);
if (!searchUrl.includes('youtube%23playlist') && !searchUrl.includes('youtube#playlist')) throw new Error(`missing playlist filter: ${searchUrl}`);

const globalResponse = responseRecorder();
await handler({ method: 'GET', query: { action: 'search', kind: 'playlist', limit: '24' } }, globalResponse);
if (globalResponse.statusCode !== 200) throw new Error(`global status ${globalResponse.statusCode}`);
const globalUrl = calls.at(-1).url;
if (globalUrl.includes('youtoo_discovery_attributions')) throw new Error('global catalog unexpectedly filtered by attribution');

const postResponse = responseRecorder();
await handler({
  method: 'POST',
  query: { action: 'upsert' },
  body: {
    action: 'upsert',
    discoveredBy: 'user-123',
    entries: [{
      candidateKey: 'youtube:playlist:PL_TEST', source: 'youtube', sourceId: 'PL_TEST', type: 'yt', url: 'PL_TEST', playableUrl: 'PL_TEST',
      title: 'Lista de prueba', artist: 'Canal de prueba', resourceKind: 'youtube#playlist', isPlaylist: true,
      metadata: { resourceKind: 'youtube#playlist' }
    }]
  }
}, postResponse);
if (postResponse.statusCode !== 200) throw new Error(`upsert status ${postResponse.statusCode}`);
if (!calls.at(-1).url.includes('youtoo_discovery_attributions')) throw new Error('missing attribution upsert');

console.log(JSON.stringify({ passed: true, searchUrl, globalUrl, attributionUpsert: calls.at(-1).url }));

let fallbackCalls = 0;
global.fetch = async (url, options = {}) => {
  fallbackCalls += 1;
  calls.push({ url: String(url), options });
  if (fallbackCalls === 1) return new Response(JSON.stringify({ message: 'relation youtoo_discovery_attributions does not exist' }), { status: 400, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify([]), { status: 200, headers: { 'content-range': '0-0/0', 'content-type': 'application/json' } });
};
const fallbackResponse = responseRecorder();
await handler({ method: 'GET', query: { action: 'search', discoveredBy: 'user-123', kind: 'playlist', limit: '24' } }, fallbackResponse);
if (fallbackResponse.statusCode !== 200 || fallbackCalls !== 2) throw new Error(`fallback failed: status=${fallbackResponse.statusCode}, calls=${fallbackCalls}`);
if (calls.at(-1).url.includes('youtoo_discovery_attributions')) throw new Error('fallback still uses attribution join');

console.log(JSON.stringify({ passed: true, fallback: true }));
