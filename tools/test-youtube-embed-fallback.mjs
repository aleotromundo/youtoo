import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const port = 9225;
const profile = `/tmp/nowarfy-youtube-fallback-cdp-${Date.now()}`;
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?youtube-fallback-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1700));

  const prepared = await evaluate(`(() => {
    const song = {
      _qid: 'embed-fallback-test', url: 'blocked-video-123', type: 'yt', isPlaylist: false,
      title: 'Video restringido de prueba', artist: 'Artista de prueba', channelTitle: 'Canal de prueba',
      channelId: 'UC-fallback', duration: 220, description: 'Descripción de prueba.',
      img: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22%3E%3Crect width=%22120%22 height=%2268%22 fill=%22%23ff667f%22/%3E%3C/svg%3E'
    };
    queue = [song];
    queueSeenKeys = new Set([songKey(song)]);
    currentIndex = 0;
    currentPlayingQid = song._qid;
    isPlaying = true;
    ytPlayer = {};
    window.__fallbackToasts = [];
    window.__openCalls = [];
    showToast = (message) => window.__fallbackToasts.push(message);
    window.open = (url, name, features) => {
      window.__openCalls.push({ url, name, features });
      return { focus() {} };
    };
    showVideoStage(song);
    onYTError({ target: ytPlayer, data: 150 });
    return true;
  })()`);
  if (!prepared) throw new Error('No se pudo preparar la pista bloqueada de prueba');
  await new Promise(resolve => setTimeout(resolve, 250));

  const fallback = await evaluate(`(() => {
    const fallback = document.getElementById('videoEmbedFallback');
    const open = document.getElementById('videoEmbedOpenBtn');
    const popup = document.getElementById('videoEmbedPopupBtn');
    return {
      visible: !fallback.hidden,
      title: document.getElementById('videoEmbedFallbackTitle').textContent,
      message: document.getElementById('videoEmbedFallbackMessage').textContent,
      href: open.href,
      popupEnabled: !popup.disabled,
      currentUrl: currentQueueSong()?.url,
      currentIndex,
      isPlaying,
      queueLength: queue.length,
      stageError: document.getElementById('videoStage').classList.contains('is-error')
    };
  })()`);
  const expectedUrl = 'https://www.youtube.com/watch?v=blocked-video-123';
  if (!fallback.visible || fallback.href !== expectedUrl || !fallback.message.includes('creador') || !fallback.popupEnabled || fallback.currentUrl !== 'blocked-video-123' || fallback.currentIndex !== 0 || fallback.queueLength !== 1 || fallback.isPlaying || !fallback.stageError) {
    throw new Error(`Fallback inválido: ${JSON.stringify(fallback)}`);
  }

  await evaluate('openYouTubeCompactWindow()');
  const opened = await evaluate('window.__openCalls');
  if (!opened?.length || opened[0].url !== expectedUrl || opened[0].name !== 'nowarfy-youtube-compact' || !opened[0].features.includes('width=720') || !opened[0].features.includes('height=450')) {
    throw new Error(`Ventana compacta inválida: ${JSON.stringify(opened)}`);
  }

  const cleared = await evaluate(`(() => {
    const song = { _qid: 'new-track', url: 'next-video', type: 'yt', title: 'Nueva pista', artist: 'Nuevo artista', channelTitle: 'Nuevo canal', duration: 180, img: '' };
    queue = [song]; currentIndex = 0; currentPlayingQid = song._qid;
    showVideoStage(song);
    return { hidden: document.getElementById('videoEmbedFallback').hidden, href: document.getElementById('videoEmbedOpenBtn').getAttribute('href') };
  })()`);
  if (!cleared.hidden || cleared.href !== '#') throw new Error(`El fallback no se limpió al cambiar de pista: ${JSON.stringify(cleared)}`);

  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-youtube-embed-fallback.png', Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ passed: true, checks: { fallbackVisible: true, originalYouTubeLink: true, compactWindowFromClick: true, noQueueAdvance: true, clearedOnNextTrack: true }, fallback, opened, cleared }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
