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
    const IDB_VERSION = 5;

    let manifest = null;
    let manifestPromise = null;
    let converterPromise = null;
    let dbPromise = null;

    // Conversión fuera del hilo principal (ver presets/converter-worker.js).
    let presetWorker = null;
    let workerDisabled = false;
    let workerSequence = 0;
    const workerPending = new Map();

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
                if (db.objectStoreNames.contains(IDB_STORE)) db.deleteObjectStore(IDB_STORE);
                db.createObjectStore(IDB_STORE);
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

    function getPresetWorker() {
        if (workerDisabled || typeof Worker === 'undefined') return null;
        if (presetWorker) return presetWorker;
        try {
            presetWorker = new Worker('/presets/converter-worker.js');
            presetWorker.onmessage = (event) => {
                const data = event.data || {};
                const pending = workerPending.get(data.id);
                if (!pending) return;
                workerPending.delete(data.id);
                if (data.type === 'done') pending.resolve(data.preset);
                else {
                    const error = new Error(data.message || 'conversión fallida');
                    if (data.fatal) error.workerFatal = true;
                    pending.reject(error);
                }
            };
            presetWorker.onerror = () => {
                workerDisabled = true;
                try { presetWorker.terminate(); } catch (_) {}
                presetWorker = null;
                workerPending.forEach((pending) => {
                    const error = new Error('worker no disponible');
                    error.workerFatal = true;
                    pending.reject(error);
                });
                workerPending.clear();
            };
        } catch (_) {
            workerDisabled = true;
            presetWorker = null;
        }
        return presetWorker;
    }

    function convertInWorker(text) {
        return new Promise((resolve, reject) => {
            const worker = getPresetWorker();
            if (!worker) {
                const error = new Error('worker no disponible');
                error.workerFatal = true;
                reject(error);
                return;
            }
            const id = ++workerSequence;
            workerPending.set(id, { resolve, reject });
            try {
                worker.postMessage({ type: 'convert', id, text });
            } catch (error) {
                workerPending.delete(id);
                error.workerFatal = true;
                reject(error);
            }
        });
    }

    async function convertText(text) {
        if (!workerDisabled) {
            try {
                return await convertInWorker(text);
            } catch (error) {
                // Si el worker no puede (no soportado, sin clonar el preset),
                // se sigue en el hilo principal sin marcar el preset como roto.
                if (!error || !error.workerFatal) throw error;
                workerDisabled = true;
            }
        }
        const api = await ensureConverter();
        const fn = api.convertPreset || (api.default && api.default.convertPreset);
        if (typeof fn !== 'function') throw new Error('convertPreset no disponible');
        let preset = fn(text);
        if (preset && typeof preset.then === 'function') preset = await preset;
        if (!preset || typeof preset !== 'object') throw new Error('El conversor devolvió un preset inválido');
        return preset;
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

    /*
     * Normaliza el .milk antes de convertirlo. Dos patrones muy comunes en los
     * presets originales rompen al compilador de EEL (filbert):
     *
     *  1. Ecuaciones partidas en varias líneas, donde la continuación empieza
     *     con un operador:
     *         wave_2_per_point4=xx = pow(sample,5)*t1 + ...
     *         wave_2_per_point5=+ 10*sqr(sample)*... ;
     *
     *  2. Operadores unarios dentro de una llamada o paréntesis:
     *         sin(+atan2(x4-x3,y4-y3) - asin(1)*2)
     *     que se reescribe como sin(0+atan2(...) - ...).
     *
     * Ambas transformaciones son semánticamente neutras en EEL.
     */
    function normalizeSource(raw) {
        const keyOf = (line) => {
            const match = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
            return match ? { key: match[1], value: match[2] } : null;
        };
        const family = (key) => key.replace(/_\d+$/, '');
        // Solo se tocan ecuaciones EEL; el código HLSL de warp/comp se deja intacto.
        // Además de per_frame/per_vertex/etc. también son EEL las ecuaciones de
        // ondas (wave_N_init*, wave_N_per_point*) y formas (shape_N_*).
        const isEquationKey = (key) => /(per_frame|per_vertex|per_pixel|per_point|wave_\d|shape_\d)/.test(key);

        // 1) Une continuaciones con la ecuación anterior de la misma familia.
        //    La ecuación se puede cortar después de un operador (termina en +)
        //    o la continuación puede empezar con uno (=+ 10*...).
        const merged = [];
        for (const line of raw.split(/\r?\n/)) {
            const current = keyOf(line);
            if (current && merged.length) {
                const previous = keyOf(merged[merged.length - 1]);
                const sameFamily = previous && isEquationKey(previous.key) && isEquationKey(current.key)
                    && family(previous.key) === family(current.key);
                const openEnd = previous && /[+\-*\/,(]\s*$/.test(previous.value);
                const startsWithOperator = /^[+\-*\/,]/.test(current.value.trim());
                if (sameFamily && (openEnd || startsWithOperator)) {
                    merged[merged.length - 1] = `${previous.key}=${previous.value} ${current.value.trim()}`;
                    continue;
                }
            }
            merged.push(line);
        }

        // 2) Signos consecutivos: "rad-+ang" → "rad-ang", "a--b" → "a+b".
        let out = merged.join('\n').replace(/([+-])\s*([+-])/g,
            (match, first, second) => (first === second ? '+' : '-'));

        // 3) + / - unarios justo después de "(" o "," → 0+x / 0-x.
        out = out.replace(/([(,])([ \t]*)([+-])(?=[A-Za-z0-9_.(])/g,
            (match, prefix, space, sign) => `${prefix}${space}0${sign}`);

        // 4) Asegura que cada ecuación termine en ";". Algunos presets dejan
        //    expresiones sueltas (p. ej. "wave_1_init1=t") y el compilador de
        //    Butterchurn concatena " return a;" justo después, lo que produce
        //    "a['t'] return a;" (SyntaxError).
        out = out.replace(/^([A-Za-z0-9_]+)=(.+)$/gm, (match, key, value) => {
            if (!isEquationKey(key)) return match;
            const trimmed = value.trimEnd();
            if (!trimmed || trimmed.startsWith('//') || trimmed.endsWith(';')) return match;
            return `${key}=${trimmed};`;
        });

        return out;
    }
    function ensureSemicolons(str) {
        if (typeof str !== 'string') return str;
        let out = str;
        // Inserta ';' entre sentencias que quedaron pegadas (p. ej.
        // "a['t'] a['p1']=..." -> "a['t']; a['p1']=...").
        out = out.replace(/(\])(\s+)(a\[)/g, '$1;$2$3');
        out = out.replace(/(\))(\s+)(a\[)/g, '$1;$2$3');
        const t = out.trimEnd();
        if (!t || t.endsWith(';')) return out;
        return out + ';';
    }

    function fixPresetSemicolons(preset) {
        if (!preset || typeof preset !== 'object') return preset;
        for (const f of ['init_eqs_str', 'frame_eqs_str', 'pixel_eqs_str', 'vertex_eqs_str']) {
            if (typeof preset[f] === 'string') preset[f] = ensureSemicolons(preset[f]);
        }
        if (Array.isArray(preset.shapes)) {
            preset.shapes.forEach((sh) => {
                for (const f of ['init_eqs_str', 'frame_eqs_str']) {
                    if (typeof sh[f] === 'string') sh[f] = ensureSemicolons(sh[f]);
                }
            });
        }
        if (Array.isArray(preset.waves)) {
            preset.waves.forEach((w) => {
                for (const f of ['init_eqs_str', 'frame_eqs_str', 'point_eqs_str']) {
                    if (typeof w[f] === 'string') w[f] = ensureSemicolons(w[f]);
                }
            });
        }
        return preset;
    }

    async function convertEntry(entry) {
        const response = await fetch(entry.file, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} al pedir ${entry.file}`);
        const raw = decodeLatin1(await response.arrayBuffer());

        // Primero la versión normalizada; si el preset ya era válido, el texto
        // original queda como red de seguridad.
        const variants = [normalizeSource(raw), raw];
        let preset = null;
        let lastError = null;
        for (let vi = 0; vi < variants.length; vi++) {
            try {
                preset = await convertText(variants[vi]);
                break;
            } catch (error) {
                lastError = error;
            }
        }
        if (!preset) throw lastError || new Error('El conversor devolvió un preset inválido');
        fixPresetSemicolons(preset);
        fixPresetSemicolons(preset);
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

    // Marca un preset como no utilizable (conversión o render fallido) para saltarlo.
    function markBroken(id, reason) {
        if (id) failed.set(id, new Error(reason || 'preset descartado'));
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
    function pickRandom(exclude, engine) {
        const all = entries();
        if (!all.length) return null;
        const filtered = engine ? all.filter((item) => item.engine === engine) : all;
        const list = filtered.length ? filtered : all;
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
        markBroken,
        ids,
        label,
        entry,
        pickRandom,
        prefetch,
        stats,
        get manifest() { return manifest; }
    };
})();
