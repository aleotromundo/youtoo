# Investigación técnica: Vanced, ReVanced, NewPipe y Nowarfy YouToo®

**Fecha:** 26 de agosto de 2026

## Resumen ejecutivo

Vanced y ReVanced no consiguen la reproducción en segundo plano mediante una función web que pueda copiarse dentro de Nowarfy. Son modificaciones de una aplicación Android o sistemas de parcheo de aplicaciones Android. NewPipe utiliza otra arquitectura nativa: obtiene una fuente de audio directa, la reproduce con un reproductor Android y mantiene una `MediaSession` dentro de un `Service` separado.

La idea útil para Nowarfy es copiar la arquitectura de producto, no el mecanismo de extracción: cuando exista una fuente de audio directa y autorizada —por ejemplo, Openverse, Jamendo, SoundCloud, Bandcamp o un archivo propio con licencia— Nowarfy puede reproducirla mediante `<audio>`, `Media Session`, una cola persistente y la memoria de posición. Para YouTube sin una fuente alternativa autorizada, la PWA debe seguir utilizando el iframe oficial.

## Qué hace cada proyecto

| Proyecto | Tipo | Cómo logra el segundo plano | ¿Se puede copiar directamente en una PWA? |
|---|---|---|---|
| Vanced | App Android modificada | Modifica el cliente móvil de YouTube y su flujo de reproducción | No; depende de modificar una app nativa |
| ReVanced | Patcher para apps Android | Aplica parches al APK compatible | No; no es una API web ni un reproductor web |
| NewPipe | Cliente Android libre | Resuelve un `AudioStream` o un stream reproducible y lo entrega a ExoPlayer dentro de un `PlayerService` | Solo el patrón de arquitectura; no la extracción de YouTube |
| Nowarfy YouToo® | PWA | Usa iframe oficial de YouTube y `<audio>/<video>` para fuentes directas | Sí para audio directo; limitado para iframe de YouTube |

## Evidencia técnica

### ReVanced

