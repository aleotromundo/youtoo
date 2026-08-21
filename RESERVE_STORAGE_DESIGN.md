# Diseño de reserva de candidatos para Nowarfy · YouToo

## Objetivo

La aplicación debe conservar resultados descubiertos mientras YouTube y Openverse tienen cuota, de modo que la radio automática pueda seguir reproduciendo candidatos ya conocidos cuando una API responda con error, cuota agotada o límite temporal. La reserva no reemplazará la cola actual: será una fuente adicional de candidatos que alimenta la cola únicamente cuando corresponde.

## Decisión recomendada

La reserva debe implementarse con **IndexedDB** como almacenamiento principal y conservar `localStorage` como fallback mínimo. No conviene guardar cientos o miles de candidatos en una única clave JSON de `localStorage`, porque cada escritura reserializa todo el conjunto y puede alcanzar rápidamente los límites prácticos del navegador.

La cola actual (`nowarfy_queue`, `nowarfy_queue_qid`, `nowarfy_queue_round`) no debe modificarse durante la primera etapa. La reserva tendrá su propio nombre de base de datos y sus propias funciones adaptadoras. Si IndexedDB no está disponible, la aplicación continúa funcionando con la cola y las cachés actuales.

## Base IndexedDB

**Nombre de la base:** `nowarfy_reserve_v1`  
**Object store principal:** `candidates`  
**Clave primaria:** `candidateKey`

La clave debe ser estable y no depender del título, porque dos videos pueden compartir título. La normalización recomendada es:

| Fuente | Clave |
|---|---|
| YouTube | `yt:<videoId>` |
| Openverse | `openverse:<id>`; si el ID no existe, hash o normalización de la URL directa |
| Wikimedia Commons | `commons:<sourceUrl>` |

Cada resultado se inserta con `put`, de modo que volver a descubrirlo actualice sus metadatos sin crear duplicados.

## Registro `candidates`

```js
{
  candidateKey: 'yt:tAGnKpE4NCI',
  source: 'youtube',                 // youtube | openverse | commons
  type: 'yt',                        // yt | mp3 | freevideo
  resourceKind: 'youtube#video',
  sourceId: 'tAGnKpE4NCI',
  url: 'https://www.youtube.com/watch?v=tAGnKpE4NCI',
  playableUrl: 'tAGnKpE4NCI',         // videoId para IFrame o URL de audio directo
  title: 'Metallica - ...',
  artist: 'Metallica',
  description: '...',
  img: 'https://...',
  styleKey: 'heavy metal',
  styleTokens: ['metal', 'heavy metal', 'rock'],
  contexts: ['radio', 'manual'],       // no mezclar automáticamente manual con radio
  discoveredFrom: {
    query: 'Metallica heavy metal official music',
    seedKey: 'yt:seed-id',
    kind: 'search'
  },
  license: '',
  licenseVersion: '',
  sourceUrl: '',
  duration: 245,
  embeddable: true,
  status: 'available',                // available | queued | played | invalid | expired
  useCount: 0,
  discoveredAt: 1787260000000,
  lastSeenAt: 1787260000000,
  lastUsedAt: null,
  expiresAt: 0,
  lastError: null
}
```

### Índices

| Índice | Uso |
|---|---|
| `source` | Separar candidatos YouTube, Openverse y Commons. |
| `styleKey` | Recuperar candidatos del género actual. |
| `status` | Ignorar inválidos y priorizar disponibles. |
| `contexts` | Separar reserva de radio de resultados manuales. |
| `discoveredAt` | Evitar que la reserva se vuelva indefinida. |
| `lastUsedAt` | Aplicar política LRU y no repetir candidatos recientes. |
| `sourceId` | Deduplicar por identificador estable. |

IndexedDB no indexa de forma ideal arrays como `contexts` en todos los navegadores; por eso conviene almacenar además un campo booleano `radioEligible` y usarlo como filtro principal.

## Stores auxiliares

### `queries`

Guarda las búsquedas ya realizadas y su estado de cuota:

```js
{
  queryKey: 'youtube:heavy metal official music',
  source: 'youtube',
  query: 'heavy metal official music',
  styleKey: 'heavy metal',
  lastAttemptAt: 1787260000000,
  lastSuccessAt: 1787260000000,
  nextPageToken: '...',
  pagesConsumed: 1,
  status: 'ok',                    // ok | quota | error
  retryAfter: 1787263600000,
  resultCount: 20
}
```

Este registro evita reintentar repetidamente una consulta que devolvió `429` y permite consumir páginas adicionales solo cuando todavía hay cuota.

### `reserveMeta`

Un registro singleton con versión, tamaño, última limpieza y estado de fuentes:

```js
{
  id: 'global',
  schemaVersion: 1,
  lastCleanupAt: 1787260000000,
  youtubeBlockedUntil: 0,
  openverseBlockedUntil: 0,
  totalCandidates: 420,
  lastMigrationAt: 1787260000000
}
```

## Separación entre búsqueda manual y radio

