import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const port = 9223;
const profile = `/tmp/nowarfy-card-cdp-${Date.now()}`;
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?card-actions-cdp=1' });
  const card = await evaluate(`(async () => {
    for (let i = 0; i < 30; i += 1) {
      const candidate = document.querySelector('.video-card');
      if (candidate) { candidate.scrollIntoView({ block: 'center' }); return true; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  })()`);
  if (!card) throw new Error('No apareció ninguna video-card en Inicio');
  const geometry = await evaluate(`(() => {
    const card = document.querySelector('.video-card');
    const image = card.querySelector('.card-img-wrap');
    const actions = card.querySelector('.card-actions');
    const add = card.querySelector('.card-addq');
    const play = card.querySelector('.play-btn');
    const favorite = card.querySelector('.card-favorite');
    const title = card.querySelector('.card-title');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { card: rect(card), image: rect(image), actions: rect(actions), add: rect(add), play: rect(play), favorite: rect(favorite), title: rect(title), actionsStyle: { opacity: getComputedStyle(actions).opacity, transform: getComputedStyle(actions).transform } };
  })()`);
  const centerX = (geometry.image.left + geometry.image.right) / 2;
  const centerY = (geometry.image.top + geometry.image.bottom) / 2;
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: centerX, y: centerY });
  await new Promise(resolve => setTimeout(resolve, 700));
  const hoverGeometry = await evaluate(`(() => {
    const card = document.querySelector('.video-card');
    const actions = card.querySelector('.card-actions');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const rules = [];
    for (const sheet of document.styleSheets) {
      try { for (const rule of sheet.cssRules) if (rule.selectorText?.includes('card-actions')) rules.push({ selector: rule.selectorText, cssText: rule.style.cssText }); } catch (_) {}
    }
    return { actions: rect(actions), matchesHover: card.matches(':hover'), elementAtCursor: document.elementFromPoint(${centerX}, ${centerY})?.className || '', actionsStyle: { opacity: getComputedStyle(actions).opacity, transform: getComputedStyle(actions).transform }, rules };

  })()`);
  await evaluate(`(() => { document.querySelector('.play-btn')?.focus(); return true; })()`);
  await new Promise(resolve => setTimeout(resolve, 700));
  const focusGeometry = await evaluate(`(() => {
    const card = document.querySelector('.video-card');
    const actions = card.querySelector('.card-actions');
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { actions: rect(actions), focusWithin: card.matches(':focus-within'), activeElement: document.activeElement?.className || '', actionsStyle: { opacity: getComputedStyle(actions).opacity, transform: getComputedStyle(actions).transform } };
  })()`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/nowarfy-card-actions-hover.png', Buffer.from(screenshot.data, 'base64'));
  const overlaps = {
    addPlay: !(hoverGeometry.actions.left <= geometry.add.left && geometry.add.right <= hoverGeometry.actions.right && geometry.add.right < geometry.play.left),
    controlsInsideImage: geometry.add.left >= geometry.image.left && geometry.play.right <= geometry.image.right && geometry.add.top >= geometry.image.top && geometry.play.bottom <= geometry.image.bottom,
    actionsVisible: hoverGeometry.actionsStyle.opacity === '1' || focusGeometry.actionsStyle.opacity === '1'
  };
  console.log(JSON.stringify({ passed: overlaps.controlsInsideImage && overlaps.actionsVisible && !overlaps.addPlay, geometry, hoverGeometry, focusGeometry, overlaps }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
