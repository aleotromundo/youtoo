# Nowarfy · YouToo

Nowarfy es una aplicación web progresiva de descubrimiento y reproducción audiovisual. La versión activa combina catálogo de YouTube mediante sus APIs oficiales, música libre de Openverse, videos de Wikimedia Commons, reproducción directa de audio, cola persistente, radio automática, favoritos, historial y caché local.

## Estructura actual

| Ruta | Responsabilidad |
|---|---|
| `index.html` | Única entrada activa del frontend y archivo servido por Vercel. Contiene la interfaz, estilos y lógica de aplicación vigente. |
| `api/search.js` | Función serverless para YouTube Data API, Openverse y Wikimedia Commons. |
| `assets/` | Iconos, marca, código QR y recursos visuales. |
| `manifest.webmanifest` | Metadatos de instalación PWA. |
| `sw.js` | Service Worker del shell de la aplicación y estrategia de actualización. |
| `supabase/` | Migración y documentación de la futura sincronización opt-in. |
| `archive/legacy/` | Versiones históricas que no participan del despliegue actual. |
| `ARCHITECTURE.md` | Decisiones y capas de arquitectura. |
| `REPOSITORY_RESEARCH.md` | Investigación de plataformas y fuentes open source. |
| `MEDIACMS_ADOPTION_ASSESSMENT.md` | Evaluación de una eventual biblioteca de media propia. |
| `REPOSITORY_AUDIT.md` | Auditoría funcional y técnica del repositorio. |
| `vercel.json` | Configuración del despliegue. |

## Desarrollo y despliegue

El despliegue actual es estático en Vercel. Las rutas desconocidas se sirven desde `index.html`; las funciones de `/api/` se ejecutan como serverless functions. No se deben editar los archivos de `archive/legacy` para corregir producción: cualquier cambio activo debe realizarse en `index.html`, `api/search.js` o los recursos de soporte correspondientes.

Las búsquedas manuales de YouTube y Openverse permanecen abiertas. La radio automática aplica su propio contexto de género y estilo para priorizar canciones coherentes con la pista actual, conservar la deduplicación y utilizar caché local cuando una fuente externa no responde.

## Historial

Las variantes antiguas del frontend fueron movidas a `archive/legacy/` para conservarlas sin confundirlas con la entrada activa. El historial completo de cambios permanece disponible en Git mediante `git log`.
