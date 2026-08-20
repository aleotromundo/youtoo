# Investigación de bases open source para YouToo

## Candidatos validados inicialmente

| Proyecto | Enfoque | Arquitectura/capacidades confirmadas | Licencia o advertencia |
|---|---|---|---|
| [Jellyfin](https://github.com/jellyfin/jellyfin) | Biblioteca audiovisual propia y streaming personal | Servidor multimedia en .NET, clientes separados, API y transcodificación con FFmpeg. El repositorio de servidor no incluye el cliente web, que vive en un proyecto distinto. | Muy completo para biblioteca propia, pero es una plataforma de servidor extensa; no es un starter liviano para Vercel. |
| [PeerTube](https://github.com/Chocobozzz/PeerTube) | Plataforma de video propia/federada | Carga, canales, live streaming, player embebible, API REST y arquitectura con ActivityPub/WebRTC. | AGPLv3: exige análisis jurídico antes de integrar o modificar para un producto propio. |
| [Koel](https://github.com/koel/koel) | Música personal tipo Spotify | Laravel + Vue; escaneo de biblioteca, playlists, smart playlists, scrobbling, podcasts, radio e integraciones de metadata. | Muy buen referente de producto musical; se debe revisar qué parte es libre frente a Koel Plus. |

## Hallazgo inicial

Para YouToo no conviene adoptar literalmente un clon Vanced/YouTube Music: muchos dependen de ingeniería inversa, extracción no autorizada o APIs privadas. La investigación seguirá separando plataformas que administran contenido propio o APIs autorizadas de clientes que podrían infringir las condiciones de las fuentes.

## Fuentes iniciales

- https://github.com/jellyfin/jellyfin
- https://github.com/Chocobozzz/PeerTube
- https://github.com/koel/koel
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Candidatos adicionales y descarte de adopción literal

| Proyecto | Aporta | Motivo para no adoptarlo literalmente en YouToo web actual |
|---|---|---|
| [Navidrome](https://github.com/navidrome/navidrome) | Excelente modelo de biblioteca musical por usuario: colecciones grandes, favoritos, contadores, listas, transcodificación y clientes móviles. | Es un servidor musical de colección propia; no resuelve video/canales de YouTube y requiere servidor/Docker. Conviene adoptar sus patrones, no reemplazar el frontend web actual. |
| [Spotube](https://github.com/KRTirtho/spotube) | Arquitectura de fuentes intercambiables, reproducción local y cliente multiplataforma con control nativo de segundo plano. | Es Flutter nativo y su repositorio declara dependencias de Piped, Invidious, yt-dlp y extractores. No es compatible con el requisito de usar únicamente YouTube Data API e IFrame Player API. |
| [MediaCMS](https://github.com/mediacms-io/mediacms) | El candidato más completo para contenido audiovisual propio: usuarios, roles, audio/video, listas, HLS, transcodificación, React, API REST y carga de archivos. | Requiere Django, PostgreSQL, Redis, Celery, FFmpeg y Docker; está bajo AGPLv3. No se puede desplegar como reemplazo directo en el Vercel estático actual. |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | Modelo robusto de biblioteca audiovisual, API y clientes separados. | Servidor .NET + FFmpeg y cliente web separado; no es una plantilla web de sustitución inmediata ni resuelve catálogo YouTube por API. |
| [Koel](https://github.com/koel/koel) | Experiencia web musical moderna, playlists, radio y metadata. | Su alcance abierto no cubre la plataforma de video/canales requerida; el proyecto necesita Laravel/Vue y servidor persistente. |

## Conclusión de compatibilidad

Ningún clon completo investigado puede pegarse directamente sobre el despliegue actual **sin cambiar infraestructura** o sin incorporar mecanismos incompatibles con las políticas de YouTube. La opción técnicamente sólida es una evolución propia: usar la experiencia y separación de capas de los proyectos maduros, conservar el adaptador oficial YouTube/Openverse y, cuando se incorporen archivos propios, elegir entre un backend completo autohospedado como MediaCMS/Jellyfin o un backend de aplicación dedicado.

[1] https://github.com/navidrome/navidrome

[2] https://github.com/KRTirtho/spotube

[3] https://github.com/mediacms-io/mediacms

[4] https://github.com/jellyfin/jellyfin

[5] https://github.com/koel/koel
