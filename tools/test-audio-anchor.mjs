import { spawn } from 'node:child_process';
const port = 9227;
const profile = `/tmp/nowarfy-audio-anchor-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,900', 'about:blank'
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
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?audio-anchor-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1800));
  await evaluate(`(() => {
    const audio = document.getElementById('silent-audio-loop');
    if (!audio) return false;
    audio.muted = false;
    window.__anchorTimeUpdates = 0;
    audio.addEventListener('timeupdate', () => { window.__anchorTimeUpdates += 1; });
    const button = document.createElement('button');
    button.id = 'anchor-gesture-test';
    button.textContent = 'activar anclaje';
    button.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;width:200px;height:60px;';
    button.addEventListener('click', () => {
      window.__anchorPlayError = '';
      audio.play().catch(error => { window.__anchorPlayError = error?.name || String(error); });
    });
    document.body.appendChild(button);
    return true;
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 100, y: 50, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 100, y: 50, button: 'left', clickCount: 1 });
  await new Promise(resolve => setTimeout(resolve, 900));
  const result = await evaluate(`(() => {
    const audio = document.getElementById('silent-audio-loop');
    if (!audio) return { present: false };
    return {
      present: true,
      readyState: audio.readyState,
      duration: audio.duration,
      loop: audio.loop,
      paused: audio.paused,
      currentTime: audio.currentTime,
      timeUpdates: window.__anchorTimeUpdates || 0,
      playError: window.__anchorPlayError || ''
    };
  })()`);
  const checks = {
    present: result.present === true,
    metadataLoaded: result.readyState >= 1,
    durationValid: Number.isFinite(result.duration) && result.duration > 0,
    looping: result.loop === true,
    playing: result.paused === false,
    heartbeatEvents: result.timeUpdates > 0
  };
  console.log(JSON.stringify({ passed: Object.values(checks).every(Boolean), checks, result }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
