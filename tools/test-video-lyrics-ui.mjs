import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const port = 9224;
const profile = `/tmp/nowarfy-lyrics-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,1000', 'about:blank'
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Error JavaScript en la página');
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?lyrics-ui-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1800));

  const prepared = await evaluate(`(() => {
    const song = {
      _qid: 'lyrics-ui-test', url: 'lyrics-ui-video', type: 'yt', isPlaylist: false,
      title: 'Foo Fighters - Everlong (Official Music Video)', artist: 'FooFightersVEVO',
      channelTitle: 'FooFightersVEVO', channelId: 'UC-test', duration: 252, categoryId: '10',
      description: 'Official music video.', img: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%235eead4%22/%3E%3C/svg%3E'
    };
    queue = [song];
    queueSeenKeys = new Set([songKey(song)]);
    currentIndex = 0;
    currentPlayingQid = song._qid;
    window.__frameSizeCalls = [];
    window.__frameReloadCalls = [];
    window.YT = { PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
    ytPlaybackIntent = true;
    playbackStoppedByUser = false;
    isPlaying = true;
    ytPlayer = { setSize(width, height) { window.__frameSizeCalls.push({ width, height }); }, getPlayerState() { return 1; }, getCurrentTime() { return 122; }, getDuration() { return 252; }, loadVideoById(payload) { window.__frameReloadCalls.push(payload); }, playVideo() {} };
    document.getElementById('yt-player-container').innerHTML = '<iframe title="YouTube test frame"></iframe>';
    window.__lyricsRequestUrls = [];
    window.fetch = ((originalFetch) => (url, options) => {
      if (!String(url).includes('/api/lyrics')) return originalFetch(url, options);
      window.__lyricsRequestUrls.push(String(url));
      return Promise.resolve(new Response(JSON.stringify({
        found: true, verified: true,
        verification: { artist: true, title: true, duration: true, durationDelta: 1 },
        track: { id: 101, title: 'Everlong', artist: 'Foo Fighters', duration: 251, source: 'LRCLIB', sourceUrl: 'https://lrclib.net/', plainLyrics: 'Hello, I have waited here for you.\\nEverlong.\\n\\nAnd I wonder when I sing along.' }
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    })(window.fetch);
    showVideoStage(song);
    return true;
  })()`);
  if (!prepared) throw new Error('No se pudo preparar la pista de prueba');
  await new Promise(resolve => setTimeout(resolve, 450));

  const lyricReady = await evaluate(`(() => ({
    buttonVisible: !document.getElementById('lyricsToggleBtn').hidden,
    panelInitiallyHidden: document.getElementById('lyricsPanel').hidden,
    text: document.getElementById('lyricsContent').textContent,
    source: document.getElementById('lyricsToolbarStatus').textContent,
    lyricsRequestUrl: window.__lyricsRequestUrls[0] || ''
  }))()`);
  if (!lyricReady.buttonVisible || !lyricReady.panelInitiallyHidden || !lyricReady.text.includes('Everlong') || !lyricReady.source.includes('LRCLIB') || !lyricReady.lyricsRequestUrl.includes('artist=FooFighters') || !lyricReady.lyricsRequestUrl.includes('title=Everlong') || lyricReady.lyricsRequestUrl.includes('Official')) throw new Error(`La letra no quedó lista o no limpió metadatos: ${JSON.stringify(lyricReady)}`);

  await evaluate(`(() => { document.getElementById('lyricsToggleBtn').click(); changeLyricsZoom(0.1); return true; })()`);
  const lyricOpen = await evaluate(`(() => ({
    panelVisible: !document.getElementById('lyricsPanel').hidden,
    expanded: document.getElementById('lyricsToggleBtn').getAttribute('aria-expanded'),
    zoom: document.getElementById('lyricsZoomValue').textContent,
    fontSize: document.getElementById('lyricsContent').style.fontSize,
    scrollFocusable: document.getElementById('lyricsScroll').tabIndex === 0,
    overflowY: getComputedStyle(document.getElementById('lyricsScroll')).overflowY,
    touchAction: getComputedStyle(document.getElementById('lyricsScroll')).touchAction
  }))()`);
  if (!lyricOpen.panelVisible || lyricOpen.expanded !== 'true' || lyricOpen.zoom !== '110%' || lyricOpen.fontSize !== '1.1rem' || !lyricOpen.scrollFocusable || lyricOpen.overflowY !== 'auto' || lyricOpen.touchAction !== 'pan-y') throw new Error(`Controles de letra inválidos: ${JSON.stringify(lyricOpen)}`);

  await evaluate(`(() => { hideVideoStage(false, { autoReason: 'out-of-view' }); return true; })()`);
  const hidden = await evaluate(`(() => {
    const stage = document.getElementById('videoStage');
    const button = document.getElementById('videoStageToggleBtn');
    const rect = button.getBoundingClientRect();
    return { stageHidden: !stage.classList.contains('visible'), buttonVisible: !button.hidden, buttonWidth: rect.width, buttonHeight: rect.height, buttonLabel: button.getAttribute('aria-label'), copy: button.textContent.trim(), beforeAnimation: getComputedStyle(button, '::before').animationName, afterAnimation: getComputedStyle(button, '::after').animationName, ripplePointerEvents: getComputedStyle(button, '::before').pointerEvents };
  })()`);
  if (!hidden.stageHidden || !hidden.buttonVisible || hidden.buttonWidth < 145 || hidden.buttonHeight < 42 || !hidden.buttonLabel.includes('automáticamente') || !hidden.copy.includes('Mostrar video') || hidden.beforeAnimation !== 'video-toggle-ripple' || hidden.afterAnimation !== 'video-toggle-ripple' || hidden.ripplePointerEvents !== 'none') throw new Error(`Botón de video minimizado insuficiente: ${JSON.stringify(hidden)}`);
  const hiddenScreenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-video-toggle-ripples.png', Buffer.from(hiddenScreenshot.data, 'base64'));

  await evaluate(`(() => { toggleVideoStageVisibility(); return true; })()`);
  await new Promise(resolve => setTimeout(resolve, 4000));
  const shown = await evaluate(`(() => ({ stageVisible: document.getElementById('videoStage').classList.contains('visible'), restoreButtonHidden: document.getElementById('videoStageToggleBtn').hidden, posterHidden: document.getElementById('videoFramePoster').hidden, frameVisible: getComputedStyle(document.querySelector('#yt-player-container iframe')).visibility === 'visible', frameSizeCalls: window.__frameSizeCalls, frameReloadCalls: window.__frameReloadCalls }))()`);
  if (!shown.stageVisible || !shown.restoreButtonHidden || !shown.posterHidden || !shown.frameVisible || !shown.frameSizeCalls.length || shown.frameSizeCalls.at(-1).width < 1 || shown.frameSizeCalls.at(-1).height < 1 || shown.frameReloadCalls.length !== 1 || shown.frameReloadCalls[0].videoId !== 'lyrics-ui-video' || shown.frameReloadCalls[0].startSeconds !== 122) throw new Error(`El video no volvió a pintarse correctamente: ${JSON.stringify(shown)}`);

  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-video-lyrics-ui.png', Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ passed: true, checks: { verifiedLyricsButton: true, lyricsPanelAndZoom: true, prominentAutoHideButton: true, expandingRings: true, restoreVideoFrame: true, officialVisualReload: true }, lyricReady, lyricOpen, hidden, shown }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
