# Diagnóstico de reserva YouTube

Fecha: 2026-08-26

La consulta pública `https://nowarfy.vercel.app/api/reserve?action=stats` devolvió:

- `totalCandidates`: 1686
- `totalQueries`: 110
- En `recent` aparecen registros con `source: "youtube"` y registros con `source: "openverse"`.

Ejemplos confirmados de YouTube: Pantera - Walk, Toxicity, Metallica: Enter Sandman, Avenged Sevenfold - So Far Away, Disturbed - Down With The Sickness, Slipknot - Psychosocial, AIRBAG - NUNCA LO OLVIDES y Para mis amigos.

Conclusión: YouTube sí se está guardando en la reserva global. Si en una vista solo aparecen fuentes libres, esa vista está aplicando un filtro de radio o se está inspeccionando una consulta parcial; no es que el backend esté excluyendo YouTube. La tabla global es `public.youtoo_discovery_candidates`; YouTube usa `source = 'youtube'`, `media_type = 'yt'` y claves `yt:<videoId>`.

El frontend llama a `reserveDiscoveredCandidates(mapped, ...)` desde `fetchYouTubeSearch` para cada página, incluida la paginación mediante `nextPageToken`. Las lecturas con `scope=radio` filtran `radio_eligible=true`; las búsquedas manuales usan `scope=search` y no deben ocultar YouTube por fuente.

## Verificación específica de Eminem

La consulta desplegada `https://nowarfy.vercel.app/api/reserve?action=search&query=eminem&scope=search&limit=50` devolvió candidatos `source: "youtube"`, `type: "yt"`, con claves `yt:-R0eNs3xMGs` y `yt:uaaA3gRLXpo`, entre otros campos reales de video. Por tanto, las URLs de YouTube de Eminem sí están en la reserva global; el resultado no fue exclusivo de fuentes libres.

## Validación del frontend

La versión local carga con el botón de marca `Nowarfy YouToo®` etiquetado como `Reiniciar y actualizar Nowarfy`. La reserva sigue separando las lecturas de radio (`scope=radio`, solo `radio_eligible`) de las búsquedas manuales (`scope=search`, sin ocultar YouTube).
