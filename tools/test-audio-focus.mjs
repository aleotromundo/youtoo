import { spawn } from 'node:child_process';

const port = 9226;
const profile = `/tmp/nowarfy-audio-focus-cdp-${Date.now()}`;
const browser = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=900,700', 'about:blank'
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?audio-focus-test=1' });
  await new Promise(resolve => setTimeout(resolve, 1400));

  const interruption = await evaluate(`(() => {
    const session = new EventTarget();
    session.state = 'inactive';
    session.type = 'auto';
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    const song = { _qid: 'audio-focus-test', url: 'audio-focus-video', type: 'yt', title: 'Focus Test', artist: 'Test Artist' };
    queue = [song]; currentIndex = 0; currentPlayingQid = song._qid; isPlaying = true; playbackStoppedByUser = false; ytPlaybackIntent = true;
    let pauseCalls = 0;
    window.__audioFocusPlayCalls = 0;
    let ytState = 2;
    ytPlayer = { volume: 80, pauseVideo() { pauseCalls += 1; }, playVideo() { window.__audioFocusPlayCalls += 1; if (window.__audioFocusPlayCalls >= 2) ytState = 1; }, getVolume() { return this.volume; }, setVolume(value) { this.volume = value; }, getPlayerState() { return ytState; } };
    setupAudioSessionSupport();
    session.state = 'interrupted';
    session.dispatchEvent(new Event('statechange'));
    return new Promise(resolve => setTimeout(() => resolve({ state: session.state, type: session.type, interrupted: externalAudioFocusInterrupted, resumePending: externalAudioFocusResumePending, playing: isPlaying, intent: ytPlaybackIntent, pauseCalls, volume: ytPlayer.volume }), 360));
  })()`);
  if (interruption.type !== 'playback' || interruption.interrupted || interruption.resumePending || !interruption.playing || !interruption.intent || interruption.pauseCalls !== 0 || interruption.volume !== 80) throw new Error(`La prioridad de Nowarfy falló: ${JSON.stringify(interruption)}`);

  const resumed = await evaluate(`(() => {
    const session = navigator.audioSession;
    session.state = 'active';
    session.dispatchEvent(new Event('statechange'));
    return { interrupted: externalAudioFocusInterrupted, resumePending: externalAudioFocusResumePending, playing: isPlaying, intent: ytPlaybackIntent, playCalls: window.__audioFocusPlayCalls, current: currentPlayingQid, volume: ytPlayer.volume };
  })()`);
  if (resumed.interrupted || resumed.resumePending || !resumed.playing || !resumed.intent || resumed.playCalls !== 0 || resumed.current !== 'audio-focus-test' || resumed.volume !== 80) throw new Error(`La prioridad cambió al liberar el foco: ${JSON.stringify(resumed)}`);

  const priorityYield = await evaluate(`(() => {
    isPlaying = true; playbackStoppedByUser = false; ytPlaybackIntent = true; externalAudioFocusInterrupted = false; externalAudioFocusResumePending = false;
    schedulePossibleExternalAudioYield('test-out-of-focus-pause');
    return { interrupted: externalAudioFocusInterrupted, pending: externalAudioFocusResumePending, playing: isPlaying, intent: ytPlaybackIntent, state: externalAudioFocusLastState, volume: ytPlayer.volume };
  })()`);
  if (priorityYield.interrupted || priorityYield.pending || !priorityYield.playing || !priorityYield.intent || priorityYield.volume !== 80) throw new Error(`El modo prioritario cedió el foco: ${JSON.stringify(priorityYield)}`);
  console.log(JSON.stringify({ passed: true, checks: { audioSessionPlaybackType: true, keepsPriorityOnInterruption: true, preservesPlayingState: true, preservesVolume: true, manualPauseCoveredSeparately: true }, interruption, resumed, priorityYield }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
