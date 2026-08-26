import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const port = 9226;
const profile = `/tmp/nowarfy-playlist-hero-cdp-${Date.now()}`;
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?playlist-hero-visual-test=1' });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const geometry = await evaluate(`(() => {
    activePlaylistCatalog = {
      playlist: { url: 'PL-hero-test', title: 'Playing For Change · Rock & Soul', artist: 'Playing For Change', img: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', channelId: 'UC-test', itemCount: 79, type: 'playlist', resourceKind: 'youtube#playlist', isPlaylist: true },
      tracks: [
        { title: 'Stand By Me', artist: 'Playing For Change', url: 'v1', img: 'https://i.ytimg.com/vi/v1/mqdefault.jpg', type: 'yt', duration: 328 },
        { title: 'One Love', artist: 'Playing For Change', url: 'v2', img: 'https://i.ytimg.com/vi/v2/mqdefault.jpg', type: 'yt', duration: 308 }
      ],
      pageInfo: { totalResults: 79 },
      nextPageToken: ''
    };
    renderOpenedPlaylist();
    const hero = document.querySelector('.playlist-hero');
    const play = hero.querySelector('.playlist-hero-play');
    const title = hero.querySelector('.playlist-hero-title');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { hero: rect(hero), play: rect(play), title: rect(title), titleText: title.textContent.trim(), playVisible: getComputedStyle(play).display !== 'none' };
  })()`);
  const shot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-playlist-hero.png', Buffer.from(shot.data, 'base64'));
  const checks = {
    heroExists: !!geometry.hero,
    playButtonLarge: geometry.play.width >= 50 && geometry.play.height >= 50,
    titleCorrect: geometry.titleText.includes('Playing For Change'),
    playVisible: geometry.playVisible
  };
  console.log(JSON.stringify({ passed: Object.values(checks).every(Boolean), checks, geometry }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
