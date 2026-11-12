/*
 * YouToo · Biblioteca de presets MilkDrop reales.
 *
 * Sirve los .milk originales (pack de MilkDrop 2 incluido con Winamp) y los
 * convierte en el navegador con milkdrop-preset-converter (el parser original
 * compilado a WebAssembly). Cada preset se descarga y convierte una sola vez:
 * luego queda en memoria y en IndexedDB.
 */
(function () {
    'use strict';

    const MANIFEST_URL = '/presets/manifest.json';
    const CONVERTER_URL = '/vendor/milkdrop-preset-converter-0.1.2.min.js';
    const IDB_NAME = 'nowarfy-milkdrop-presets';
    const IDB_STORE = 'converted';
    const IDB_VERSION = 1;

    let manifest = null;
    let manifestPromise = null;
    let converterPromise = null;
    let dbPromise = null;

    const converted = new Map();   // id -> preset JSON listo para Butterchurn
    const inflight = new Map();    // id -> Promise en curso
    const failed = new Map();      // id -> error

    function loadScriptOnce(path, marker) {
        return new Promise((resolve, reject) => {
            const existing = marker ? document.querySelector(`script[data-youtoo-viz="${marker}"]`) : null;
            if (existing) {
                if (existing.dataset.loaded === '1') { resolve(); return; }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${path}`)), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = path;
            script.async = true;
            if (marker) script.dataset.youtooViz = marker;
            script.onload = () => { script.dataset.loaded = '1'; resolve(); };
            script.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
            document.head.appendChild(script);
        });
    }

    function openDatabase() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve) => {
            if (!window.indexedDB) { resolve(null); return; }
            let request;
            try {
                request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
            } catch (_) { resolve(null); return; }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        });
        return dbPromise;
    }

    async function idbRead(id) {
        const db = await openDatabase();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const request = tx.objectStore(IDB_STORE).get(id);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    async function idbWrite(id, preset) {
        const db = await openDatabase();
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(preset, id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch (_) { resolve(); }
        });
    }

    async function ensureConverter() {
        if (window.milkdropPresetConverter) return window.milkdropPresetConverter;
        if (converterPromise) return converterPromise;
        converterPromise = loadScriptOnce(CONVERTER_URL, 'preset-converter')
            .then(() => {
                const api = window.milkdropPresetConverter;
                if (!api) throw new Error('Conversor de presets no disponible');
                return api;
            })
            .catch((error) => {
                converterPromise = null;
                throw error;
            });
        return converterPromise;
    }

    async function load() {
        if (manifest) return manifest;
        if (manifestPromise) return manifestPromise;
        manifestPromise = (async () => {
            const response = await fetch(MANIFEST_URL, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`Manifiesto de presets: HTTP ${response.status}`);
            const data = await response.json();
            if (!data || !Array.isArray(data.presets) || !data.presets.length) {
                throw new Error('Manifiesto de presets vacío');
            }
            manifest = data;
            manifest.byId = new Map(data.presets.map((entry) => [entry.id, entry]));
            return manifest;
        })().catch((error) => {
            manifestPromise = null;
            throw error;
        });
        return manifestPromise;
    }

    function decodeLatin1(buffer) {
        const bytes = new Uint8Array(buffer);
        let text = '';
        const chunk = 8192;
        for (let index = 0; index < bytes.length; index += chunk) {
            text += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
        }
        return text;
    }

    async function convertEntry(entry) {
        const response = await fetch(entry.file, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} al pedir ${entry.file}`);
        const text = decodeLatin1(await response.arrayBuffer());
        const api = await ensureConverter();
        const fn = api.convertPreset || (api.default && api.default.convertPreset);
        if (typeof fn !== 'function') throw new Error('convertPreset no disponible');
        const preset = fn(text);
        if (!preset || typeof preset !== 'object') throw new Error('El conversor devolvió un preset inválido');
        try {
            Object.defineProperty(preset, '__youtoo', {
                value: {
                    id: entry.id,
                    name: entry.name,
                    author: entry.author,
                    engine: entry.engine,
                    hlsl: entry.hlsl
                },
                enumerable: false
            });
        } catch (_) {}
        return preset;
    }

    async function get(id) {
        if (!id) return null;
        if (converted.has(id)) return converted.get(id);
        if (inflight.has(id)) return inflight.get(id);
        const promise = (async () => {
            const data = await load();
            const entry = data.byId.get(id);
            if (!entry) throw new Error(`Preset desconocido: ${id}`);

            const stored = await idbRead(id);
            if (stored && typeof stored === 'object') {
                converted.set(id, stored);
                return stored;
            }

            const preset = await convertEntry(entry);
            converted.set(id, preset);
            void idbWrite(id, preset);
            return preset;
        })()
            .catch((error) => {
                failed.set(id, error);
                console.warn('[YouToo] Preset no convertible:', id, error && error.message);
                return null;
            })
            .finally(() => { inflight.delete(id); });
        inflight.set(id, promise);
        return promise;
    }

    function peek(id) {
        return converted.get(id) || null;
    }

    function entries() {
        return manifest && Array.isArray(manifest.presets) ? manifest.presets : [];
    }

    function ids() {
        return entries().map((entry) => entry.id);
    }

    function label(id) {
        const entry = manifest && manifest.byId ? manifest.byId.get(id) : null;
        return entry ? entry.name : id;
    }

    function entry(id) {
        return manifest && manifest.byId ? manifest.byId.get(id) || null : null;
    }

    // 65% del tiempo elige entre los mejor valorados; el resto recorre todo el pack.
    function pickRandom(exclude) {
        const list = entries();
        if (!list.length) return null;
        const pool = list.length > 40 && Math.random() < 0.65 ? list.slice(0, Math.ceil(list.length * 0.35)) : list;
        for (let attempt = 0; attempt < 24; attempt += 1) {
            const candidate = pool[Math.floor(Math.random() * pool.length)];
            if (!candidate) continue;
            if (candidate.id === exclude) continue;
            if (failed.has(candidate.id)) continue;
            return candidate.id;
        }
        return pool.length ? pool[0].id : null;
    }

    // Calienta la caché en segundo plano para que el salto entre presets sea inmediato.
    async function prefetch(count) {
        const list = entries().slice(0, Math.max(0, count || 0));
        for (const item of list) {
            if (!converted.has(item.id)) {
                await get(item.id);
                await new Promise((resolve) => {
                    if (window.requestIdleCallback) window.requestIdleCallback(() => resolve(), { timeout: 600 });
                    else setTimeout(resolve, 40);
                });
            }
        }
    }

    function stats() {
        const list = entries();
        return {
            total: list.length,
            loaded: converted.size,
            failed: failed.size,
            hlsl: list.filter((item) => item.hlsl).length,
            equations: list.filter((item) => !item.hlsl).length
        };
    }

    window.NowarfyPresetLibrary = {
        load,
        get,
        peek,
        ids,
        label,
        entry,
        pickRandom,
        prefetch,
        stats,
        get manifest() { return manifest; }
    };
})();
