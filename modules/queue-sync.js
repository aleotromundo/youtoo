// --- COLA SINCRONIZADA ENTRE DISPOSITIVOS ---
// La cola vive en la tabla nowarfy_user_queue (una fila por usuario; ver
// supabase/migrations/20261114_nowarfy_user_queue.sql). Cualquier dispositivo puede
// editarla: cada cambio se combina con la última versión acordada (la "base") y se
// escribe con control de versión. Si otro dispositivo escribió antes, se vuelve a
// leer y se combina otra vez, así dos dispositivos no se pisan.
const NOWARFY_QUEUE_TABLE = 'nowarfy_user_queue';
const NOWARFY_QUEUE_BASE_KEY = 'nowarfy_queue_base_v1';
const NOWARFY_QUEUE_MAX_ITEMS = 200;
const NOWARFY_QUEUE_MAX_ATTEMPTS = 4;

let nowarfyQueueSyncTimer = null;
let nowarfyQueueSyncRunning = false;
let nowarfyQueueSyncQueued = false;

// Solo viajan los datos de la canción; la descripción y el _qid son locales.
// La pista oculta tras "Vaciar" no se sincroniza: sigue sonando en este dispositivo.
function queueItemForSync(song) {
    if (!song?.url || song._qid === hiddenPlayingQid) return null;
    const { _qid, description, ...item } = song;
    return item;
}

function sameQueueSongs(a, b) {
    if (a.length !== b.length) return false;
    return a.every((song, i) => songKey(song) === songKey(b[i]));
}

// base: última versión acordada. local: esta cola. remote: la del servidor.
// Se conserva lo del servidor, salvo lo que este dispositivo quitó desde la base,
// y se agrega lo que este dispositivo sumó desde la base.
function mergeQueueSongs(base, local, remote) {
    const baseKeys = new Set(base.map(songKey));
    const localKeys = new Set(local.map(songKey));
    const seen = new Set();
    const merged = [];
    const add = (song) => {
        const key = songKey(song);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(song);
    };
    remote.forEach(song => {
        const key = songKey(song);
        if (!(baseKeys.has(key) && !localKeys.has(key))) add(song);
    });
    local.forEach(song => {
        if (!baseKeys.has(songKey(song))) add(song);
    });
    return merged.slice(0, NOWARFY_QUEUE_MAX_ITEMS);
}

function readQueueSyncBase(uid) {
    try {
        const saved = JSON.parse(localStorage.getItem(NOWARFY_QUEUE_BASE_KEY) || 'null');
        return saved && saved.uid === uid && Array.isArray(saved.items) ? saved.items : [];
    } catch (_) {
        return [];
    }
}

function writeQueueSyncBase(uid, items) {
    try { localStorage.setItem(NOWARFY_QUEUE_BASE_KEY, JSON.stringify({ uid, items })); } catch (_) {}
}

// Reemplaza la cola local por la combinada. Conserva los _qid de las canciones que ya
// estaban y mantiene sonando la pista actual aunque otro dispositivo la haya quitado.
function applyRemoteQueueSongs(songs) {
    const qidByKey = new Map();
    queue.forEach(song => {
        const key = songKey(song);
        if (!qidByKey.has(key)) qidByKey.set(key, song._qid);
    });
    let next = songs.map(song => ({ ...song, _qid: qidByKey.get(songKey(song)) ?? ++queueIdCounter }));
    const playing = currentPlayingQid == null ? null : queue.find(song => song._qid === currentPlayingQid);
    if (playing && !next.some(song => song._qid === playing._qid)) next = [playing, ...next];
    queue = next;
    queueSeenKeys = new Set(queue.map(songKey));
    const idx = currentPlayingQid == null ? -1 : queue.findIndex(song => song._qid === currentPlayingQid);
    if (idx >= 0) currentIndex = idx;
    persistQueueNow();
    renderQueue();
}

function scheduleNowarfyQueueSync(delay = 400) {
    if (!window.nowarfyQueueReady || !nowarfySupabase || !nowarfyAuthUser) return;
    clearTimeout(nowarfyQueueSyncTimer);
    nowarfyQueueSyncTimer = setTimeout(() => {
        nowarfyQueueSyncTimer = null;
        void syncNowarfyQueue();
    }, delay);
}

async function syncNowarfyQueue() {
    if (!window.nowarfyQueueReady || !nowarfySupabase || !nowarfyAuthUser) return;
    if (nowarfyQueueSyncRunning) { nowarfyQueueSyncQueued = true; return; }
    nowarfyQueueSyncRunning = true;
    const uid = nowarfyAuthUser.id;
    try {
        for (let attempt = 1; attempt <= NOWARFY_QUEUE_MAX_ATTEMPTS; attempt++) {
            const read = await nowarfySupabase
                .from(NOWARFY_QUEUE_TABLE)
                .select('items, version')
                .eq('user_id', uid)
                .maybeSingle();
            if (read.error) { console.error('Error leyendo la cola sincronizada:', read.error); return; }
            const row = read.data;
            const remoteSongs = Array.isArray(row?.items) ? row.items : [];
            const remoteVersion = Number(row?.version) || 0;
            const localSongs = queue.map(queueItemForSync).filter(Boolean);
            const merged = mergeQueueSongs(readQueueSyncBase(uid), localSongs, remoteSongs);

            if (!row || !sameQueueSongs(merged, remoteSongs)) {
                const now = new Date().toISOString();
                const write = row
                    ? await nowarfySupabase.from(NOWARFY_QUEUE_TABLE)
                        .update({ items: merged, version: remoteVersion + 1, updated_at: now })
                        .eq('user_id', uid)
                        .eq('version', remoteVersion)
                        .select('version')
                    : await nowarfySupabase.from(NOWARFY_QUEUE_TABLE)
                        .insert({ user_id: uid, items: merged, version: 1, updated_at: now })
                        .select('version');
                // Si otro dispositivo escribió primero, la escritura no entra: se relee y se combina.
                if (write.error || !write.data?.length) {
                    if (write.error && attempt === NOWARFY_QUEUE_MAX_ATTEMPTS) console.error('Error escribiendo la cola:', write.error);
                    continue;
                }
            }

            writeQueueSyncBase(uid, merged);
            // Si la cola cambió mientras sincronizábamos, no la pisamos: la próxima pasada la combina.
            if (sameQueueSongs(queue.map(queueItemForSync).filter(Boolean), localSongs)) {
                if (!sameQueueSongs(merged, localSongs)) applyRemoteQueueSongs(merged);
            } else {
                nowarfyQueueSyncQueued = true;
            }
            return;
        }
        console.warn('La cola no se pudo sincronizar tras varios intentos.');
    } catch (error) {
        console.error('Error sincronizando la cola:', error);
    } finally {
        nowarfyQueueSyncRunning = false;
        if (nowarfyQueueSyncQueued) {
            nowarfyQueueSyncQueued = false;
            scheduleNowarfyQueueSync(0);
        }
    }
}
