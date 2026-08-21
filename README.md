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
| `ARCHITECTURE.md` | Decisiones y capas de arquitectura. |
| `vercel.json` | Configuración del despliegue. |

## Desarrollo y despliegue

El despliegue actual es estático en Vercel. Las rutas desconocidas se sirven desde `index.html`; las funciones de `/api/` se ejecutan como serverless functions. Los cambios activos deben realizarse en `index.html`, `api/`, `assets/`, `supabase/` o los archivos de configuración correspondientes.

Las búsquedas manuales de YouTube y Openverse permanecen abiertas. La radio automática aplica su propio contexto de género y estilo para priorizar canciones coherentes con la pista actual, conservar la deduplicación y utilizar caché local cuando una fuente externa no responde.

Jamendo funciona como fuente alternativa opcional para la radio. Debe configurarse `JAMENDO_CLIENT_ID` únicamente como variable de entorno de Vercel; nunca se expone en `index.html`. Cuando está disponible, la radio consulta Jamendo por el estilo actual y guarda sus pistas, portadas, licencias y enlaces de origen en la reserva IndexedDB. Si falta la variable, el endpoint responde de forma controlada y la radio continúa con Openverse, la reserva local y el respaldo existente:

```env
JAMENDO_CLIENT_ID=...
```

## Historial

El historial completo de cambios permanece disponible en Git mediante `git log`; el árbol de trabajo conserva únicamente archivos operativos y documentación de mantenimiento.
