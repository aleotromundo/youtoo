# Auditoría integral de Nowarfy · YouToo

**Repositorio:** `aleotromundo/youtoo`  
**Rama auditada:** `main`  
**Commit vigente durante la auditoría:** `e42cc3f`  
**Estado:** limpio y sincronizado con `origin/main`  
**Fecha de auditoría:** 21 de agosto de 2026

## Resumen ejecutivo

El repositorio contiene una aplicación web estática/PWA funcional, con un frontend monolítico concentrado en `index.html`, un endpoint serverless en `api/search.js` y una capa de persistencia local basada en `localStorage`. La aplicación ya reúne descubrimiento audiovisual, búsqueda por YouTube, música libre mediante Openverse, videos de Wikimedia Commons, reproducción de YouTube mediante el reproductor oficial, reproducción directa de audio, cola persistente, radio automática, caché local, favoritos, historial, preferencias, PWA, Media Session y una preparación de sincronización opcional con Supabase.

La auditoría encontró **22 archivos** antes de la limpieza, aproximadamente **2,7 MB** de contenido y **10 commits funcionales** desde la creación del repositorio. El archivo activo principal es `index.html`, con aproximadamente 276 KB y más de 4.000 líneas. Las cuatro variantes históricas fueron trasladadas a `archive/legacy/` y quedaron fuera de la entrada activa de Vercel.

> La aplicación no es todavía un sistema de biblioteca multimedia propia al estilo MediaCMS/Jellyfin. Es una experiencia web de descubrimiento y reproducción que consume fuentes externas autorizadas, con almacenamiento local por defecto.

## Inventario de archivos

| Área | Archivos | Estado y función |
|---|---|---|
| Aplicación activa | `index.html` | Frontend principal desplegado por Vercel. Contiene estructura HTML, estilos y toda la lógica JavaScript de la aplicación. |
| Backend | `api/search.js` | Función serverless que centraliza YouTube Data API, Openverse y Wikimedia Commons. |
| Configuración de despliegue | `vercel.json`, `.gitignore` | Vercel sirve la raíz del repositorio y redirige rutas al frontend. |
| PWA | `manifest.webmanifest`, `sw.js` | Instalación, iconos, caché de shell y actualización preferente desde red para navegaciones. |
| Identidad visual | `favicon.ico`, `assets/favicon-32.png`, `assets/nowarfy-apple-touch-icon.png`, `assets/nowarfy-icon-192.png`, `assets/nowarfy-icon-512.png`, `assets/nowarfy-qr.png`, `assets/youtoo-mark-compact.png` | Favicons, iconos, código QR y marca visual. |
| Prototipos o versiones anteriores | `archive/legacy/` | Versiones históricas documentadas; no participan del despliegue actual. |
| Preparación de sincronización | `supabase/001_profile_sync.sql`, `supabase/README.md` | Diseño y migración de Supabase; la aplicación actual todavía funciona con `localStorage`. |
| Documentación | `ARCHITECTURE.md`, `REPOSITORY_RESEARCH.md`, `MEDIACMS_ADOPTION_ASSESSMENT.md` | Decisiones de arquitectura, investigación de alternativas y evaluación de MediaCMS. |

## Funcionalidades implementadas

