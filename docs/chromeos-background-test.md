# Prueba de continuidad en segundo plano

Fecha: 26 de agosto de 2026.

La versión local de Nowarfy cargó correctamente con el elemento `silent-audio-loop` y la lógica de continuidad. Al iniciar una pista de prueba de YouTube en Chromium, el IFrame mostró el desafío de YouTube `Sign in to confirm you're not a bot`, por lo que esta prueba no permite medir una reproducción YouTube completa ni un evento `ENDED` real.

La instrumentación quedó preparada para inspeccionar el estado del IFrame y del audio nativo. La aplicación conserva la transición por eventos (`onYTStateChange` y `timeupdate`) y mantiene `setInterval` solamente como respaldo; no se debe interpretar el bucle silencioso como garantía de que YouTube permita segundo plano ni como un servicio multimedia nativo.

La verificación en ChromeOS real requiere un video reproducible, una sesión válida y apagar pantalla/minimizar la ventana en el equipo del usuario. El navegador automatizado no puede simular de forma fiable la pantalla apagada ni quitar un challenge de YouTube.

## Cambios preparados

- `silent-audio-loop` se inicia al pasar a reproducción y se detiene al pausar, finalizar o fallar.
- La detección de `ENDED` del IFrame sigue siendo la fuente principal para YouTube.
- El evento `timeupdate` del audio nativo ejecuta una comprobación ligera como respaldo.
- El avance consume primero la próxima pista ya presente en la cola y solo genera una tanda nueva si hace falta.
- La posición y la cola siguen guardándose antes de ocultar o abandonar la página.

## Limitación observada

El audio silencioso no puede obligar al IFrame a continuar si YouTube, ChromeOS o el sistema operativo suspenden el reproductor. Tampoco reemplaza el reproductor oficial ni elimina sus restricciones.

Autor: Manus AI.

---

## Segunda validación

La fuente `assets/nowarfy-silence.wav` carga correctamente en Chromium: formato PCM WAV, `readyState = 4`, duración `0.1` segundos y `loop = true`. En el momento de inspección permanecía pausada porque no se inició una reproducción real mediante un gesto de usuario. Esto confirma que el asset es válido; no confirma que el navegador vaya a mantener un IFrame de YouTube ni que ChromeOS entregue eventos de fondo de forma garantizada.

## Prueba interactiva local

El WAV no pudo iniciar desde la consola porque Chromium exige un gesto de usuario (`NotAllowedError`), que es el comportamiento esperado de la política de autoplay. Al activar el área de reproducción, el IFrame de YouTube cargó, pero el entorno de prueba mostró el desafío de YouTube “Sign in to confirm you’re not a bot”; por ese motivo no fue posible observar una reproducción real ni medir un cambio de pista de YouTube en este sandbox. El botón visible de control continúa siendo el elemento `#playBtn`; los índices del navegador cambian cuando se monta el IFrame.

---
