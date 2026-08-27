import { spawn } from 'node:child_process';

const port = 9226;
const profile = `/tmp/nowarfy-youtube-manual-pause-cdp-${Date.now()}`;
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?youtube-manual-pause-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1700));

  const result = await evaluate(`(() => {
    const song = { _qid: 'manual-pause-test', url: 'manual-pause-video', type: 'yt', title: 'Pista de pausa manual', artist: 'Artista de prueba', channelTitle: 'Canal de prueba', duration: 220, description: '' };
    queue = [song];
    queueSeenKeys = new Set([songKey(song)]);
    currentIndex = 0;
    currentPlayingQid = song._qid;
    externalAudioFocusInterrupted = false;
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    playbackStoppedByUser = false;
    ytPlaybackIntent = true;
    isPlaying = true;
    let playCalls = 0;
    let pauseCalls = 0;
    ytPlayer = { playVideo() { playCalls += 1; }, pauseVideo() { pauseCalls += 1; }, getPlayerState() { return 2; } };
    showVideoStage(song);
    onYTStateChange({ target: ytPlayer, data: YT.PlayerState.PAUSED });
    const paused = { isPlaying, intent: ytPlaybackIntent, stoppedByUser: playbackStoppedByUser, playCalls, pauseCalls };
    togglePlay();
    const requestedPlay = { isPlaying, intent: ytPlaybackIntent, stoppedByUser: playbackStoppedByUser, playCalls, pauseCalls };
    onYTStateChange({ target: ytPlayer, data: YT.PlayerState.PLAYING });
    const playing = { isPlaying, intent: ytPlaybackIntent, stoppedByUser: playbackStoppedByUser, playCalls, pauseCalls };
    return { paused, requestedPlay, playing };
  })()`);

  if (result.paused.isPlaying || result.paused.intent || !result.paused.stoppedByUser || result.paused.playCalls !== 0) throw new Error(`La pausa manual reactivó el video: ${JSON.stringify(result)}`);
  if (!result.requestedPlay.isPlaying || !result.requestedPlay.intent || result.requestedPlay.stoppedByUser || result.requestedPlay.playCalls !== 1) throw new Error(`El Play explícito no reanudó el video: ${JSON.stringify(result)}`);
  if (!result.playing.isPlaying || !result.playing.intent || result.playing.playCalls !== 1) throw new Error(`El estado PLAYING quedó inconsistente: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ passed: true, checks: { manualPauseSticks: true, watchdogDoesNotReplay: true, explicitPlayResumes: true }, result }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