| Funcionalidad | Estado | Evidencia funcional |
|---|---:|---|
| Portada de descubrimiento | Implementada | Secciones de inicio, contenidos destacados, música para escuchar, listas, canales y recomendaciones. |
| Búsqueda de YouTube | Implementada | Proxy serverless con búsquedas de videos, playlists y canales; también soporta búsquedas por canal y acciones de playlists. |
| Openverse | Implementada | Búsqueda manual abierta y fuente automática de respaldo por estilo. El backend puede consultar sin credenciales obligatorias. |
| Wikimedia Commons | Implementada | Consulta de videos con validación de licencia, formato y metadatos. |
| Reproductor de YouTube | Implementada | Usa YouTube IFrame Player API oficial; no descarga ni extrae audio. |
| Reproductor de audio directo | Implementada | Elementos `<audio>`, precarga y lógica de crossfade para fuentes directas como Openverse. |
| Cola persistente | Implementada | Guarda cola, canción actual, identificadores y ronda en `localStorage`. |
| Radio automática | Implementada | Tandas de 20, deduplicación, prioridad por artista, artistas similares y respaldo por estilo. |
| Precarga inicial | Implementada | La portada intenta iniciar una cola de 20 elementos y completa por red si el catálogo local no alcanza. |
| Recarga continua | Implementada | Solicita nuevas tandas cuando quedan pocas canciones y recupera desde contenido ya cargado si falla la red. |
| Vaciar cola sin detener reproducción | Implementada | El botón conserva la pista actual y elimina únicamente las pistas pendientes. |
| Filtrado contextual de radio | Implementada | Solo la radio automática excluye audiolibros, podcasts, narraciones, capítulos, conferencias, efectos, loops y contenido no musical. |
| Búsqueda manual abierta | Implementada | La búsqueda manual no usa el filtro restrictivo de radio; puede mostrar audiolibros u otros resultados buscados explícitamente. |
| Caché Openverse | Implementada | Guarda pistas válidas por estilo durante 14 días para operar cuando la fuente o la cuota no estén disponibles. |
| Favoritos | Implementada | Persistencia local y acciones de guardar/quitar. |
| Historial y señales de gusto | Implementada | Lectura/escritura de actividad local, recomendaciones y chips de preferencias. |
| Listas, canales y navegación interna | Implementada | Rutas y vistas internas para canales, playlists, videos, música, historial y favoritos. |
| PWA instalable | Implementada | Manifest, iconos, Service Worker y evento de instalación. |
| Media Session | Implementada | Controles de reproducción del sistema, anterior, siguiente, pausa, avance y retroceso cuando el navegador lo soporta. |
| Supabase/Auth | Preparada, no activa | Existe una migración y documentación, pero no hay integración cliente activa ni cuenta obligatoria. |
| Biblioteca de archivos propios | No implementada | No hay carga, almacenamiento, transcodificación, HLS ni administración de media propia. |

## Integraciones externas

### YouTube

El backend usa YouTube Data API mediante `api/search.js` y el frontend usa el reproductor IFrame oficial. Hay soporte para búsqueda, videos, playlists, canales, contenido de playlists, resumen de canales, uploads y validación de videos embebibles. El frontend contiene una marca temporal de bloqueo de cuota para evitar insistir durante la misma sesión cuando YouTube devuelve límites o errores de cuota.

La radio automática utiliza YouTube en primer lugar, pero ahora incorpora el estilo inferido de la canción actual en las búsquedas de mismo artista, artistas similares y respaldo general. La búsqueda manual sigue siendo libre y separada del filtro contextual de radio.

### Openverse

Openverse se consulta desde el backend serverless. Las credenciales son opcionales: si están configuradas, se intenta usar token; si no, se utiliza la consulta pública. El frontend normaliza título, artista, URL, tipo, duración, licencia, versión de licencia y fuente de origen.

Hay dos flujos deliberadamente separados. `searchOpenverse` y `fetchOpenverseTracks` permiten la búsqueda manual abierta. `fetchOpenverseGenreTracks` se usa solo en la radio automática, aplica el estilo inferido de la canción actual, filtra contenido no musical y usa caché local cuando la fuente falla o se agota la cuota.

### Wikimedia Commons

El endpoint `commonsVideo` realiza búsquedas de videos, valida formatos WebM/Ogg, exige licencias permitidas, conserva autoría, URL de fuente, descripción, MIME y duración, y devuelve resultados normalizados para el frontend.

### Supabase

La carpeta `supabase` documenta una futura sincronización opt-in. La arquitectura actual no envía actividad a Supabase automáticamente. El dispositivo es la fuente inmediata y la cuenta solo debería activarse cuando la persona elija sincronizar. La migración prepara perfiles, eventos de descubrimiento y agregados de intereses con RLS, pero falta conectar Auth, cliente, variables públicas y las acciones de borrado/exportación.

## Persistencia local y cachés

| Clave o mecanismo | Uso |
|---|---|
| `nowarfy_favs` | Favoritos. |
| `nowarfy_queue` | Cola completa persistida. |
| `nowarfy_queue_qid` | Identificador de la canción actual. |
| `nowarfy_queue_round` | Estado de la ronda automática. |
| `nowarfy_vol` | Volumen. |
| Preferencias de continuidad y autoplay | Conservan la configuración local de reproducción continua y sugerencias automáticas. |
| `nowarfy_catalog_cache_v1` | Catálogo de portada y contenido descubierto, con caducidad de horas. |
| `nowarfy_openverse_radio_cache_v1` | Pistas Openverse válidas por estilo, con caducidad de 14 días. |
| Estado de Media Session/video | Permite reanudar posición de videos en la sesión guardada. |

