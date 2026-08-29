import { spawn } from 'node:child_process';

const port = 9227;
const profile = `/tmp/nowarfy-youtube-watchdog-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1000,800', 'about:blank'
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?youtube-watchdog-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1700));

  const result = await evaluate(`(() => {
    window.YT = { PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
    const song = { _qid: 'watchdog-test', url: 'watchdog-video', type: 'yt', title: 'Watchdog Test', artist: 'Test Artist', channelTitle: 'Test Channel', duration: 240 };
    queue = [song]; queueSeenKeys = new Set([songKey(song)]); currentIndex = 0; currentPlayingQid = song._qid;
    externalAudioFocusInterrupted = false; playbackStoppedByUser = false; ytPlaybackIntent = true; isPlaying = true;
    let state = YT.PlayerState.PLAYING;
    let playCalls = 0;
    ytPlayer = { getPlayerState() { return state; }, getCurrentTime() { return 40; }, getDuration() { return 240; }, playVideo() { playCalls += 1; } };
    const emit = nextState => { state = nextState; silentAudioLoop.dispatchEvent(new Event('timeupdate')); };
    emit(YT.PlayerState.PLAYING);
    const playingCalls = playCalls;
    emit(YT.PlayerState.BUFFERING);
    const bufferingCalls = playCalls;
    isPlaying = false;
    emit(YT.PlayerState.PAUSED);
    const pausedCalls = playCalls;
    return { playingCalls, bufferingCalls, pausedCalls, state, intent: ytPlaybackIntent, stoppedByUser: playbackStoppedByUser };
  })()`);

  if (result.playingCalls !== 0 || result.bufferingCalls !== 0 || result.pausedCalls !== 1 || !result.intent || result.stoppedByUser) throw new Error(`Watchdog invasivo o no recuperó PAUSED: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ passed: true, checks: { noReplayWhilePlaying: true, noReplayWhileBuffering: true, recoversStoppedPausedState: true }, result }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
