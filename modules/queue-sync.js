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
    if (song?._qid === hiddenPlayingQid) return null;
    // Las pistas locales viajan solo si ya están subidas; la URL temporal (blob:) es de este dispositivo.
    if (song?.local) {
        // Mientras se sube, la pista viaja marcada como "subiendo" para que los otros equipos la muestren.
        const { _qid, description, uploading, ...item } = song;
        return song.storagePath ? { ...item, url: '' } : { ...item, url: '', uploading: true };
    }
    if (!song?.url) return null;
    const { _qid, description, ...item } = song;
    return item;
}

// Huella de lo que importa sincronizar: si cambia la duración o la ruta, también cuenta como cambio.
function queueSongFingerprint(song) {
    return [songKey(song), song.duration ?? '', song.storagePath ?? '', song.url ?? ''].join('|');
}

function sameQueueSongs(a, b) {
    if (a.length !== b.length) return false;
    return a.every((song, i) => queueSongFingerprint(song) === queueSongFingerprint(b[i]));
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
    const localByKey = new Map(local.map(song => [songKey(song), song]));
    remote.forEach(song => {
        const key = songKey(song);
        if (baseKeys.has(key) && !localKeys.has(key)) return;
        // Para una canción que ya está en este dispositivo, manda la copia local (con su duración real).
        // Pero si el servidor ya tiene la ruta de la nube (otro dispositivo terminó de subirla) y la copia
        // local todavía no, se toma esa ruta: si no, esta copia vieja pisaría el servidor con "subiendo…".
        const mine = localByKey.get(key);
        if (mine && song.storagePath && !mine.storagePath) {
            const { uploading, ...ready } = mine;
            add({ ...ready, storagePath: song.storagePath });
        } else {
            add(mine ?? song);
        }
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
    // Si otro dispositivo vació la lista, esta conserva la copia para poder restaurarla.
    if (!songs.length) backupVisibleQueue();
    const qidByKey = new Map();
    queue.forEach(song => {
        const key = songKey(song);
        if (!qidByKey.has(key)) qidByKey.set(key, song._qid);
    });
    const localByKey = new Map(queue.map(song => [songKey(song), song]));
    let next = songs.map(song => {
        const existing = localByKey.get(songKey(song));
        const merged = { ...song, _qid: qidByKey.get(songKey(song)) ?? ++queueIdCounter };
        // Si la pista ya está en este dispositivo, se conserva su URL local.
        if (song.local && existing?.local && existing.url) merged.url = existing.url;
        return merged;
    });
    const playing = currentPlayingQid == null ? null : queue.find(song => song._qid === currentPlayingQid);
    if (playing && !next.some(song => song._qid === playing._qid)) next = [playing, ...next];
    // Las pistas locales que todavía se están subiendo no están en la nube: se conservan en esta lista.
    const nextKeys = new Set(next.map(songKey));
    queue.forEach(song => {
        if (nowarfyLiveLocalUrls.has(song.url) && !song.storagePath && !nextKeys.has(songKey(song))) {
            nextKeys.add(songKey(song));
            next.push(song);
        }
    });
    queue = next;
    queueSeenKeys = new Set(queue.map(songKey));
    const idx = currentPlayingQid == null ? -1 : queue.findIndex(song => song._qid === currentPlayingQid);
    if (idx >= 0) currentIndex = idx;
    persistQueueNow();
    renderQueue();
    // Si el usuario pidió una pista que todavía se subía, suena apenas llega a la nube.
    if (nowarfyAwaitingUploadKey) {
        const ready = queue.find(song => songKey(song) === nowarfyAwaitingUploadKey && song.storagePath);
        if (ready) {
            nowarfyAwaitingUploadKey = null;
            playQueueAt(queue.indexOf(ready), {});
        }
    }
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
            // Pistas de este equipo cuya subida se perdió al recargar: no sirven, se quitan.
            const before = queue.length;
            queue = queue.filter(song => !(song.local && !song.storagePath && song.url && !nowarfyLiveLocalUrls.has(song.url)));
            if (queue.length !== before) persistQueueNow();
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

// Botón "Actualizar": vuelve a leer la cola del servidor y la combina ahora mismo.
function refreshNowarfyQueue() {
    if (!nowarfyAuthUser || !nowarfySupabase) {
        if (typeof showToast === 'function') showToast('Iniciá sesión para sincronizar la lista', 'fa-circle-info');
        return;
    }
    scheduleNowarfyQueueSync(0);
    if (typeof showToast === 'function') showToast('Lista actualizada', 'fa-rotate');
}

// Respaldo si Realtime se corta o la pestaña estuvo en segundo plano: revisa la cola del servidor
// cada 15 segundos y al volver a la app.
let nowarfyQueuePollStarted = false;
function startNowarfyQueuePolling() {
    if (nowarfyQueuePollStarted) return;
    nowarfyQueuePollStarted = true;
    setInterval(() => { if (!document.hidden) scheduleNowarfyQueueSync(0); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleNowarfyQueueSync(0); });
    window.addEventListener('focus', () => scheduleNowarfyQueueSync(0));
}