El sitio oficial de [ReVanced](https://revanced.app/) describe ReVanced como un sistema para aplicar parches a aplicaciones móviles mediante ReVanced Patcher. No describe una API de streaming ni un mecanismo web. El repositorio público de parches consultado en [GitHub](https://github.com/ReVanced/revanced-patches) aparece deshabilitado por una notificación DMCA, lo que también muestra un riesgo operativo y de distribución para basar un producto comercial en parches de terceros.

Por lo tanto, ReVanced puede servir como referencia conceptual sobre cómo una aplicación nativa controla su propio reproductor, pero no como una biblioteca que se pueda insertar en `index.html`, en el Service Worker o en el iframe oficial.

### NewPipe

La página oficial de [NewPipe](https://newpipe.net/#background) dice que su Background Player permite usar otras aplicaciones, crear playlists y ahorrar datos porque descarga solamente el audio. La misma página identifica al producto como una experiencia para Android y lista YouTube, PeerTube, SoundCloud, Bandcamp y media.ccc.de entre sus servicios.

El código público de [PlayerService.java](https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/PlayerService.java) crea una `MediaSessionCompat`, publica un token de sesión y conecta la sesión con el reproductor mediante `MediaSessionConnector`. Es un servicio Android separado de la actividad visual.

El código de [AudioPlaybackResolver.java](https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/resolver/AudioPlaybackResolver.java) documenta la estrategia: primero busca una lista de `AudioStream`; si el servicio no ofrece audio separado, puede seleccionar un `VideoStream` reproducible como fuente de audio. Después crea una fuente multimedia para el reproductor nativo. Ese flujo es diferente de ocultar el video de un iframe.

### yt-dlp y extractores de streams

La documentación pública de [yt-dlp](https://github.com/yt-dlp/yt-dlp) muestra que un extractor de streams es una pieza de servidor o aplicación con mantenimiento continuo. Para soporte completo de YouTube recomienda `ffmpeg`, `ffprobe`, `yt-dlp-ejs` y un runtime JavaScript como Deno, Node.js, Bun o QuickJS. También debe seguir los cambios de los sitios de origen, firmas, expiración de URLs y formatos.

Montar un proxy extractor detrás de Nowarfy implicaría administrar URLs temporales, rangos HTTP, buffering, CORS, concurrencia, abuso, costos de ancho de banda, cambios frecuentes del extractor, licencias y términos del proveedor. No sería una mejora simple del reproductor y no se recomienda usarlo para convertir automáticamente cada video de YouTube en MP3.

## Por qué una PWA no es igual a una app Android

La documentación de [MDN sobre Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) indica que un Service Worker corre en un contexto worker, no tiene acceso al DOM y actúa principalmente como proxy de red, caché y sincronización. No puede mantener por sí solo un elemento `<audio>` ni reemplazar un servicio multimedia del sistema.

La documentación oficial de [Android Media3 sobre reproducción en segundo plano](https://developer.android.com/media/media3/session/background-playback) indica que una aplicación nativa debe colocar el `Player` y la `MediaSession` dentro de un `Service` separado para continuar cuando la actividad no está en primer plano. Esta es la diferencia estructural que favorece a NewPipe y a clientes Android similares.

La [Media Session API de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) sí permite que una PWA publique título, artista, portada y controles de reproducción en notificaciones, auriculares y pantallas bloqueadas. Pero Media Session solamente controla la fuente que ya está reproduciendo: no transforma un iframe restringido en un stream MP3.

## Qué está implementado en Nowarfy

Nowarfy ya tiene una ruta válida para las fuentes directas. El reproductor usa elementos HTML5 de audio/video, registra metadatos en Media Session, actualiza la posición, guarda la cola y conserva el segundo de reproducción. Las mejoras recientes agregaron handlers tolerantes a capacidades opcionales del navegador, `setPositionState`, actualización de estado `playing/paused`, persistencia en `visibilitychange`, `pagehide` y `freeze`, y preparación `playsinline`.

El resultado esperado es:

| Fuente | Segundo plano |
|---|---|
| MP3 directo con licencia | Compatible en navegadores y sistemas que permitan audio web en segundo plano |
| Video/audio directo con licencia | Posible según navegador y sistema; puede continuar el audio aunque la parte visual quede oculta |
| YouTube mediante iframe | Depende de las políticas de YouTube, del navegador y del sistema; no se puede garantizar como audio-only |
| YouTube con coincidencia legal en Openverse/Jamendo/u otra fuente directa | Se puede ofrecer la fuente directa y mantener la cola, metadatos y posición de forma controlada |

## Recomendación para el proyecto

La opción recomendable es implementar una **resolución de doble fuente legal**. Cada elemento puede conservar su referencia principal de YouTube y, cuando exista, una referencia secundaria de audio directo autorizada. El sistema solo debería cambiar a la referencia secundaria cuando la coincidencia sea suficientemente confiable —mismo artista, título normalizado y fuente con licencia— y debería informar visualmente que está reproduciendo una fuente alternativa.

No conviene afirmar que cada video de YouTube tiene un MP3 equivalente. Una versión encontrada en otra fuente puede tener otra interpretación, otra duración, una licencia distinta o no existir. Si la coincidencia no es clara, se mantiene el iframe oficial y se evita un cambio silencioso.

Tampoco conviene usar un bucle silencioso ni Wake Lock como solución principal. Wake Lock evita que la pantalla se apague, justo lo contrario de lo solicitado, y un bucle silencioso es un hack no confiable que aumenta el consumo y no crea un servicio multimedia real.

## Fuentes

1. [ReVanced — sitio oficial](https://revanced.app/)
2. [ReVanced Patches — GitHub, estado del repositorio](https://github.com/ReVanced/revanced-patches)
3. [NewPipe — Background Player](https://newpipe.net/#background)
4. [NewPipe — PlayerService.java](https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/PlayerService.java)
5. [NewPipe — AudioPlaybackResolver.java](https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/resolver/AudioPlaybackResolver.java)
6. [yt-dlp — GitHub](https://github.com/yt-dlp/yt-dlp)
7. [MDN — Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
8. [MDN — Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
9. [Android Developers — Background playback with MediaSessionService](https://developer.android.com/media/media3/session/background-playback)
10. [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
