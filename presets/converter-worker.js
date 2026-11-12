/*
 * YouToo · Conversor de presets MilkDrop en segundo plano.
 *
 * La conversión de .milk es costosa (EEL → JavaScript + GLSL) y bloqueaba el
 * hilo principal durante 1-3 s, justo cuando cambiaba el preset. Este worker
 * hace el mismo trabajo sin congelar la visualización.
 */
'use strict';

let converterPromise = null;

function ensureConverter() {
    if (converterPromise) return converterPromise;
    converterPromise = new Promise((resolve, reject) => {
        try {
            importScripts('/vendor/milkdrop-preset-converter-0.1.2.min.js');
            const api = self.milkdropPresetConverter;
            if (!api) { reject(new Error('Conversor no disponible en el worker')); return; }
            resolve(api);
        } catch (error) {
            reject(error);
        }
    }).catch((error) => {
        converterPromise = null;
        throw error;
    });
    return converterPromise;
}

self.onmessage = async function (event) {
    const data = event.data || {};
    if (data.type !== 'convert') return;

    let preset;
    try {
        const api = await ensureConverter();
        const fn = api.convertPreset || (api.default && api.default.convertPreset);
        if (typeof fn !== 'function') throw new Error('convertPreset no disponible');
        let result = fn(data.text);
        if (result && typeof result.then === 'function') result = await result;
        if (!result || typeof result !== 'object') throw new Error('El conversor devolvió un preset inválido');
        preset = result;
    } catch (error) {
        self.postMessage({
            type: 'error',
            id: data.id,
            fatal: false,
            message: String((error && error.message) || error)
        });
        return;
    }

    try {
        self.postMessage({ type: 'done', id: data.id, preset });
    } catch (error) {
        // Si el preset no se puede clonar, el hilo principal lo convierte.
        self.postMessage({
            type: 'error',
            id: data.id,
            fatal: true,
            message: String((error && error.message) || error)
        });
    }
};
