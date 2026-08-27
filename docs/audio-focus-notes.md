# Prioridad de audio entre aplicaciones

La Web no expone una API general para inspeccionar qué otra aplicación está reproduciendo audio. `Media Session` permite publicar metadatos y responder a controles del sistema, pero no entrega a la página un listado de sesiones externas ni un evento universal de “WhatsApp empezó a reproducir”.

La API experimental `navigator.audioSession` sí modela una interrupción de plataforma. Su estado puede pasar a `interrupted` cuando otra aplicación toma control exclusivo del audio, y dispone de `statechange`. MDN la marca como de disponibilidad limitada y experimental, por lo que Nowarfy debe detectarla opcionalmente y conservar un camino compatible cuando no exista [1] [2].

La implementación de Nowarfy usa el tipo `playback` cuando la API está disponible. Al recibir `interrupted`, guarda la intención y la posición, pausa el IFrame oficial o el audio local y detiene el anclaje casi inaudible. Cuando la interrupción termina, reanuda solo si la pista seguía activa y el usuario no había pulsado pausa. El watchdog queda bloqueado durante la interrupción para no reclamar el foco.

No se usa `blur` como sustituto automático de foco externo: cambiar de ventana es precisamente uno de los casos legítimos de reproducción en segundo plano que Nowarfy debe preservar, y `blur` no prueba que WhatsApp haya comenzado un audio. Si ChromeOS no entrega `navigator.audioSession.state = "interrupted"`, una PWA no puede saberlo con certeza sin una acción explícita del usuario.

## Referencias

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API "MDN: Audio Session API"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/statechange_event "MDN: AudioSession statechange event"
[3]: https://developer.chrome.com/blog/media-session "Chrome Developers: Customize media notifications and handle playlists"
