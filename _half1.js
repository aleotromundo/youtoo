(function(){
/* Vista retro de YouToo. Comparte la cola y el transporte del reproductor principal. */
(function () {
    'use strict';

    const MODE_KEY = 'nowarfy_classic';
    const VIZ_PRESET_KEY = 'nowarfy_retro_viz_preset_v1';
    const LEGACY_PRESET_KEY = 'nowarfy_retro_eq_preset_v1';
    const TRANSITION_MS = 3000;
    const MAX_VISIBLE_TRACKS = 400;
    // Cada preset se queda entre 45 s y 1 min 35 s antes de buscar otro.
    const PRESET_DWELL_MIN = 45000;
    const PRESET_DWELL_MAX = 95000;
    const PRESET_HISTORY_MAX = 24;
    // Un blend de MilkDrop ronda los 2-4 s; no se permite cortarlo antes.
    const PRESET_BLEND_MIN = 3.0;
    const PRESET_BLEND_MAX = 4.4;
    // Más de 1.5x de densidad de píxeles no se nota y cuesta GPU en 4K.
    const MAX_PIXEL_RATIO = 1.5;
    // Tope de píxeles del buffer para sostener 60 fps en pantalla completa 4K.
    const MAX_RENDER_PIXELS = 3200000;

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
    let presetRetryGuard = 0;
    let renderFailures = 0;
    let activePresetName = '';
    let activeButterchurnInput = null;
    let assetLoadPromise = null;
    let renderFrameId = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let resizeFrame = 0;
    let lastUiSyncAt = 0;
    let lastPresetChangeAt = 0;
    // Duración de cada preset: MilkDrop cambia cada 15 s por defecto, pero acá
    // se deja respirar bastante más para que la escena no se sienta cortada.
    let presetDwellMs = 0;
    let blendUntil = 0;
    let presetHistory = [];
    let queuedPresetId = '';
    let lastAmbientMode = false;
    let transitionTimer = 0;
    let transitionLocked = false;
    let queueSignature = '';
    let fallbackContext = null;
    let fallbackArt = null;
    let microphoneStream = null;
    let microphoneSource = null;
    let microphoneAnalyser = null;
    // Captura del audio de la pestaña: única vía para analizar YouTube u otros iframes.
    let captureStream = null;
    let captureSource = null;
    let captureAnalyser = null;
    let captureFrequencies = null;
    let externalGraph = null;
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
        const hadInput = Boolean(microphoneSource) && activeButterchurnInput === microphoneSource;
        try { microphoneSource?.disconnect(); } catch (_) {}
        try { microphoneAnalyser?.disconnect(); } catch (_) {}
        try { microphoneStream?.getTracks().forEach((track) => track.stop()); } catch (_) {}
        microphoneStream = null;
        microphoneSource = null;
        microphoneAnalyser = null;
        if (hadInput) disconnectButterchurnInput();
        if (hadInput && butterchurn) connectButterchurnInput();
        try { milkdropEngine?.attachAnalyser(activeGraph ? activeGraph.analyser : null); } catch (_) {}
    }

    async function startMicrophoneFallback(deviceId) {
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
            const audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            };
            if (deviceId) audioConstraints.deviceId = { exact: deviceId };
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            microphoneSource = context.createMediaStreamSource(microphoneStream);
            microphoneAnalyser = context.createAnalyser();
            microphoneAnalyser.fftSize = 2048;
            microphoneAnalyser.smoothingTimeConstant = 0.64;
            const silentGain = context.createGain();
            silentGain.gain.value = 0;
            microphoneSource.connect(microphoneAnalyser);
            microphoneAnalyser.connect(silentGain);
            silentGain.connect(context.destination);
            if (butterchurn) {
                try {
                    butterchurn.connectAudio(microphoneSource);
                    activeButterchurnInput = microphoneSource;
                } catch (error) {
                    console.warn('[YouToo] No se pudo enrutar el micrófono al visualizador:', error);
                }
            }
            milkdropEngine?.attachAnalyser(microphoneAnalyser);
            if (context.state === 'suspended') await context.resume().catch(() => {});
            // Guarda la preferencia del dispositivo.
            try {
                const track = microphoneStream.getAudioTracks()[0];
                const settings = track && track.getSettings ? track.getSettings() : {};
                const id = settings.deviceId || deviceId;
                if (id) localStorage.setItem('nowarfy_mic_device', id);
            } catch (_) {}
            setAudioState('Micrófono / cable virtual activo · señal reactiva', 'live');
            return true;
        } catch (error) {
            stopMicrophoneFallback();
            console.warn('[YouToo] No se pudo activar el micrófono:', error);
            setAudioState('No se pudo activar el micrófono; revisá el permiso del navegador.', 'warning');
            return false;
        }
    }

    function stopTabAudioCapture(silent) {
        const hadInput = Boolean(captureSource) && activeButterchurnInput === captureSource;
        try { captureSource?.disconnect(); } catch (_) {}
        try { captureAnalyser?.disconnect(); } catch (_) {}
        try { captureStream?.getTracks().forEach((track) => track.stop()); } catch (_) {}
        captureStream = null;
        captureSource = null;
        captureAnalyser = null;
        captureFrequencies = null;
        externalGraph = null;
        if (hadInput) disconnectButterchurnInput();
        try { milkdropEngine?.attachAnalyser(activeGraph ? activeGraph.analyser : null); } catch (_) {}
        if (hadInput && butterchurn) connectButterchurnInput();
        syncCaptureButton();
        if (!silent) setAudioState('Captura detenida · modo ambiente', 'warning');
    }

    /**
     * Captura el audio de la pestaña con getDisplayMedia. Es la única forma de
     * analizar el sonido de un iframe de YouTube: el navegador entrega la mezcla
     * de salida de la pestaña como un MediaStream que sí pasa por Web Audio.
     */
    async function startTabAudioCapture() {
        if (captureAnalyser) {
            setAudioState('Audio de la pestaña capturado · visualizador reactivo', 'live');
            return true;
        }
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setAudioState('Este navegador no permite capturar el audio de la pestaña.', 'warning');
            return false;
        }
        let stream = null;
        try {
            const context = ensureAudioContext();
            if (!context) throw new Error('Web Audio no disponible');
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'exclude',
                systemAudio: 'include'
            });
            const audioTracks = stream.getAudioTracks();
            if (!audioTracks.length) {
                try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
                setAudioState('Falta activar "Compartir audio" al elegir la pestaña.', 'warning');
                return false;
            }
            captureStream = stream;
            captureSource = context.createMediaStreamSource(stream);
            captureAnalyser = context.createAnalyser();
            captureAnalyser.fftSize = 2048;
            captureAnalyser.smoothingTimeConstant = 0.62;
            captureFrequencies = new Uint8Array(captureAnalyser.frequencyBinCount);
            captureSource.connect(captureAnalyser);
            externalGraph = { analyser: captureAnalyser, frequencies: captureFrequencies, external: true };
            if (butterchurn) {
                try {
                    butterchurn.connectAudio(captureSource);
                    activeButterchurnInput = captureSource;
                } catch (error) {
                    console.warn('[YouToo] No se pudo enrutar la captura al visualizador:', error);
                }
            }
            try { milkdropEngine?.attachAnalyser(captureAnalyser); } catch (_) {}
            audioTracks.forEach((track) => {
                track.addEventListener('ended', () => {
                    stopTabAudioCapture(true);
                    setAudioState('La captura terminó · modo ambiente', 'warning');
                });
            });
            if (context.state === 'suspended') await context.resume().catch(() => {});
            syncCaptureButton();
            setAudioState('Audio de la pestaña capturado · visualizador reactivo', 'live');
            return true;
        } catch (error) {
            try { stream?.getTracks().forEach((track) => track.stop()); } catch (_) {}
            console.warn('[YouToo] No se pudo capturar el audio de la pestaña:', error);
            const cancelled = error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
            setAudioState(cancelled
                ? 'Captura cancelada · el visualizador sigue en modo ambiente'
                : 'No se pudo capturar el audio de la pestaña.', 'warning');
            return false;
        }
    }

    async function populateMicDevices() {
        const select = $('retroMicDevice');
        if (!select || !navigator.mediaDevices?.enumerateDevices) return;
        let devices = [];
        try { devices = await navigator.mediaDevices.enumerateDevices(); } catch (_) { devices = []; }
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        select.innerHTML = '';
        if (!audioInputs.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Sin dispositivos';
            select.appendChild(opt);
            return;
        }
        const saved = (() => { try { return localStorage.getItem('nowarfy_mic_device') || ''; } catch (_) { return ''; } })();
        audioInputs.forEach((device, index) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.textContent = device.label || `Micrófono ${index + 1}`;
            if (saved && device.deviceId === saved) opt.selected = true;
            select.appendChild(opt);
        });
        select.hidden = false;
    }

    async function triggerMicCapture() {
        if (microphoneAnalyser) {
            stopMicrophoneFallback();
            if (captureAnalyser) syncCaptureButton();
            setAudioState('Micrófono detenido · modo ambiente', 'warning');
            syncMicButton();
            return;
        }
        // Detiene la captura de pestaña si estaba activa, para no duplicar.
        if (captureAnalyser) stopTabAudioCapture(true);
        await populateMicDevices();
        const select = $('retroMicDevice');
        const deviceId = select ? select.value : '';
        const ok = await startMicrophoneFallback(deviceId || undefined);
        syncMicButton();
        if (ok) {
            const track = microphoneStream && microphoneStream.getAudioTracks()[0];
            const label = track && track.label ? track.label : 'micrófono';
            setAudioState(`Micrófono activo (${label}) · señal reactiva`, 'live');
        }
    }

    function syncMicButton() {
        const button = $('retroMicBtn');
        if (!button) return;
        const active = Boolean(microphoneAnalyser);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.title = active ? 'Detener micrófono / cable virtual' : 'Usar micrófono o cable de audio virtual (VB-Cable)';
    }

    async function captureBestSignal() {
        if (microphoneAnalyser) { stopMicrophoneFallback(); syncMicButton(); }
        if (captureAnalyser) { stopTabAudioCapture(); return; }
        const ok = await startTabAudioCapture();
        if (!ok && !navigator.mediaDevices?.getDisplayMedia) void startMicrophoneFallback();
    }
        const button = $('retroCaptureBtn');
        if (!button) return;
        const active = Boolean(captureAnalyser);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.title = active ? 'Detener la captura de audio' : 'Capturar el audio de esta pestaña (YouTube, iframes)';
    }

    // Grafo de análisis efectivo: audio directo del reproductor o captura de pestaña.
    function analysisGraph() {
        const song = currentSong();
        if (activeGraph && song && String(song.type) !== 'yt') return activeGraph;
        return externalGraph;
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

    function currentPixelRatio() {
        const dpr = Number(window.devicePixelRatio) || 1;
        // Cuartos de paso: evita reasignar el buffer por cambios mínimos del zoom.
        return Math.min(MAX_PIXEL_RATIO, Math.max(1, Math.round(dpr * 4) / 4));
    }

    // Densidad efectiva: nunca supera el presupuesto de píxeles de la pantalla.
    function renderPixelRatio(cssWidth, cssHeight) {
        const base = currentPixelRatio();
        const area = Math.max(1, cssWidth * cssHeight);
        if (area * base * base <= MAX_RENDER_PIXELS) return base;
        return Math.max(0.7, Math.sqrt(MAX_RENDER_PIXELS / area));
    }

    /*
     * MilkDrop dibuja en un feedback buffer del tamaño exacto del lienzo. Todo
     * el pipeline de Butterchurn trabaja en píxeles reales: canvas.width/height,
     * texsize y el viewport de renderToScreen deben coincidir. Por eso se pasa
     * el tamaño en píxeles del dispositivo y pixelRatio fijo en 1.
     */
    function resizeVisualizer() {
        const canvas = $('retroVisualizerCanvas');
        if (!canvas) return;
        const fallback = $('retroFallbackCanvas');
        const host = $('retroVisualizerShell') || canvas.parentElement;
        const rect = (host || canvas).getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const cssWidth = Math.max(1, Math.round(rect.width));
        const cssHeight = Math.max(1, Math.round(rect.height));
        const pixelRatio = renderPixelRatio(cssWidth, cssHeight);
        const width = Math.round(cssWidth * pixelRatio);
        const height = Math.round(cssHeight * pixelRatio);
        const fallbackNeedsSize = Boolean(fallback && !fallback.hidden
            && (fallback.width !== width || fallback.height !== height));
        if (!fallbackNeedsSize && width === renderWidth && height === renderHeight
            && canvas.width === width && canvas.height === height) return;
        renderWidth = width;
        renderHeight = height;
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        if (butterchurn) {
            try { butterchurn.setRendererSize(width, height, { pixelRatio: 1 }); } catch (_) {}
        } else if (milkdropEngine) {
            try { milkdropEngine.resize(); } catch (_) {}
        } else if (fallback && !fallback.hidden) {
            fallback.width = width;
            fallback.height = height;
        }
    }

    // Agrupa los avisos de resize/fullscreen en un solo cuadro.
    function scheduleResize() {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            resizeVisualizer();
        });
    }

    // El DPR cambia al mover la ventana entre monitores o al hacer zoom.
    function watchPixelRatio() {
        if (!window.matchMedia) return;
        try {
            const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
            const onChange = () => {
                resizeVisualizer();
                watchPixelRatio();
            };
            if (query.addEventListener) query.addEventListener('change', onChange, { once: true });
            else if (query.addListener) query.addListener(onChange);
        } catch (_) {}
    }

    function isFullscreen() {
        return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function toggleFullscreen() {
        const target = $('retroVisualizerShell');
        if (!target) return;
        if (isFullscreen()) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            try { const task = exit && exit.call(document); if (task && task.catch) task.catch(() => {}); } catch (_) {}
            return;
        }
        const request = target.requestFullscreen || target.webkitRequestFullscreen;
        if (typeof request !== 'function') {
            setAudioState('Este navegador no permite pantalla completa.', 'warning');
            return;
        }
        try { const task = request.call(target); if (task && task.catch) task.catch(() => {}); } catch (_) {}
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

    function markPresetStarted(id, blend) {
        const now = performance.now();
        lastPresetChangeAt = now;
        presetDwellMs = PRESET_DWELL_MIN + Math.random() * (PRESET_DWELL_MAX - PRESET_DWELL_MIN);
        blendUntil = now + Math.max(1200, (Number(blend) || 0) * 1000);
        if (id) {
            presetHistory.push(id);
            if (presetHistory.length > PRESET_HISTORY_MAX) presetHistory.shift();
        }
    }

    // Prepara un preset cuando la página está inactiva, para no cortar frames.
    function schedulePrefetch(id) {
        if (!id || !presetLibrary) return;
        const run = () => { void presetLibrary.get(id); };
        if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 6000 });
        else window.setTimeout(run, 1600);
    }

    // Elige un preset evitando los últimos vistos, para que no se repitan seguido.
    function pickNextPresetId() {
        if (!presetLibrary) return '';
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = presetLibrary.pickRandom(activePresetName);
            if (id && !presetHistory.includes(id)) return id;
        }
        return presetLibrary.pickRandom(activePresetName) || '';
    }

    /*
     * Toma el preset que quedó preparado al entrar al actual. Si ya no sirve
     * (es el actual o se repitió hace poco) se descarta y se elige otro. La
     * idea es que el próximo cambio no espere la conversión de un .milk.
     */
    function takeQueuedPresetId() {
        const queued = queuedPresetId;
        queuedPresetId = '';
        if (!queued || queued === activePresetName) return '';
        if (presetHistory.includes(queued)) return '';
        if (presetLibrary && !presetLibrary.entry(queued)) return '';
        return queued;
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
            const blend = Number.isFinite(transition)
                ? transition
                : PRESET_BLEND_MIN + Math.random() * (PRESET_BLEND_MAX - PRESET_BLEND_MIN);
            butterchurn.loadPreset(preset, blend);
            activePresetName = nameOrId;
            markPresetStarted(nameOrId, blend);
            presetRetryGuard = 0;
            const info = presetLibrary ? presetLibrary.entry(nameOrId) : null;
            presetTitle(info ? `${info.name}${info.hlsl ? ' · MD2 (aprox.)' : ''}` : nameOrId);
            try { localStorage.setItem(VIZ_PRESET_KEY, nameOrId); } catch (_) {}
            // Deja listo el siguiente preset (ya convertido) sin bloquear este cambio:
            // así el próximo switch solo tiene que cargarlo en el shader.
            if (presetLibrary) {
                const nextId = pickNextPresetId();
                if (nextId) {
                    queuedPresetId = nextId;
                    schedulePrefetch(nextId);
                }
            }
            return true;
        } catch (error) {
            console.warn('[YouToo] Preset MilkDrop no compatible:', nameOrId, error);
            if (presetLibrary) presetLibrary.markBroken(nameOrId, error && error.message);
            return false;
        }
    }

    function chooseRandomPreset(force) {
        if (milkdropEngine && typeof milkdropEngine.nextScene === 'function') {
            milkdropEngine.nextScene();
            return;
        }
        if (!butterchurn) return;
        const now = performance.now();
        if (!force && now < blendUntil) return;
        let target = takeQueuedPresetId();
        if (!target) target = pickNextPresetId();
        if (!target && presetNames.length) {
            const start = Math.floor(Math.random() * presetNames.length);
            for (let offset = 0; offset < presetNames.length; offset += 1) {
                const candidate = presetNames[(start + offset) % presetNames.length];
                if (candidate !== activePresetName) { target = candidate; break; }
            }
        }
        if (!target) return;
        void switchPreset(target).then((ok) => {
            if (ok || presetRetryGuard >= 3) { presetRetryGuard = 0; return; }
            presetRetryGuard += 1;
            setTimeout(() => chooseRandomPreset(force), 140);
        });
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
})();