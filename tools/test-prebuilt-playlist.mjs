import { spawn } from 'node:child_process';

const port = 9224;
const profile = `/tmp/nowarfy-playlist-cdp-${Date.now()}`;
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
async function evaluate(expression, awaitPromise = true) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Error JavaScript en la página');
  if (result.result?.subtype === 'error') throw new Error(result.result.description || 'Error JavaScript en la página');
  return result.result?.value;
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
  await command('Page.navigate', { url: 'http://127.0.0.1:5174/index.html?prebuilt-playlist-test=1' });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const result = await evaluate(`(async () => {
    const playlistItems = page => page === 1 ? [
      { contentDetails: { videoId: 'prebuilt-video-1', duration: 'PT3M' }, snippet: { title: 'Tema 1', description: '', channelId: 'channel-test', channelTitle: 'Canal de prueba', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/prebuilt-video-1/mqdefault.jpg' } } } },
      { contentDetails: { videoId: 'prebuilt-video-2', duration: 'PT4M' }, snippet: { title: 'Tema 2', description: '', channelId: 'channel-test', channelTitle: 'Canal de prueba', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/prebuilt-video-2/mqdefault.jpg' } } } }
    ] : [
      { contentDetails: { videoId: 'prebuilt-video-3', duration: 'PT5M' }, snippet: { title: 'Tema 3', description: '', channelId: 'channel-test', channelTitle: 'Canal de prueba', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/prebuilt-video-3/mqdefault.jpg' } } } }
    ];
    window.fetch = async url => {
      const value = String(url);
      if (value.includes('playlistItems')) {
        const page = value.includes('page2') ? 2 : 1;
        return { ok: true, json: async () => ({ items: playlistItems(page), pageInfo: { totalResults: 3, resultsPerPage: page === 1 ? 2 : 1 }, nextPageToken: page === 1 ? 'page2' : '' }) };
      }
      if (value.includes('/api/reserve')) return { ok: true, json: async () => ({ ok: true }) };
      return { ok: false, json: async () => ({ error: 'test_not_found' }) };
    };
    let playerCreations = 0;
    const playerLoads = [];
    window.YT = {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, UNSTARTED: -1 },
      Player: function (_id, config) {
        playerCreations += 1;
        let nativeIndex = 0;
        const nativePlaylist = ['prebuilt-video-1', 'prebuilt-video-2', 'prebuilt-video-3'];
        this.setVolume = () => {};
        this.playVideo = () => {};
        this.loadVideoById = options => { playerLoads.push(options.videoId); };
        this.cueVideoById = options => { playerLoads.push('cue:' + options.videoId); };
        this.playVideoAt = index => { nativeIndex = index; config.events.onStateChange({ target: this, data: 1 }); };
        this.nextVideo = () => { nativeIndex += 1; config.events.onStateChange({ target: this, data: nativeIndex < nativePlaylist.length ? 1 : 0 }); };
        this.getPlaylist = () => [...nativePlaylist];
        this.getPlaylistIndex = () => nativeIndex;
        this.pauseVideo = () => {};
        this.stopVideo = () => {};
        this.destroy = () => {};
        this.getDuration = () => 180;
        this.getCurrentTime = () => 0;
        this.getPlayerState = () => 1;
        setTimeout(() => config.events.onReady({ target: this }), 0);
      }
    };
    ytApiReady = true;
    const playlist = { url: 'PL-prebuilt-test', title: 'Playlist prearmada de prueba', artist: 'Canal de prueba', img: 'https://i.ytimg.com/vi/prebuilt-video-1/mqdefault.jpg', channelId: 'channel-test', itemCount: 3, type: 'playlist', resourceKind: 'youtube#playlist', isPlaylist: true };
    await openPlaylist(playlist, { playNow: true });
    const first = { mode: queuePlaybackMode, count: queue.length, urls: queue.map(item => item.url), current: currentQueueSong()?.url, nextPageToken: queuePlaylistContext?.nextPageToken || '', playerCreations, playerLoads: [...playerLoads] };
    nextSong(false);
    const second = { count: queue.length, current: currentQueueSong()?.url, radioMode: queuePlaybackMode === 'radio' };
    nextSong(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    const third = { count: queue.length, urls: queue.map(item => item.url), current: currentQueueSong()?.url, nextPageToken: queuePlaylistContext?.nextPageToken || '', playerCreations, playerLoads: [...playerLoads] };
    nextSong(false);
    const finished = { mode: queuePlaybackMode, current: currentQueueSong()?.url, isPlaying, nextPageToken: queuePlaylistContext?.nextPageToken || '' };
    return { first, second, third, finished };
  })()`);
  const checks = {
    startsInOrder: result.first.mode === 'prebuilt_playlist' && result.first.urls.join(',') === 'prebuilt-video-1,prebuilt-video-2' && result.first.current === 'prebuilt-video-1',
    advancesInOrder: result.second.current === 'prebuilt-video-2' && result.second.radioMode === false,
    paginatesInOrder: result.third.count === 3 && result.third.urls.join(',') === 'prebuilt-video-1,prebuilt-video-2,prebuilt-video-3' && result.third.current === 'prebuilt-video-3' && result.third.nextPageToken === '',
    nativePlaylistControls: result.third.playerCreations === 1 && result.third.playerLoads.length === 0,
    stopsAtEnd: result.finished.mode === 'prebuilt_playlist' && result.finished.current === 'prebuilt-video-3' && result.finished.isPlaying === false
  };
  console.log(JSON.stringify({ passed: Object.values(checks).every(Boolean), checks, result }, null, 2));
} finally {
  if (socket) socket.close();
  browser.kill('SIGTERM');
}
