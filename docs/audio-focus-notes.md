# Prioridad de audio entre aplicaciones

La Web no expone una API general para inspeccionar qué otra aplicación está reproduciendo audio. `Media Session` permite publicar metadatos y responder a controles del sistema, pero no entrega a la página un listado de sesiones externas ni un evento universal de “WhatsApp empezó a reproducir”.

La API experimental `navigator.audioSession` sí modela una interrupción de plataforma. Su estado puede pasar a `interrupted` cuando otra aplicación toma control exclusivo del audio, y dispone de `statechange`. MDN la marca como de disponibilidad limitada y experimental, por lo que Nowarfy debe detectarla opcionalmente y conservar un camino compatible cuando no exista [1] [2].

La implementación de Nowarfy conoce opcionalmente el tipo `playback` de Audio Session, pero la preferencia actual es `NOWARFY_AUDIO_PRIORITY_MODE = true`: la aplicación conserva la reproducción en segundo plano y no cede automáticamente el foco a otra aplicación. Si el usuario quiere escuchar WhatsApp, debe pulsar pausa en Nowarfy. La pausa manual del IFrame se conserva y el watchdog no la revierte. El fade-out/fade-in y el sondeo de recuperación permanecen implementados como infraestructura de cesión cooperativa, pero no se activan en este modo prioritario.

No se usa `blur` como sustituto automático de foco externo: cambiar de ventana es precisamente uno de los casos legítimos de reproducción en segundo plano que Nowarfy debe preservar, y `blur` no prueba que WhatsApp haya comenzado un audio. Cuando la plataforma no expone `navigator.audioSession.state = "interrupted"`, el modo prioritario no interpreta una pausa externa fuera de foco como una orden para ceder. La continuidad vuelve a intentar la reproducción únicamente si el usuario no pausó Nowarfy y el estado de YouTube está realmente detenido; no interviene durante `PLAYING` ni `BUFFERING`. Una pausa manual hecha dentro del IFrame mientras la PWA tiene el foco se conserva como pausa del usuario y cancela cualquier reintento.

## Referencias

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API "MDN: Audio Session API"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/statechange_event "MDN: AudioSession statechange event"
[3]: https://developer.chrome.com/blog/media-session "Chrome Developers: Customize media notifications and handle playlists"
