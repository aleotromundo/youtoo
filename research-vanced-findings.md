# Hallazgos iniciales: Vanced/ReVanced/NewPipe

Fecha: 2026-08-26

## Fuentes consultadas

- ReVanced Patches: https://github.com/ReVanced/revanced-patches — GitHub informa que el repositorio público está actualmente deshabilitado por una notificación DMCA. Esto confirma el riesgo de basar una integración comercial en sus parches.
- NewPipe: https://newpipe.net/ — NewPipe se presenta como una aplicación Android ligera y de código abierto. Declara soporte para un Background Player y lista servicios como YouTube, PeerTube, SoundCloud, Bandcamp y media.ccc.de.
- NewPipe GitHub: https://github.com/TeamNewPipe/NewPipe — repositorio de una aplicación Android nativa, no una PWA basada en iframe.
- MDN Media Session API: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API — Media Session expone metadatos y controles de hardware, notificaciones y lockscreen; no convierte una fuente restringida ni sustituye al reproductor.
- web.dev Media Session: https://web.dev/articles/media-session — recomienda registrar cada acción dentro de try/catch, y señala que el navegador puede requerir un gesto del usuario para iniciar media en móviles.
- YouTube IFrame API: https://developers.google.com/youtube/iframe_api_reference — la API permite controlar play, pausa, seek, volumen y estado del iframe; no entrega una URL MP3.

## Interpretación técnica

NewPipe y las aplicaciones derivadas de Vanced/ReVanced no funcionan como una PWA que oculta un iframe. Son aplicaciones nativas Android que controlan un reproductor propio y se integran con los servicios de audio del sistema. Además, los clientes de terceros obtienen o analizan streams de servicios de origen, lo que es una categoría distinta a usar la API oficial de YouTube.

Para Nowarfy YouToo®, sí es viable usar Media Session y elementos HTML5 audio/video para fuentes directas autorizadas, como MP3 de Openverse/Jamendo u otras fuentes con licencia. No es viable ni apropiado extraer automáticamente el audio de cualquier video de YouTube para convertirlo en MP3 o usarlo como sustituto oculto del iframe. Una URL de stream de YouTube, cuando existe, puede ser temporal, estar protegida por firmas y enfrentar CORS, expiración y cambios del proveedor.

El Service Worker no puede mantener vivo un reproductor ni ejecutar audio con la pestaña cerrada: su función aquí debe quedar limitada a cachear el shell de la PWA. Un Wake Lock impediría apagar la pantalla, por lo que no sirve para el objetivo. Un bucle silencioso es un hack no confiable y aumenta consumo; no debe usarse como base del producto.

## Recomendación pendiente

Implementar una estrategia legítima de doble fuente: si un resultado de YouTube tiene una coincidencia exacta o confiable con una fuente MP3 directa autorizada, guardar ambas referencias y ofrecer/cambiar a la fuente directa para segundo plano, conservando título, artista, cola y posición. Si no existe una coincidencia legal, mantener el reproductor oficial de YouTube y explicar el límite del navegador.

## Hallazgo adicional de NewPipe

La sección oficial https://newpipe.net/#background explica que su Background Player permite usar otras aplicaciones, crear playlists y ahorrar datos porque solo descarga el audio. El sitio identifica claramente a NewPipe como una experiencia para Android, y sus fuentes soportadas incluyen YouTube, PeerTube, SoundCloud, Bandcamp y media.ccc.de. Esto confirma que la función depende de una app nativa y de obtener una pista de audio separada; no equivale a esconder el iframe oficial dentro de una PWA.

La ruta https://newpipe.net/FAQ/tutorials/background-playback/ devolvió 404, por lo que no se usó como evidencia.

## Conclusión operativa

La parte que sí podemos copiar conceptualmente es la experiencia: una pista directa de audio, una sesión multimedia del sistema, cola persistente y controles de pantalla bloqueada. La parte que no corresponde copiar a la PWA es la extracción oculta de audio de YouTube o el parcheo de la app oficial.

## ReVanced

