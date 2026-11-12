/* Vista retro de YouToo. Comparte la cola y el transporte del reproductor principal. */
(function () {
    'use strict';

    const MODE_KEY = 'nowarfy_classic';
    const VIZ_PRESET_KEY = 'nowarfy_retro_viz_preset_v1';
    const LEGACY_PRESET_KEY = 'nowarfy_retro_eq_preset_v1';
    const TRANSITION_MS = 3000;
    const MAX_VISIBLE_TRACKS = 400;

    const $ = (id) => document.getElementById(id);
    const corsResults = new Map();
    const corsPreparedMedia = new WeakSet();
    const graphByMedia = new WeakMap();
    let audioContext = null;
    let activeGraph = null;
    let butterchurn = null;
    let milkdropEngine = null;
    let presetCollection = null;
    let presetNames = [];
    let presetLibrary = null;
    let presetLibraryPromise = null;
    let visualizerInitPromise = null;
    let activePresetName = '';
    let activeButterchurnInput = null;
    let assetLoadPromise = null;
    let renderFrameId = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let lastUiSyncAt = 0;
    let lastPresetChangeAt = 0;
    let lastAmbientMode = false;
    let transitionTimer = 0;
    let transitionLocked = false;
    let queueSignature = '';
    let fallbackContext = null;
    let fallbackArt = null;
    let microphoneStream = null;
    let microphoneSource = null;
    let microphoneAnalyser = null;
    const musicDirector = {
        low: 0,
        mid: 0,
        high: 0,
        energy: 0,
        previousLow: 0,
        beatLevel: 0,
        lastBeatAt: 0,
        lastDecisionAt: 0,
        history: [],
        variant: 0,
        recentSeeds: []
    };

    function isRetro() {
        return document.body.classList.contains('mode-classic');
    }

    function currentSong() {
        try {
            if (typeof currentQueueSong === 'function') return currentQueueSong();
            if (typeof queue !== 'undefined' && Array.isArray(queue) && typeof currentIndex !== 'undefined') return queue[currentIndex] || null;
        } catch (_) {}
        return null;
    }

    function activeMedia() {
        try {
            if (typeof activeAudioEl !== 'undefined' && activeAudioEl) return activeAudioEl;
        } catch (_) {}
        return $('audio-element');
    }

    function isActuallyPlaying() {
        try { return typeof isPlaying !== 'undefined' && Boolean(isPlaying); } catch (_) { return false; }
    }

    function formatTime(value) {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    function songDuration(song) {
        if (song && String(song.type) === 'yt') {
            try {
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.getDuration === 'function') {
                    const duration = Number(ytPlayer.getDuration());
                    if (Number.isFinite(duration) && duration > 0) return duration;
                }
            } catch (_) {}
        }
        const media = activeMedia();
        const duration = Number(media && media.duration);
        return Number.isFinite(duration) && duration > 0 ? duration : Number(song && song.duration) || 0;
    }

    function songPosition(song) {
        if (song && String(song.type) === 'yt') {
            try {
                if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
                    return Math.max(0, Number(ytPlayer.getCurrentTime()) || 0);
                }
            } catch (_) {}
        }
        const media = activeMedia();
        return Math.max(0, Number(media && media.currentTime) || 0);
    }

    function setAudioState(message, kind) {
        const status = $('retroAudioState');
        if (status && message) {
            status.textContent = message;
            status.dataset.state = kind || 'info';
        }
    }

    function isSameOrigin(url) {
        try { return new URL(url, window.location.href).origin === window.location.origin; }
        catch (_) { return false; }
    }

    async function probeCors(url) {
        if (!url) return false;
        if (isSameOrigin(url) || String(url).startsWith('blob:') || String(url).startsWith('data:')) return true;
        if (corsResults.has(url)) return corsResults.get(url);

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1800);
        let allowed = false;
        try {
            // GET + rango de un byte es una solicitud de lectura ligera y valida CORS sin pasar el medio a Web Audio.
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: { Range: 'bytes=0-0' },
                signal: controller.signal,
                cache: 'no-store'
            });
            allowed = response.ok && response.type !== 'opaque';
            if (response.body) response.body.cancel().catch(() => {});
        } catch (_) {
            allowed = false;
        } finally {
            window.clearTimeout(timeout);
        }
        if (corsResults.size > 160) corsResults.clear();
        corsResults.set(url, allowed);
        return allowed;
    }

    function rebuildMedia(media) {
        try {
            if (typeof nowarfyRebuildMediaElement === 'function') return nowarfyRebuildMediaElement(media);
        } catch (error) {
            console.warn('[YouToo] No se pudo reconstruir el elemento de audio:', error);
        }
        return media;
    }

    function disconnectButterchurnInput() {
        if (!butterchurn || !activeButterchurnInput) {
            activeButterchurnInput = null;
            return;
        }
        try { butterchurn.disconnectAudio(activeButterchurnInput); } catch (_) {}
        activeButterchurnInput = null;
    }

    function disconnectGraph(graph) {
        if (!graph) return;
        try { graph.source.disconnect(); } catch (_) {}
        try { graph.analyser.disconnect(); } catch (_) {}
        try { graph.silentGain.disconnect(); } catch (_) {}
    }

    function stopMicrophoneFallback() {
        try { microphoneSource?.disconnect(); } catch (_) {}
        try { microphoneAnalyser?.disconnect(); } catch (_) {}
        try { microphoneStream?.getTracks().forEach((track) => track.stop()); } catch (_) {}
        microphoneStream = null;
        microphoneSource = null;
        microphoneAnalyser = null;
    }

    async function startMicrophoneFallback() {
        if (microphoneAnalyser) {
            setAudioState('Micrófono activo · señal reactiva', 'live');
            return true;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            setAudioState('Este navegador no permite usar el micrófono.', 'warning');
            return false;
        }
        try {
            const context = ensureAudioContext();
            if (!context) throw new Error('Web Audio no disponible');
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            microphoneSource = context.createMediaStreamSource(microphoneStream);
            microphoneAnalyser = context.createAnalyser();
            microphoneAnalyser.fftSize = 2048;
            microphoneAnalyser.smoothingTimeConstant = 0.64;
            const silentGain = context.createGain();
            silentGain.gain.value = 0;
            microphoneSource.connect(microphoneAnalyser);
            microphoneAnalyser.connect(silentGain);
            silentGain.connect(context.destination);
            milkdropEngine?.attachAnalyser(microphoneAnalyser);
            if (context.state === 'suspended') await context.resume().catch(() => {});
            setAudioState('Micrófono activo · señal reactiva', 'live');
            return true;
        } catch (error) {
            stopMicrophoneFallback();
            console.warn('[YouToo] No se pudo activar el micrófono:', error);
            setAudioState('No se pudo activar el micrófono; revisá el permiso del navegador.', 'warning');
            return false;
        }
    }

    async function prepareMediaLoad(media, url) {
        if (!media || !url) return media;
        const needsAnalysis = isRetro();

        if (!needsAnalysis) {
            if (graphByMedia.has(media)) {
                const graph = graphByMedia.get(media);
                if (activeGraph === graph) activeGraph = null;
                disconnectButterchurnInput();
                disconnectGraph(graph);
                graphByMedia.delete(media);
                return rebuildMedia(media);
            }
            try { media.removeAttribute('crossorigin'); } catch (_) {}
            corsPreparedMedia.delete(media);
            return media;
        }

        const corsAvailable = await probeCors(url);
        if (corsAvailable) {
            try { media.crossOrigin = 'anonymous'; } catch (_) {}
            corsPreparedMedia.add(media);
            attachMediaEvents(media);
            return media;
        }

        corsPreparedMedia.delete(media);
        setAudioState('Esta fuente no permite análisis CORS; el audio sigue funcionando en modo normal.', 'warning');
        if (graphByMedia.has(media)) {
            const graph = graphByMedia.get(media);
            if (activeGraph === graph) activeGraph = null;
            disconnectButterchurnInput();
            disconnectGraph(graph);
            graphByMedia.delete(media);
            return rebuildMedia(media);
        }
        try { media.removeAttribute('crossorigin'); } catch (_) {}
        return media;
    }

    function ensureAudioContext() {
        if (audioContext) return audioContext;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        try {
            audioContext = new AudioContextClass();
            return audioContext;
        } catch (error) {
            console.warn('[YouToo] Web Audio no disponible:', error);
            return null;
        }
    }

    function makeAudioGraph(media) {
        const existing = graphByMedia.get(media);
        if (existing) return existing;
        const context = ensureAudioContext();
        if (!context) return null;
        try {
            const source = context.createMediaElementSource(media);
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.78;
            const silentGain = context.createGain();
            silentGain.gain.value = 0;
            const graph = {
                media,
                source,
                analyser,
                silentGain,
                frequencies: new Uint8Array(analyser.frequencyBinCount)
            };
            graphByMedia.set(media, graph);
            source.connect(analyser);
            analyser.connect(silentGain);
            silentGain.connect(context.destination);
            return graph;
        } catch (error) {
            console.warn('[YouToo] No se pudo crear el grafo de audio:', error);
            setAudioState('No se pudo iniciar Web Audio en este navegador; la reproducción continúa normalmente.', 'warning');
            return null;
        }
    }

    function routeGraph(graph) {
        if (!graph || !audioContext) return false;
        stopMicrophoneFallback();
        disconnectButterchurnInput();
        if (activeGraph && activeGraph !== graph) disconnectGraph(activeGraph);
        disconnectGraph(graph);

        try {
            // Primero se asegura una ruta audible independiente del visualizador.
            graph.source.connect(audioContext.destination);
        } catch (error) {
            console.warn('[YouToo] No se pudo restablecer la salida de audio:', error);
            setAudioState('No se pudo restablecer la salida de audio del navegador.', 'warning');
            return false;
        }

        if (graph.analysisUnavailable) {
            activeGraph = null;
            setAudioState('El audio sigue sonando · análisis visual no disponible.', 'warning');
            return false;
        }

        try {
            graph.source.connect(graph.analyser);
            graph.analyser.connect(graph.silentGain);
            graph.silentGain.connect(audioContext.destination);
            if (isRetro() && butterchurn) {
                butterchurn.connectAudio(graph.source);
                activeButterchurnInput = graph.source;
            }
            if (milkdropEngine) milkdropEngine.attachAnalyser(graph.analyser);
            activeGraph = graph;
            if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
            return true;
        } catch (error) {
            // No desconectar graph.source: su salida directa ya está conectada al destino.
            try { graph.analyser.disconnect(); } catch (_) {}
            try { graph.silentGain.disconnect(); } catch (_) {}
            disconnectButterchurnInput();
            activeGraph = null;
            console.warn('[YouToo] No se pudo iniciar el análisis visual:', error);
            setAudioState('El audio sigue sonando · no se pudo activar el análisis visual.', 'warning');
            if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
            return false;
        }
    }

    function connectCurrentMedia(media) {
        const song = currentSong();
        if (!media || !song || !isActuallyPlaying()) return;
        if (String(song.type) === 'yt') {
            setAudioState('Señal interna no disponible · tocá para usar el micrófono', 'warning');
            return;
        }
        const url = song.url || media.currentSrc || media.src;
        const corsIsReady = corsPreparedMedia.has(media) || media.crossOrigin === 'anonymous' || isSameOrigin(url);
        if (!corsIsReady) {
            setAudioState('Sin señal interna · tocá para usar el micrófono', 'warning');
            return;
        }
        const graph = makeAudioGraph(media);
        if (!graph) return;
        if (routeGraph(graph)) setAudioState('Señal directa · visualizador reactivo', 'live');
    }

    function releaseMediaGraph(media) {
        if (!media) return;
        const graph = graphByMedia.get(media);
        if (!graph) return;
        if (activeGraph === graph) activeGraph = null;
        if (activeButterchurnInput) disconnectButterchurnInput();
        disconnectGraph(graph);
        graphByMedia.delete(media);
    }

    function attachMediaEvents(media) {
        if (!media || media.dataset.retroAudioEvents === '1') return;
        media.dataset.retroAudioEvents = '1';
        media.addEventListener('playing', () => {
            if (media === activeMedia()) connectCurrentMedia(media);
            syncDeck(true);
        });
        media.addEventListener('loadedmetadata', () => syncDeck(true));
        media.addEventListener('timeupdate', () => syncDeck(false));
        media.addEventListener('pause', () => syncDeck(false));
        media.addEventListener('ended', () => syncDeck(true));
    }

    function loadScriptOnce(path, marker) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-retro-vendor="${marker}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') resolve();
                else {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                }
                return;
            }
            const script = document.createElement('script');
            script.async = true;
            script.src = path;
            script.dataset.retroVendor = marker;
            script.onload = () => { script.dataset.loaded = '1'; resolve(); };
            script.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
            document.head.appendChild(script);
        });
    }

    function loadButterchurnAssets() {
        if (window.butterchurn && window.butterchurnPresets) return Promise.resolve();
        if (assetLoadPromise) return assetLoadPromise;
        assetLoadPromise = (async () => {
            if (!window.butterchurn) await loadScriptOnce('/vendor/butterchurn-2.6.7.min.js', 'butterchurn-core');
            if (!window.butterchurnPresets) await loadScriptOnce('/vendor/butterchurn-presets-2.4.7.min.js', 'butterchurn-presets');
        })().finally(() => { assetLoadPromise = null; });
        return assetLoadPromise;
    }

    function resizeVisualizer() {
        const canvas = $('retroVisualizerCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pixelRatio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
        const width = Math.max(1, Math.round(rect.width * pixelRatio));
        const height = Math.max(1, Math.round(rect.height * pixelRatio));
        if (width === renderWidth && height === renderHeight) return;
        renderWidth = width;
        renderHeight = height;
        if (butterchurn) {
            try { butterchurn.setRendererSize(width, height); } catch (_) {}
        } else if (milkdropEngine) {
            try { milkdropEngine.resize(); } catch (_) {}
        } else {
            const fallback = $('retroFallbackCanvas');
            if (fallback) {
                fallback.width = width;
                fallback.height = height;
            }
        }
    }

    function setFallbackMode(message) {
        const canvas = $('retroVisualizerCanvas');
        const fallback = $('retroFallbackCanvas');
        if (canvas) canvas.hidden = true;
        if (fallback) fallback.hidden = false;
        if (message) setAudioState(message, 'warning');
        fallbackContext = fallback ? fallback.getContext('2d') : null;
        resizeVisualizer();
    }

    function setButterchurnMode() {
        const canvas = $('retroVisualizerCanvas');
        const fallback = $('retroFallbackCanvas');
        if (canvas) canvas.hidden = false;
        if (fallback) fallback.hidden = true;
        resizeVisualizer();
    }

    function presetTitle(name) {
        const el = $('retroPresetName');
        if (el) el.textContent = name || 'MilkDrop · esperando señal';
    }

    async function switchPreset(nameOrId, transition) {
        if (!butterchurn || !nameOrId) return false;
        if (!presetCollection) presetCollection = Object.create(null);
        let preset = presetCollection[nameOrId];
        if (!preset) {
            if (!presetLibrary) return false;
            preset = await presetLibrary.get(nameOrId);
            if (!preset || !butterchurn) return false;
            presetCollection[nameOrId] = preset;
        }
        try {
            butterchurn.loadPreset(preset, Number.isFinite(transition) ? transition : 3.0);
            activePresetName = nameOrId;
            lastPresetChangeAt = performance.now();
            presetTitle(presetLibrary ? presetLibrary.label(nameOrId) : nameOrId);
            try { localStorage.setItem(VIZ_PRESET_KEY, nameOrId); } catch (_) {}
            return true;
        } catch (error) {
            console.warn('[YouToo] Preset MilkDrop no compatible:', nameOrId, error);
            return false;
        }
    }

    function chooseRandomPreset() {
        if (milkdropEngine && typeof milkdropEngine.nextScene === 'function') {
            milkdropEngine.nextScene();
            return;
        }
        if (!butterchurn) return;
        let target = presetLibrary ? presetLibrary.pickRandom(activePresetName) : '';
        if (!target && presetNames.length) {
            const start = Math.floor(Math.random() * presetNames.length);
            for (let offset = 0; offset < presetNames.length; offset += 1) {
                const candidate = presetNames[(start + offset) % presetNames.length];
                if (candidate !== activePresetName) { target = candidate; break; }
            }
        }
        if (!target) return;
        if (!loadUniquePreset(target, performance.now(), 0.52)) void switchPreset(target);
    }

    function copyPreset(preset) {
        try {
            if (typeof structuredClone === 'function') return structuredClone(preset);
            return JSON.parse(JSON.stringify(preset));
        } catch (_) { return null; }
    }

    function seededRandom(seed) {
        let value = seed >>> 0;
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    function presetSeed(name, now) {
        const song = currentSong();
        const text = `${song?.url || song?.title || 'ambient'}|${name}|${Math.floor(now / 1000)}|${musicDirector.variant}`;
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return hash >>> 0;
    }

    function mixNumericValues(target, first, second, random, intensity) {
        if (!target || typeof target !== 'object') return;
        const keys = new Set([...Object.keys(first || {}), ...Object.keys(second || {})]);
        keys.forEach((key) => {
            const a = first?.[key];
            const b = second?.[key];
            if (typeof a === 'number' || typeof b === 'number') {
                const base = typeof a === 'number' && typeof b === 'number' ? (random() > 0.46 ? a : b) : (typeof a === 'number' ? a : b);
                const spread = 1 + (random() - 0.5) * intensity;
                target[key] = Number.isFinite(base) ? base * spread : base;
            } else if (a && typeof a === 'object') {
                if (!target[key] || typeof target[key] !== 'object') target[key] = copyPreset(a) || {};
                mixNumericValues(target[key], a, b, random, intensity * 0.7);
            }
        });
    }

    function buildUniquePreset(name, now, intensity) {
        if (!presetCollection?.[name]) return null;
        const otherName = presetNames[(presetNames.indexOf(name) + 1 + Math.floor(Math.random() * Math.max(1, presetNames.length - 1))) % presetNames.length];
        const source = copyPreset(presetCollection[name]);
        const other = copyPreset(presetCollection[otherName]);
        if (!source || !other) return source;
        const random = seededRandom(presetSeed(name, now));
        mixNumericValues(source.baseVals, source.baseVals, other.baseVals, random, 0.08 + intensity * 0.16);
        if (Array.isArray(source.shapes) && Array.isArray(other.shapes)) {
            source.shapes = source.shapes.map((shape, index) => random() > 0.48 ? (copyPreset(other.shapes[index]) || shape) : shape);
        }
        if (Array.isArray(source.waves) && Array.isArray(other.waves)) {
            source.waves = source.waves.map((wave, index) => random() > 0.42 ? (copyPreset(other.waves[index]) || wave) : wave);
        }
        musicDirector.variant += 1;
        musicDirector.recentSeeds.push(presetSeed(name, now));
        if (musicDirector.recentSeeds.length > 18) musicDirector.recentSeeds.shift();
        return source;
    }

    function loadUniquePreset(name, now, intensity) {
        const preset = buildUniquePreset(name, now, intensity);
        if (!butterchurn || !preset) return false;
        const transition = Math.max(1.4, Math.min(5.8, 4.7 - intensity * 2.4));
        try {
            butterchurn.loadPreset(preset, transition);
            activePresetName = name;
            lastPresetChangeAt = now;
            presetTitle(`✦ ${name} · variation ${musicDirector.variant}`);
            try { localStorage.setItem(VIZ_PRESET_KEY, name); } catch (_) {}
            return true;
        } catch (error) {
            console.warn('[YouToo] No se pudo cargar la variación generativa:', error);
            return false;
        }
    }

    function readBand(frequencies, from, to) {
        const start = Math.max(0, Math.floor(frequencies.length * from));
        const end = Math.min(frequencies.length, Math.max(start + 1, Math.floor(frequencies.length * to)));
        let total = 0;
        for (let index = start; index < end; index += 1) total += frequencies[index];
        return total / Math.max(1, end - start) / 255;
    }

    function directPresetChange(now, intensity) {
        if (!butterchurn || presetNames.length < 2) return;
        if (now - musicDirector.lastDecisionAt < 7600) return;
        musicDirector.lastDecisionAt = now;
        const jump = Math.max(1, Math.floor(intensity * presetNames.length * 0.22));
        const current = Math.max(0, presetNames.indexOf(activePresetName));
        const direction = musicDirector.high > musicDirector.low ? 1 : -1;
        const target = presetNames[(current + direction * jump + presetNames.length * 2) % presetNames.length];
        if (target && target !== activePresetName) {
            if (!loadUniquePreset(target, now, intensity)) switchPreset(target);
        }
    }

    function updateMusicDirector(now) {
        const song = currentSong();
        const graph = activeGraph && song && String(song.type) !== 'yt' ? activeGraph : null;
        if (!graph || !graph.frequencies) return;
        const frequencies = graph.frequencies;
        const rawLow = readBand(frequencies, 0.005, 0.085);
        const rawMid = readBand(frequencies, 0.085, 0.38);
        const rawHigh = readBand(frequencies, 0.38, 0.86);
        musicDirector.low += (rawLow - musicDirector.low) * 0.18;
        musicDirector.mid += (rawMid - musicDirector.mid) * 0.14;
        musicDirector.high += (rawHigh - musicDirector.high) * 0.12;
        musicDirector.energy = musicDirector.low * 0.54 + musicDirector.mid * 0.32 + musicDirector.high * 0.14;
        const rise = Math.max(0, musicDirector.low - musicDirector.previousLow);
        musicDirector.previousLow = musicDirector.low;
        musicDirector.history.push(musicDirector.energy);
        if (musicDirector.history.length > 42) musicDirector.history.shift();
        const baseline = musicDirector.history.reduce((sum, value) => sum + value, 0) / Math.max(1, musicDirector.history.length);
        const beat = rise > 0.018 && musicDirector.energy > Math.max(0.2, baseline * 1.18);
        musicDirector.beatLevel += ((beat ? 1 : 0) - musicDirector.beatLevel) * 0.24;
        if (beat && now - musicDirector.lastBeatAt > 520) {
            musicDirector.lastBeatAt = now;
            if (musicDirector.energy > 0.34) directPresetChange(now, Math.min(1, musicDirector.energy + rise * 2));
        }
    }

    async function ensurePresetLibrary() {
        if (presetLibrary) return presetLibrary;
        if (presetLibraryPromise) return presetLibraryPromise;
        presetLibraryPromise = (async () => {
            await loadScriptOnce('/modules/milkdrop-presets.js', 'milkdrop-presets');
            const library = window.NowarfyPresetLibrary;
            if (!library) throw new Error('Biblioteca de presets no disponible');
            const data = await library.load();
            presetLibrary = library;
            presetNames = library.ids();
            console.info('[YouToo] Presets MilkDrop reales:', data.count,
                '· HLSL:', data.stats && data.stats.with_hlsl,
                '· solo ecuaciones:', data.stats && data.stats.equations_only);
            return library;
        })().catch((error) => {
            presetLibraryPromise = null;
            throw error;
        });
        return presetLibraryPromise;
    }

    function connectButterchurnInput() {
        if (!butterchurn || !activeGraph) return;
        try {
            butterchurn.connectAudio(activeGraph.source);
            activeButterchurnInput = activeGraph.source;
        } catch (error) {
            console.warn('[YouToo] No se pudo conectar la señal de audio al visualizador:', error);
        }
    }

    async function initButterchurn() {
        if (butterchurn) { setButterchurnMode(); return; }
        if (visualizerInitPromise) return visualizerInitPromise;
        visualizerInitPromise = (async () => {
            try {
                await loadButterchurnAssets();
                const canvas = $('retroVisualizerCanvas');
                if (!canvas) throw new Error('Lienzo del visualizador no disponible');
                const context = ensureAudioContext();
                if (!context) throw new Error('El navegador no dispone de Web Audio');
                const core = window.butterchurn && window.butterchurn.createVisualizer
                    ? window.butterchurn
                    : (window.butterchurn && window.butterchurn.default);
                if (!core || typeof core.createVisualizer !== 'function') throw new Error('Butterchurn no disponible');

                const rect = canvas.getBoundingClientRect();
                const pixelRatio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
                if (!renderWidth || !renderHeight) {
                    renderWidth = Math.max(1, Math.round((rect.width || 640) * pixelRatio));
                    renderHeight = Math.max(1, Math.round((rect.height || 360) * pixelRatio));
                }

                butterchurn = core.createVisualizer(context, canvas, {
                    width: renderWidth,
                    height: renderHeight,
                    pixelRatio: 1,
                    textureRatio: 1
                });
                setButterchurnMode();
                presetTitle('MilkDrop · cargando presets…');
                connectButterchurnInput();

                try {
                    const library = await ensurePresetLibrary();
                    let stored = '';
                    try { stored = localStorage.getItem(VIZ_PRESET_KEY) || ''; } catch (_) {}
                    const startId = presetNames.includes(stored) ? stored : library.pickRandom();
                    if (startId) await switchPreset(startId, 0);
                    void library.prefetch(4);
                } catch (error) {
                    console.warn('[YouToo] No se pudo cargar el pack real; se usan los presets incluidos:', error);
                    const bundled = window.butterchurnPresets && (window.butterchurnPresets.default || window.butterchurnPresets);
                    const presets = bundled && typeof bundled.getPresets === 'function' ? bundled.getPresets() : null;
                    if (presets) {
                        presetCollection = Object.create(null);
                        Object.keys(presets).forEach((name) => { presetCollection[name] = presets[name]; });
                        presetNames = Object.keys(presets);
                        if (presetNames.length) await switchPreset(presetNames[0], 0);
                    }
                }

                if (!renderFrameId && isRetro()) renderFrameId = requestAnimationFrame(renderLoop);
            } catch (error) {
                console.warn('[YouToo] Motor MilkDrop no disponible, se usa el motor generativo:', error);
                butterchurn = null;
                await initGenerativeEngine();
            }
        })().finally(() => { visualizerInitPromise = null; });
        return visualizerInitPromise;
    }

    async function initGenerativeEngine() {
        try {
            await loadScriptOnce('/modules/milkdrop-engine.js', 'milkdrop-engine');
            const canvas = $('retroVisualizerCanvas');
            if (!canvas || !window.NowarfyMilkdropEngine) throw new Error('Motor MilkDrop nuevo no disponible');
            const context = ensureAudioContext();
            if (!context) throw new Error('El navegador no dispone de Web Audio');
            milkdropEngine = new window.NowarfyMilkdropEngine(canvas);
            milkdropEngine.onSceneChange = (index) => presetTitle(`YouToo Generative · escena ${String(index).padStart(2, '0')}`);
            if (activeGraph) milkdropEngine.attachAnalyser(activeGraph.analyser);
            setButterchurnMode();
            presetTitle('YouToo Generative · feedback engine');
            if (activeGraph) routeGraph(activeGraph);
            if (!renderFrameId && isRetro()) renderFrameId = requestAnimationFrame(renderLoop);
        } catch (error) {
            console.warn('[YouToo] Motor WebGL2 no disponible, se usará el espectro alternativo:', error);
            milkdropEngine = null;
            butterchurn = null;
            setFallbackMode('WebGL2 no disponible en este navegador; espectro visual alternativo activo.');
            if (!renderFrameId && isRetro()) renderFrameId = requestAnimationFrame(renderLoop);
        }
    }

    async function prepareCurrentVisualizationTrack() {
        const song = currentSong();
        const media = activeMedia();
        if (!song || !song.url || String(song.type) === 'yt' || !media) return;
        if (graphByMedia.has(media)) {
            connectCurrentMedia(media);
            return;
        }
        if (media.crossOrigin === 'anonymous' || corsPreparedMedia.has(media) || isSameOrigin(song.url)) {
            corsPreparedMedia.add(media);
            connectCurrentMedia(media);
            return;
        }
        const allowed = await probeCors(song.url);
        if (!allowed) {
            setAudioState('Esta pista no publica permiso CORS; se mantiene el sonido y el visualizador pasa a modo ambiente.', 'warning');
            return;
        }
        if (typeof currentIndex !== 'undefined' && typeof playQueueAt === 'function') {
            const position = songPosition(song);
            const wasPlaying = isActuallyPlaying();
            playQueueAt(currentIndex, {
                resumeSession: {
                    resourceId: song.url,
                    type: song.type,
                    position,
                    wasPlaying
                }
            });
        }
    }

    function buildSpectrumBars() {
        const container = $('retroSpectrumBars');
        if (!container || container.dataset.ready === '1') return;
        container.dataset.ready = '1';
        const count = 48;
        for (let index = 0; index < count; index += 1) {
            const bar = document.createElement('i');
            bar.style.setProperty('--bar-index', String(index));
            container.appendChild(bar);
        }
    }

    function disableGraphAnalysis(graph, error) {
        if (!graph) return;
        graph.analysisUnavailable = true;
        try { graph.source.disconnect(graph.analyser); } catch (_) {}
        try { graph.analyser.disconnect(); } catch (_) {}
        try { graph.silentGain.disconnect(); } catch (_) {}
        if (activeGraph === graph) activeGraph = null;
        try { milkdropEngine?.attachAnalyser(null); } catch (_) {}
        disconnectButterchurnInput();
        console.warn('[YouToo] Se desactivó el análisis visual; se conserva la salida de audio:', error);
        setAudioState('El audio sigue sonando · visualizador en modo ambiente.', 'warning');
    }

    function updateSpectrum(now) {
        const bars = $('retroSpectrumBars');
        if (!bars) return;
        const children = bars.children;
        const song = currentSong();
        const useAmbient = !activeGraph || !song || String(song.type) === 'yt' || lastAmbientMode;
        const graph = activeGraph && !useAmbient ? activeGraph : null;
        let frequency = graph ? graph.frequencies : null;
        if (frequency) {
            try { graph.analyser.getByteFrequencyData(frequency); }
            catch (error) {
                disableGraphAnalysis(graph, error);
                frequency = null;
            }
        }
        for (let index = 0; index < children.length; index += 1) {
            let intensity;
            if (frequency) {
                const start = Math.floor((Math.pow(2, index / children.length) - 1) * frequency.length);
                const end = Math.max(start + 1, Math.floor((Math.pow(2, (index + 1) / children.length) - 1) * frequency.length));
                let total = 0;
                for (let bin = start; bin < Math.min(end, frequency.length); bin += 1) total += frequency[bin];
                intensity = total / Math.max(1, Math.min(end, frequency.length) - start) / 255;
            } else {
                const wave = Math.sin(now / 145 + index * 0.51) * 0.34 + Math.sin(now / 231 + index * 0.18) * 0.2 + 0.39;
                intensity = Math.max(0.04, wave);
            }
            const height = Math.max(4, Math.min(100, intensity * 115));
            children[index].style.height = `${height}%`;
            children[index].style.opacity = String(0.38 + Math.min(0.62, intensity));
        }
    }

    function drawFallback(now) {
        const canvas = $('retroFallbackCanvas');
        if (!canvas || canvas.hidden) return;
        if (!fallbackContext) fallbackContext = canvas.getContext('2d');
        const ctx = fallbackContext;
        if (!ctx || !canvas.width || !canvas.height) return;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const baseRadius = Math.min(width, height) * 0.14;
        ctx.fillStyle = 'rgba(3, 5, 10, 0.25)';
        ctx.fillRect(0, 0, width, height);
        if (fallbackArt && fallbackArt.complete && fallbackArt.naturalWidth) {
            ctx.save();
            ctx.globalAlpha = 0.09;
            ctx.filter = 'blur(12px) saturate(1.7)';
            const size = Math.max(width, height) * 0.85;
            ctx.drawImage(fallbackArt, centerX - size / 2, centerY - size / 2, size, size);
            ctx.restore();
        }
        const song = currentSong();
        let graph = activeGraph && song && String(song.type) !== 'yt' ? activeGraph : null;
        if (graph) {
            try { graph.analyser.getByteFrequencyData(graph.frequencies); }
            catch (error) {
                disableGraphAnalysis(graph, error);
                graph = null;
            }
        }
        for (let ring = 0; ring < 3; ring += 1) {
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${(now / 65 + ring * 82) % 360}, 95%, ${48 + ring * 7}%, ${0.2 - ring * 0.035})`;
            ctx.lineWidth = Math.max(1, width / 850);
            const radius = baseRadius * (1 + ring * 0.47 + Math.sin(now / 800 + ring) * 0.035);
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        const count = 112;
        for (let index = 0; index < count; index += 1) {
            const angle = index / count * Math.PI * 2;
            const bin = graph ? Math.floor(Math.pow(index / count, 1.8) * graph.frequencies.length) : 0;
            const reactive = graph ? graph.frequencies[Math.min(bin, graph.frequencies.length - 1)] / 255 : (0.18 + 0.3 * (0.5 + 0.5 * Math.sin(now / 190 + index * 0.35)));
            const length = baseRadius * (0.35 + reactive * 1.8);
            const x1 = centerX + Math.cos(angle) * baseRadius;
            const y1 = centerY + Math.sin(angle) * baseRadius;
            const x2 = centerX + Math.cos(angle) * (baseRadius + length);
            const y2 = centerY + Math.sin(angle) * (baseRadius + length);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `hsla(${(index / count * 155 + now / 90) % 360}, 100%, 58%, 0.82)`;
            ctx.lineWidth = Math.max(1.5, width / 430);
            ctx.stroke();
        }
        const waveRadius = baseRadius * (1.92 + 0.05 * Math.sin(now / 900));
        ctx.beginPath();
        for (let index = 0; index <= 256; index += 1) {
            const angle = index / 256 * Math.PI * 2;
            const bin = graph ? Math.floor(index / 256 * graph.frequencies.length) : 0;
            const amplitude = graph ? graph.frequencies[Math.min(bin, graph.frequencies.length - 1)] / 255 : 0.12 + 0.12 * Math.sin(now / 220 + index * 0.12);
            const radius = waveRadius + amplitude * baseRadius * 0.62;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(132, 255, 18, 0.86)';
        ctx.lineWidth = Math.max(1.5, width / 520);
        ctx.stroke();
    }

    function syncDeck(force) {
        const now = performance.now();
        if (!force && now - lastUiSyncAt < 280) return;
        lastUiSyncAt = now;
        const song = currentSong();
        if (force && song && String(song.type) === 'yt' && !microphoneAnalyser) {
            setAudioState('Señal interna no disponible · tocá para usar el micrófono', 'warning');
        }
        const title = song?.title || 'Esperando una pista';
        const artist = song?.artist || song?.channelTitle || 'YouToo · Retro Studio';
        const titleEl = $('retroTrackTitle');
        const artistEl = $('retroTrackArtist');
        if (titleEl) titleEl.textContent = title;
        if (artistEl) artistEl.textContent = artist;
        const cover = $('retroArtwork');
        const image = song?.img || '';
        if (cover && cover.dataset.src !== image) {
            cover.dataset.src = image;
            cover.src = image;
            cover.hidden = !image;
        }
        const artWash = $('retroArtWash');
        if (artWash) {
            try {
                const artUrl = new URL(image, window.location.href);
                artWash.style.backgroundImage = image && ['https:', 'http:'].includes(artUrl.protocol) ? `url(${JSON.stringify(artUrl.href)})` : 'none';
            } catch (_) { artWash.style.backgroundImage = 'none'; }
        }
        fallbackArt = cover && !cover.hidden ? cover : null;

        const duration = songDuration(song);
        const position = songPosition(song);
        const progress = $('retroSeek');
        if (progress) {
            progress.disabled = !(duration > 0);
            if (document.activeElement !== progress) progress.value = duration > 0 ? String(Math.round(position / duration * 1000)) : '0';
            progress.setAttribute('aria-valuetext', `${formatTime(position)} de ${formatTime(duration)}`);
        }
        const currentTime = $('retroCurrentTime');
        const screenTime = $('retroClockTime');
        const totalTime = $('retroTotalTime');
        const isSeeking = document.activeElement === progress;
        if (currentTime && !isSeeking) currentTime.textContent = formatTime(position);
        if (screenTime && !isSeeking) screenTime.textContent = formatTime(position);
        if (totalTime) totalTime.textContent = formatTime(duration);

        const playButton = $('retroPlayToggle');
        if (playButton) {
            const playing = isActuallyPlaying();
            playButton.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
            playButton.innerHTML = `<i class="fas ${playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>`;
        }
        const trackNumber = $('retroTrackNumber');
        if (trackNumber) {
            const index = typeof currentIndex !== 'undefined' ? Number(currentIndex) : -1;
            const total = typeof queue !== 'undefined' && Array.isArray(queue) ? queue.length : 0;
            trackNumber.textContent = index >= 0 ? `PISTA ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : 'SIN PISTA';
        }

        const source = $('retroSourceBadge');
        if (source) {
            const youtube = song && String(song.type) === 'yt';
            source.textContent = !song ? 'LISTO' : youtube ? 'YOUTUBE · AUDIO AISLADO' : 'AUDIO DIRECTO';
            source.dataset.kind = !song ? 'idle' : youtube ? 'youtube' : 'direct';
        }
        const status = $('retroAudioState');
        if (status) {
            const youtube = song && String(song.type) === 'yt';
            if (youtube) {
                status.textContent = 'Modo ambiente · YouTube no expone su señal de audio al visualizador';
                status.dataset.state = 'warning';
                lastAmbientMode = true;
                disconnectButterchurnInput();
            } else if (!song) {
                status.textContent = 'Elegí una pista para conectar la señal';
                status.dataset.state = 'info';
                lastAmbientMode = true;
            } else if (activeGraph && activeGraph.media === activeMedia()) {
                status.textContent = 'Señal directa · MilkDrop reactivo';
                status.dataset.state = 'live';
                lastAmbientMode = false;
            } else {
                status.textContent = 'Modo ambiente · esta fuente no permite análisis directo';
                status.dataset.state = 'warning';
                lastAmbientMode = true;
            }
        }

        const volume = $('retroVolume');
        const mainVolume = $('volumeSlider');
        if (volume && mainVolume && document.activeElement !== volume) volume.value = mainVolume.value;
        const volumeValue = $('retroVolumeValue');
        if (volumeValue && mainVolume) volumeValue.textContent = `${Math.round((Number(mainVolume.value) || 0) * 100)}%`;
        const continuous = $('retroContinuous');
        if (continuous) {
            const enabled = typeof continuousPlayback !== 'undefined' && Boolean(continuousPlayback);
            continuous.setAttribute('aria-pressed', String(enabled));
            continuous.textContent = enabled ? 'CONTINUA' : 'UNA PISTA';
        }
        const shuffle = $('retroShuffle');
        if (shuffle) {
            const enabled = typeof shuffleMode !== 'undefined' && Boolean(shuffleMode);
            shuffle.setAttribute('aria-pressed', String(enabled));
            shuffle.textContent = enabled ? 'ALEATORIO ON' : 'MEZCLAR';
        }
        const playingMedia = activeMedia();
        if (isRetro() && song && String(song.type) !== 'yt' && playingMedia && !playingMedia.paused && corsPreparedMedia.has(playingMedia) && !graphByMedia.has(playingMedia)) {
            connectCurrentMedia(playingMedia);
        }
        const queueCount = $('retroQueueCount');
        if (queueCount) queueCount.textContent = `${typeof queue !== 'undefined' && Array.isArray(queue) ? queue.length : 0} pistas`;
    }

    function renderPlaylist() {
        const list = $('retroPlaylist');
        if (!list) return;
        const items = typeof queue !== 'undefined' && Array.isArray(queue) ? queue : [];
        const current = typeof currentIndex !== 'undefined' ? Number(currentIndex) : -1;
        const visible = items.slice(0, MAX_VISIBLE_TRACKS);
        list.replaceChildren();

        if (!items.length) {
            const empty = document.createElement('li');
            empty.className = 'retro-empty';
            empty.innerHTML = '<i class="fas fa-compact-disc" aria-hidden="true"></i><span>La Playlist está vacía</span><small>Buscá música y agregala a la cola</small>';
            list.appendChild(empty);
            return;
        }

        visible.forEach((song, index) => {
            const item = document.createElement('li');
            item.className = `retro-track${index === current ? ' is-current' : ''}`;
            item.dataset.qid = String(song?._qid || '');

            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'retro-track-play';
            play.setAttribute('aria-label', `Reproducir ${song?.title || 'pista'}`);
            play.addEventListener('click', () => { if (typeof playQueueAt === 'function') playQueueAt(index); });

            const number = document.createElement('span');
            number.className = 'retro-track-index';
            number.textContent = String(index + 1).padStart(2, '0');
            const copy = document.createElement('span');
            copy.className = 'retro-track-copy';
            const name = document.createElement('span');
            name.className = 'retro-track-name';
            name.textContent = song?.title || 'Sin título';
            const artist = document.createElement('span');
            artist.className = 'retro-track-artist';
            artist.textContent = song?.artist || song?.channelTitle || 'YouTube';
            copy.append(name, artist);
            const duration = document.createElement('span');
            duration.className = 'retro-track-duration';
            duration.textContent = typeof song?.duration === 'string' && song.duration.includes(':') ? song.duration : formatTime(song?.duration);
            play.append(number, copy, duration);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'retro-track-remove';
            const isCurrentTrack = index === current;
            remove.disabled = isCurrentTrack;
            remove.setAttribute('aria-label', isCurrentTrack ? 'La pista en reproducción no se puede quitar desde esta Playlist' : `Quitar ${song?.title || 'pista'} de la Playlist`);
            remove.title = isCurrentTrack ? 'La pista actual no se puede quitar' : 'Quitar de la Playlist';
            remove.innerHTML = '<i class="fas fa-xmark" aria-hidden="true"></i>';
            if (!isCurrentTrack) remove.addEventListener('click', () => {
                if (typeof removeFromQueue === 'function') removeFromQueue(song._qid);
            });

            item.append(play, remove);
            list.appendChild(item);
        });

        if (items.length > visible.length) {
            const note = document.createElement('li');
            note.className = 'retro-list-limit';
            note.textContent = `Mostrando ${visible.length} de ${items.length} pistas`;
            list.appendChild(note);
        }
        const currentRow = list.querySelector('.is-current');
        if (currentRow && list.scrollHeight > list.clientHeight) {
            const rowTop = currentRow.offsetTop;
            const rowBottom = rowTop + currentRow.offsetHeight;
            if (rowTop < list.scrollTop || rowBottom > list.scrollTop + list.clientHeight) {
                currentRow.scrollIntoView({ block: 'nearest' });
            }
        }
        queueSignature = `${items.length}:${current}:${items.map((item) => item?._qid || '').join(',')}`;
    }

    function updateModeToggle() {
        const button = $('retroModeToggle');
        const caption = $('retroModeCaption');
        if (!button) return;
        const retro = isRetro();
        button.setAttribute('aria-checked', String(retro));
        button.classList.toggle('is-retro', retro);
        button.setAttribute('aria-label', retro ? 'Cambiar al modo moderno' : 'Cambiar al modo retro estilo Winamp');
        if (caption) caption.textContent = retro ? 'RETRO · WINAMP' : 'MODERNO · YOUTOO';
    }

    function createTransitionFx() {
        let fx = $('retroTransitionFx');
        if (fx) return fx;
        fx = document.createElement('div');
        fx.id = 'retroTransitionFx';
        fx.className = 'retro-transition-fx';
        fx.setAttribute('aria-hidden', 'true');
        fx.innerHTML = '<div class="retro-fx-grid"></div><div class="retro-fx-scan"></div><div class="retro-fx-caption"><span>RECONFIGURANDO INTERFAZ</span><strong>SEÑAL ANALÓGICA</strong><i></i></div>';
        document.body.appendChild(fx);
        return fx;
    }

    function setRetroMode(enabled, options) {
        const opts = options || {};
        const turnOn = Boolean(enabled);
        if (transitionLocked && !opts.initial) return;
        if (turnOn === isRetro() && !opts.initial) return;
        const body = document.body;
        const toggle = $('retroModeToggle');
        const panel = $('retroStudio');

        if (!opts.initial) {
            transitionLocked = true;
            body.classList.add('mode-transitioning');
            const fx = createTransitionFx();
            fx.classList.remove('is-active');
            void fx.offsetWidth;
            fx.classList.add('is-active');
            if (toggle) toggle.disabled = true;
            window.clearTimeout(transitionTimer);
            const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            transitionTimer = window.setTimeout(() => {
                body.classList.remove('mode-transitioning');
                fx.classList.remove('is-active');
                transitionLocked = false;
                if (toggle) toggle.disabled = false;
            }, reducedMotion ? 500 : TRANSITION_MS);
        }

        body.classList.toggle('mode-classic', turnOn);
        body.classList.toggle('mode-youtoo', !turnOn);
        if (panel) panel.hidden = !turnOn;
        updateModeToggle();
        try { localStorage.setItem(MODE_KEY, turnOn ? '1' : '0'); } catch (_) {}

        if (turnOn) {
            renderPlaylist();
            syncDeck(true);
            if (activeGraph) routeGraph(activeGraph);
            void initButterchurn();
            const song = currentSong();
            if (song && song.url && String(song.type) !== 'yt') void prepareCurrentVisualizationTrack();
            if (!renderFrameId) renderFrameId = requestAnimationFrame(renderLoop);
        } else {
            if (renderFrameId) cancelAnimationFrame(renderFrameId);
            renderFrameId = 0;
            stopMicrophoneFallback();
            disconnectButterchurnInput();
            if (activeGraph) routeGraph(activeGraph);
        }
    }

    function renderLoop(now) {
        renderFrameId = 0;
        if (!isRetro() || document.hidden) return;
        try {
            updateMusicDirector(now);
            if (butterchurn) {
                try { butterchurn.render(); }
                catch (error) {
                    console.warn('[YouToo] Falló el render MilkDrop:', error);
                    butterchurn = null;
                    void initGenerativeEngine();
                }
            } else if (milkdropEngine) {
                try { milkdropEngine.render(now); }
                catch (error) {
                    console.warn('[YouToo] Falló el motor generativo:', error);
                    milkdropEngine = null;
                    setFallbackMode('Se activó el visualizador alternativo.');
                }
            }
            resizeVisualizer();
            updateSpectrum(now);
            drawFallback(now);
            if (now - lastUiSyncAt > 280) syncDeck(false);
            if (butterchurn && presetNames.length > 1 && now - lastPresetChangeAt > 32000) chooseRandomPreset();
        } catch (error) {
            console.warn('[YouToo] Falló un ciclo del visualizador:', error);
            try { setFallbackMode('Se activó el visualizador alternativo.'); } catch (_) {}
        } finally {
            if (isRetro() && !document.hidden) renderFrameId = requestAnimationFrame(renderLoop);
        }
    }

    function previewSeek(value) {
        const song = currentSong();
        const duration = songDuration(song);
        const fraction = Math.max(0, Math.min(1, Number(value) / 1000));
        const time = $('retroCurrentTime');
        const clock = $('retroClockTime');
        if (time && duration > 0) time.textContent = formatTime(duration * fraction);
        if (clock && duration > 0) clock.textContent = formatTime(duration * fraction);
    }

    function commitRetroSeek(value) {
        if (typeof commitSeek === 'function') commitSeek(Math.max(0, Math.min(1, Number(value) / 1000)));
    }

    function attachExistingMedia() {
        ['audio-element', 'free-video-element'].forEach((id) => attachMediaEvents($(id)));
        const media = activeMedia();
        if (media) attachMediaEvents(media);
    }

    function init() {
        if (!$('retroModeToggle') || !$('retroStudio')) return;
        try {
            localStorage.removeItem('nowarfy_retro_eq_state_v1');
            localStorage.removeItem('nowarfy_retro_eq_on_v1');
        } catch (_) {}
        buildSpectrumBars();
        updateModeToggle();
        attachExistingMedia();
        document.addEventListener('pointerdown', () => {
            if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        }, { passive: true });

        $('retroModeToggle').addEventListener('click', () => setRetroMode(!isRetro()));
        $('retroAudioState')?.addEventListener('click', () => { void startMicrophoneFallback(); });
        $('retroAudioState')?.setAttribute('role', 'button');
        $('retroAudioState')?.setAttribute('tabindex', '0');
        $('retroAudioState')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void startMicrophoneFallback(); }
        });
        $('retroPresetNext')?.addEventListener('click', chooseRandomPreset);
        $('retroFullscreen')?.addEventListener('click', () => {
            const target = $('retroVisualizerShell');
            if (!target) return;
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            else target.requestFullscreen?.().catch(() => {});
        });
        $('retroVisualizerShell')?.addEventListener('dblclick', (event) => {
            if (event.target?.closest?.('button, input, a, select')) return;
            const target = $('retroVisualizerShell');
            if (!target) return;
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            else target.requestFullscreen?.().catch(() => {});
        });
        $('retroVolume')?.addEventListener('input', (event) => {
            const mainVolume = $('volumeSlider');
            if (mainVolume) mainVolume.value = event.target.value;
            if (typeof setVolume === 'function') setVolume(event.target.value);
        });
        $('retroClearQueue')?.addEventListener('click', () => {
            if (typeof clearQueue === 'function') clearQueue();
        });
        $('retroContinuous')?.addEventListener('click', () => {
            if (typeof toggleContinuousPlayback === 'function') toggleContinuousPlayback();
            syncDeck(true);
        });
        $('retroShuffle')?.addEventListener('click', () => {
            if (typeof toggleShuffle === 'function') toggleShuffle();
            renderPlaylist();
            syncDeck(true);
        });

        window.addEventListener('nowarfy:queue-updated', () => {
            renderPlaylist();
            syncDeck(true);
            const song = currentSong();
            if (song && String(song.type) === 'yt') {
                disconnectButterchurnInput();
                if (activeGraph) routeGraph(activeGraph);
            }
        });
        document.addEventListener('nowarfy:media-rebuilt', (event) => {
            const previous = event.detail?.previous;
            if (previous) releaseMediaGraph(previous);
            attachExistingMedia();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isRetro() && !renderFrameId) renderFrameId = requestAnimationFrame(renderLoop);
        });
        window.addEventListener('resize', resizeVisualizer, { passive: true });
        if (window.ResizeObserver) {
            const observer = new ResizeObserver(resizeVisualizer);
            const shell = $('retroVisualizerShell');
            if (shell) observer.observe(shell);
        }

        window.nowarfyAudioViz = {
            isRouted: (media) => graphByMedia.has(media),
            prepareMediaLoad,
            onMediaPlaying: connectCurrentMedia
        };
        window.toggleRetroMode = () => setRetroMode(!isRetro());
        window.nextRetroPreset = chooseRandomPreset;
        window.previewRetroSeek = previewSeek;
        window.commitRetroSeek = commitRetroSeek;
        window.previewRetroVolume = (value) => {
            const mainVolume = $('volumeSlider');
            if (mainVolume) mainVolume.value = value;
            if (typeof setVolume === 'function') setVolume(value);
        };

        renderPlaylist();
        syncDeck(true);
        let forceRetro = false;
        try { forceRetro = new URLSearchParams(window.location.search).get('retro') === '1'; } catch (_) {}
        try {
            if (forceRetro || localStorage.getItem(MODE_KEY) === '1' || document.body.classList.contains('mode-classic')) {
                setRetroMode(true, { initial: true });
                const song = currentSong();
                if (song && song.url && String(song.type) !== 'yt') void prepareCurrentVisualizationTrack();
                void initButterchurn();
                renderFrameId = requestAnimationFrame(renderLoop);
            }
        } catch (_) {}
    }

    if (window.nowarfyModulesReady) init();
    else window.addEventListener('nowarfy:modules-ready', init, { once: true });
})();