## Evolución registrada en Git

| Commit | Cambio |
|---|---|
| `0a357dc` | Creación del repositorio y primera versión desplegable, documentación, backend, PWA, Supabase preparado y variantes históricas. |
| `9bb7fcc` | Pulido visual: aurora dinámica, superficies translúcidas, sombras, profundidad, hover y accesibilidad de movimiento. |
| `ac640a1` | Ajuste del tamaño de lote automático a 20 canciones. |
| `6de13b7` | Tandas únicas con prioridad de mismo artista, similares y deduplicación. |
| `d06e897` | Openverse como respaldo por género. |
| `144927d` | Precarga inicial y recarga forzada al seleccionar canciones. |
| `a6ebcb7` | Openverse público sin credenciales obligatorias; corrección del filtro de miniaturas. |
| `25e5c5f` | Filtros específicos para radio, caché Openverse y exclusión de audiolibros dentro de la radio automática. |
| `9ff0fd9` | Vaciar solo canciones pendientes sin detener la canción actual. |
| `e42cc3f` | Consultas automáticas de YouTube y Openverse guiadas por el estilo de la canción actual. |

## Archivos históricos y deuda de mantenimiento

Los archivos históricos fueron trasladados a `archive/legacy/` y conservan flujos experimentales de Openverse, fallback antiguo y estructuras previas. Al estar separados de la raíz, ya no se confunden con la entrada activa ni con el código de producción.

La recomendación es decidir entre dos opciones: moverlos a una carpeta explícita como `archive/` con un README que indique su función histórica, o eliminarlos después de confirmar que no se usan en enlaces, documentación, historial operativo o despliegues alternativos. No conviene seguir modificándolos como si fueran parte de producción.

El frontend activo concentra HTML, CSS y JavaScript en un único archivo de gran tamaño. Esto facilita el despliegue estático, pero dificulta pruebas, revisión y evolución. La siguiente refactorización razonable sería separar `styles.css`, `app.js`, `queue.js`, `sources/youtube.js`, `sources/openverse.js`, `player.js` y `storage.js`, sin cambiar inicialmente el comportamiento.

## Riesgos y pendientes técnicos

| Prioridad | Tema | Observación |
|---:|---|---|
| Alta | Cuotas y disponibilidad de YouTube | La radio puede continuar con cola y caché, pero una fuente externa nunca garantiza resultados infinitos. Conviene medir y mostrar estado de fuente sin interrumpir. |
| Alta | Calidad de Openverse | Openverse puede devolver riffs, instrumentales o grabaciones etiquetadas como música. Los filtros reducen mezclas, pero no sustituyen una clasificación musical perfecta. |
| Alta | Pruebas automatizadas | No hay suite de tests ni pruebas end-to-end versionadas. La lógica de radio, filtros y persistencia debería tener tests unitarios y una prueba de navegador. |
| Media | Archivo monolítico | `index.html` supera 4.000 líneas y concentra demasiadas responsabilidades. |
| Media | Variantes antiguas | Los HTML históricos deben archivarse o eliminarse para evitar ambigüedad. |
| Media | Supabase | La sincronización está diseñada pero no activada. Debe implementarse con Auth, RLS probado, exportación y borrado antes de presentarla como funcionalidad. |
| Media | Service Worker | La navegación prioriza red, pero recursos no navegacionales usan caché; hay que revisar la estrategia cada vez que cambien assets o el shell. |
| Baja | Documentación de uso | Hay documentación arquitectónica, pero falta un README de desarrollo, variables de entorno, despliegue, pruebas y recuperación. |
| Baja | Observabilidad | No hay métricas de cuota, errores de fuente, latencia, tasa de resultados útiles ni razón de descarte por filtro. |

## Conclusión

Sí: la auditoría revisó el repositorio completo, no solo el archivo principal. Hay una lista clara y verificable de lo que se fue construyendo, registrada tanto en el historial Git como en el código y la documentación. La base actual ya es una aplicación de descubrimiento audiovisual bastante completa para su arquitectura estática. Los próximos pasos de mayor valor no son sumar más fuentes indiscriminadamente, sino **consolidar el código activo, separar el frontend por módulos, agregar pruebas automatizadas y medir la calidad de la radio** para que YouTube, Openverse, caché local y reproducción continua trabajen como una sola experiencia coherente.