Esta separación es esencial. Una persona debe poder buscar manualmente un audiolibro, podcast o cualquier otro contenido en Openverse. Esos resultados pueden guardarse como `contexts: ['manual']`, pero no deben entrar automáticamente en la radio.

Cuando una persona selecciona manualmente una pista, esa pista se convierte en la semilla de la radio. Solo desde ese momento se generan candidatos `radioEligible: true` usando el estilo inferido de la canción actual. De este modo, buscar un audiolibro no contamina la reserva de rock, metal o cualquier otro género.

## Flujo de escritura

Cada respuesta exitosa de YouTube u Openverse debe pasar por una función única, por ejemplo `saveDiscoveredCandidates(results, context)`. Esa función debe:

1. Normalizar la fuente y generar `candidateKey`.
2. Normalizar el estilo con `getRadioStyle(seed)` o el género explícito.
3. Marcar `radioEligible` solo si el resultado proviene de una consulta automática musical.
4. Aplicar filtros de radio únicamente en ese contexto.
5. Escribir con `put` y actualizar `lastSeenAt`.
6. No agregar automáticamente el candidato a la cola: la reserva y la cola son conceptos distintos.

La escritura debe ser asíncrona y nunca bloquear `renderGrid`, `selectSong` ni la reproducción.

## Flujo de lectura y prioridad

Cuando `buildAutomaticBatch(seed)` necesita completar una tanda, el orden debe ser:

| Prioridad | Fuente de candidatos |
|---:|---|
| 1 | Resultados frescos del mismo artista en YouTube. |
| 2 | Reserva local del mismo artista y estilo. |
| 3 | Resultados frescos de artistas similares en YouTube. |
| 4 | Reserva local de artistas similares y mismo `styleKey`. |
| 5 | Openverse fresco del mismo estilo. |
| 6 | Reserva Openverse del mismo estilo. |
| 7 | Último respaldo del mismo estilo disponible localmente. |

Cada candidato debe pasar por `isRadioMusicTrack`, `candidateKey` y `queueSeenKeys` antes de transformarse con `withQid` y entrar en la cola.

## Reserva, URLs y reproducción

Para YouTube se debe guardar el `videoId` y la URL canónica del video, pero la reproducción continuará usando el IFrame Player oficial. No se guarda ni se extrae audio de YouTube.

Para Openverse se guarda la URL directa del audio, la URL de origen, el autor y la licencia. El archivo puede dejar de existir o cambiar, por lo que `onerror` debe marcar el candidato como `invalid` y permitir que la cola continúe con el siguiente.

> Guardar una URL permite reutilizar un candidato ya descubierto; no permite descubrir resultados que la API nunca devolvió.

## Límites y limpieza

No conviene guardar millones de registros en el navegador. La primera versión debe tener límites explícitos:

| Límite | Recomendación inicial |
|---|---:|
| Total de candidatos | 1.000 por dispositivo. |
| Por estilo | 150 candidatos radio-aptos. |
| Por consulta | 50 candidatos acumulados. |
| Edad máxima YouTube | 30 días sin volver a verlo. |
| Edad máxima Openverse | 14 días para la reserva automática, alineado con la caché actual. |
| Resultados manuales | 7 días, salvo que estén en favoritos o cola. |
| Limpieza | Al iniciar, después de una escritura grande y cada 24 horas. |

La limpieza debe eliminar primero `invalid`, luego `played` antiguos, después candidatos manuales caducados y finalmente los menos usados por LRU. Nunca debe borrar la canción actual, una canción presente en la cola o un favorito.

## Compatibilidad y migración

La migración debe ser aditiva:

1. Abrir IndexedDB con `onupgradeneeded`.
2. Mantener intactos `nowarfy_queue`, `nowarfy_favs` y las cachés actuales.
3. Migrar `homeVideos`, `homeMusic` y la cola guardada a candidatos solo si tienen URL válida.
4. No migrar audiolibros u otros resultados manuales como `radioEligible`.
5. Si IndexedDB falla, continuar con `localStorage` y limitar el fallback a los candidatos más recientes.
6. No cambiar el formato de los objetos que usa el reproductor en la primera versión.

La futura sincronización Supabase debe ser una segunda etapa. No conviene sincronizar automáticamente toda la reserva, porque las URLs, licencias y disponibilidad cambian y una base por usuario puede crecer demasiado. Si más adelante se sincroniza, deben enviarse solo favoritos, historial resumido y candidatos fijados por el usuario.

## Recomendación final

La reserva debe ser una capa de **memoria de descubrimiento**, no una segunda cola y no una base de archivos multimedia. La implementación más segura es un adaptador pequeño entre las funciones de búsqueda y `buildAutomaticBatch`, con IndexedDB, una caché mínima de respaldo y políticas explícitas de género, deduplicación, caducidad y cuota. Así se preserva la app actual, se mantiene la búsqueda manual abierta y la radio puede seguir reproduciendo candidatos conocidos cuando YouTube o Openverse no permitan nuevas búsquedas.
