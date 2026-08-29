import { spawn } from 'node:child_process';

const port = 9225;
const profile = `/tmp/nowarfy-lyrics-mobile-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=390,844', 'about:blank'
], { stdio: 'ignore' });

let socket;
let sequence = 0;
const pending = new Map();
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools no respondió');
}
async function evaluate(expression, awaitPromise = true) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Error JavaScript en la página');
  return result.result?.value;
}

try {
  const debuggerUrl = await waitForDebugger();
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?lyrics-mobile-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1300));
  await evaluate(`(() => {
    const song = { _qid: 'lyrics-mobile-test', url: 'lyrics-ui-mobile', type: 'yt', isPlaylist: false, title: 'Foo Fighters - Everlong (Official Music Video)', artist: 'Foo Fighters', channelTitle: 'Foo Fighters', channelId: 'UC-test', duration: 252, categoryId: '10', description: 'Official music video.' };
    queue = [song]; queueSeenKeys = new Set([songKey(song)]); currentIndex = 0; currentPlayingQid = song._qid;
    window.fetch = ((originalFetch) => (url, options) => String(url).includes('/api/lyrics')
      ? Promise.resolve(new Response(JSON.stringify({ found: true, verified: true, track: { title: 'Everlong', artist: 'Foo Fighters', duration: 251, source: 'LRCLIB', sourceUrl: 'https://lrclib.net/', plainLyrics: 'Hello\\nEverlong\\n\\nAnd I wonder when I sing along.' } }), { status: 200 }))
      : originalFetch(url, options))(window.fetch);
    showVideoStage(song);
    return true;
  })()`);
  await new Promise(resolve => setTimeout(resolve, 350));
  const result = await evaluate(`(() => {
    const stage = document.getElementById('videoStage');
    const button = document.getElementById('lyricsToggleBtn');
    const panel = document.getElementById('lyricsPanel');
    const scroll = document.getElementById('lyricsScroll');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
    button.click();
    return { viewport: window.innerWidth, stage: rect(stage), lyricsButton: rect(button), panel: rect(panel), scroll: rect(scroll), bodyScrollWidth: document.documentElement.scrollWidth, panelVisible: !panel.hidden };
  })()`);
  const withinViewport = result.stage.left >= 0 && result.stage.right <= result.viewport && result.lyricsButton.left >= 0 && result.lyricsButton.right <= result.viewport && result.panel.left >= 0 && result.panel.right <= result.viewport && result.bodyScrollWidth <= result.viewport + 1;
  if (!withinViewport || !result.panelVisible) throw new Error(`Layout móvil inválido: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ passed: true, checks: { noHorizontalOverflow: true, lyricsPanelVisible: true, controlsInsideViewport: true }, result }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
