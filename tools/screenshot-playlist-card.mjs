import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const port = 9225;
const profile = `/tmp/nowarfy-playlist-card-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,1000', 'about:blank'
], { stdio: 'ignore' });
let socket;
let sequence = 0;
const pending = new Map();
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools no respondió');
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails || response.result?.subtype === 'error') throw new Error(response.exceptionDetails?.text || response.result?.description || 'Error de evaluación');
  return response.result?.value;
}
try {
  socket = new WebSocket(await waitForTarget());
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?playlist-card-visual-test=1' });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const geometry = await evaluate(`(() => {
    const card = buildPlaylistCard({ url: 'PL-visual-test', title: 'Playlist de prueba · Rock sin pausa', artist: 'Canal de prueba', img: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', itemCount: 42, type: 'playlist', resourceKind: 'youtube#playlist', isPlaylist: true }, 0);
    card.style.width = '300px';
    card.style.margin = '30px';
    document.querySelector('#dynamicSections').replaceChildren(card);
    card.scrollIntoView({ block: 'center' });
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { card: rect(card), image: rect(card.querySelector('.card-img-wrap')), count: rect(card.querySelector('.playlist-count-badge')), play: rect(card.querySelector('.playlist-play-btn')), countText: card.querySelector('.playlist-count-badge').textContent.trim(), playLabel: card.querySelector('.playlist-play-btn').getAttribute('aria-label') };
  })()`);
  const x = (geometry.image.left + geometry.image.right) / 2;
  const y = (geometry.image.top + geometry.image.bottom) / 2;
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await new Promise(resolve => setTimeout(resolve, 700));
  const state = await evaluate(`(() => {
    const card = document.querySelector('.playlist-card');
    const action = card.querySelector('.playlist-card-actions');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { actions: rect(action), opacity: getComputedStyle(action).opacity, hover: card.matches(':hover') };
  })()`);
  const shot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-playlist-card.png', Buffer.from(shot.data, 'base64'));
  const checks = {
    countVisible: geometry.countText === '42 videos',
    playAccessible: geometry.playLabel === 'Reproducir lista completa',
    controlsInsideImage: geometry.count.left >= geometry.image.left && geometry.play.right <= geometry.image.right && geometry.count.bottom <= geometry.image.bottom && geometry.play.bottom <= geometry.image.bottom,
    controlsSeparated: geometry.count.right < geometry.play.left,
    actionsVisibleOnHover: state.opacity === '1' && state.hover
  };
  console.log(JSON.stringify({ passed: Object.values(checks).every(Boolean), checks, geometry, state }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