La página oficial https://revanced.app/ describe ReVanced como un sistema que aplica parches a aplicaciones móviles y que nació tras la discontinuación de Vanced. Su propuesta es modificar apps Android mediante ReVanced Patcher; no es una API web ni una función que pueda copiarse dentro de un iframe o Service Worker.

El repositorio público de parches consultado en GitHub aparece deshabilitado por una notificación DMCA. Por tanto, incluso para un producto Android propio, habría riesgos de mantenimiento y distribución; para Nowarfy PWA no es una ruta técnica equivalente.

## Código de NewPipe

El archivo público https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/PlayerService.java muestra una clase `PlayerService` Android que crea `MediaSessionCompat`, publica un token de sesión y conecta `MediaSessionConnector` con un reproductor. Es un servicio del sistema, no un `Service Worker`.

El archivo https://github.com/TeamNewPipe/NewPipe/blob/dev/app/src/main/java/org/schabi/newpipe/player/resolver/AudioPlaybackResolver.java documenta la diferencia crítica: intenta elegir un `AudioStream` y, si el servicio no ofrece uno separado, usa un `VideoStream` como fuente de audio para soportar reproducción en segundo plano. La app pasa esa fuente a ExoPlayer/MediaSource. Esto explica por qué NewPipe puede reproducir audio con la pantalla apagada: recibe un stream directo en una app Android nativa y lo entrega a un reproductor del sistema.

No se debe trasladar literalmente a Nowarfy la parte de extracción de YouTube. Sí se puede trasladar la arquitectura segura: resolver primero una fuente directa autorizada, reproducirla con `<audio>` y registrar `Media Session`, cola y posición.

## yt-dlp y un posible backend extractor

La documentación pública de https://github.com/yt-dlp/yt-dlp describe yt-dlp como un descargador/extractor de audio y video. Para soporte completo de YouTube recomienda `ffmpeg`, `ffprobe`, `yt-dlp-ejs` y un runtime JavaScript como Deno, Node.js, Bun o QuickJS. También mantiene una gran superficie de extractores y cambios frecuentes.

Técnicamente, un backend podría resolver una URL y devolver una fuente temporal al navegador, pero eso convertiría a Nowarfy en un servicio de extracción/proxy: habría que manejar expiración, firmas, CORS, rangos HTTP, buffering, concurrencia, costos, abuso, cambios constantes del proveedor y cuestiones de términos/licencias. No es una mejora pequeña del iframe ni una solución adecuada para desplegar como función serverless simple en Vercel.

No se recomienda integrar un extractor de YouTube para convertir automáticamente videos en MP3. La ruta segura es usar fuentes directas con licencia y, si se desea una app nativa tipo NewPipe, estudiar un producto Android separado con revisión legal y técnica propia, no camuflar esa extracción dentro de la PWA.

## Web frente a Android nativo

MDN, en https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API, indica que los Service Workers corren en un contexto worker separado, no tienen acceso al DOM y funcionan como proxy para red, caché y sincronización. No pueden reemplazar al elemento de audio de la página ni convertirse en un servicio de reproducción persistente.

La documentación oficial de Android Media3, https://developer.android.com/media/media3/session/background-playback, indica explícitamente que para background playback hay que colocar el `Player` y la `MediaSession` dentro de un `Service` separado. Ese `Service` permite continuar mientras la app no está en primer plano. Esta es precisamente la capacidad que NewPipe aprovecha y que una PWA no posee de la misma manera.

Conclusión: una PWA puede lograr buena reproducción de audio directo en segundo plano en navegadores compatibles, pero la garantía fuerte de pantalla apagada y proceso independiente requiere una app nativa Android o un wrapper nativo que use un servicio multimedia real.

## Validación de Nowarfy

La versión local de Nowarfy cargó correctamente después de los ajustes. Chromium detectó `navigator.mediaSession` y `setPositionState`; los elementos de audio y video quedaron con `preload="metadata"` y `playsinline`. La consola no mostró errores al inicializar la integración.

La prueba no puede simular físicamente apagar la pantalla del usuario desde este navegador, por lo que la garantía final depende del navegador, sistema operativo, batería y fuente. La validación automatizada confirma la ruta de código y las capacidades expuestas, no una garantía universal de segundo plano para YouTube.
