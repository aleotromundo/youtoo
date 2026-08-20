# Arquitectura adoptada para la nueva etapa de YouToo

## Decisión

YouToo adopta una **arquitectura modular de cliente audiovisual**, no un fork literal de MediaCMS, Jellyfin, Koel o Spotube. Los cuatro proyectos son buenos referentes, pero una adopción literal rompería el despliegue actual, exigiría infraestructura no disponible o incorporaría dependencias incompatibles con el uso oficial de YouTube.

La nueva base toma los patrones de esos proyectos y organiza el código en cinco capas funcionales.

| Capa | Responsabilidad | Implementación de YouToo |
|---|---|---|
| Adaptadores de fuente | Obtienen catálogo y normalizan datos a un modelo único. | Proxy Vercel para YouTube Data API y Openverse; sin claves en el navegador. |
| Biblioteca | Separa canales, listas, videos y música directa; pagina resultados. | Fichas de canal, contenido de playlists y secciones de inicio. |
| Estado de usuario | Guarda favoritos, cola y señales de descubrimiento. | `localStorage` por defecto; Supabase solo cuando la persona se autentique y active sincronización. |
| Motor de reproducción | Mantiene el ítem actual, cola, controles del sistema y transición entre elementos. | IFrame Player oficial para YouTube y doble `<audio>` para fuentes directas. |
| Experiencia instalable | Conserva la aplicación y controles disponibles cuando el navegador lo permite. | PWA + Media Session; la continuidad depende del sistema operativo y no se promete al cerrar totalmente el proceso. |

## Reglas de adaptador

Cada resultado interno tiene `type`, `resourceKind`, `url`, `channelId`, `duration` y datos de presentación. Las reglas de reproducción se derivan de `type`:

- `yt`: reproducción exclusiva mediante YouTube IFrame Player API; sin extracción, descarga o crossfade.
- `mp3`: reproducción mediante elementos HTMLAudio; permite precarga y crossfade porque es una fuente de audio directa.

## Ruta de implementación inmediata

La primera capa premium conservará el catálogo actual, reforzará el proxy de Openverse, agregará precarga/fundido entre pistas directas y habilitará instalación PWA. La segunda etapa conectará la migración Supabase ya preparada a una cuenta opt-in. El backend completo para cargar y transcodificar archivos propios solo se adoptará después de decidir infraestructura compatible con Docker/FFmpeg y licencia.
