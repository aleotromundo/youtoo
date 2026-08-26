
## Validación local

La vista `Listas` se abrió en modo anónimo sin errores de JavaScript. En el servidor local sin variables de Supabase se mostró correctamente el estado vacío; en el deployment configurado la misma vista consulta el total global de listas y permite cargar más páginas. La consola del navegador no registró errores después de la navegación.

La prueba visual en modo anónimo mostró el enlace de auditoría y no mostró el interruptor de "Solo mis descubrimientos", como corresponde. Al abrir el panel contra el servidor local sin `/api/reserve` configurado, se presentó el estado de servicio no disponible; esto es esperado fuera de Vercel/Supabase y no generó errores de JavaScript.

## Prueba del alcance del catálogo

Se simuló una respuesta global en modo anónimo: el panel mostró el total de recursos, videos, listas y canales; la nota indicó que se trata del catálogo recuperado por todas las sesiones y no apareció el interruptor privado.

Se simuló una sesión registrada con el identificador `user-123`: el panel inició en vista global y, al activar "Solo mis descubrimientos", reinició la paginación incluyendo `discoveredBy=user-123`. El estado visual pasó a "Solo tus descubrimientos" y el interruptor permaneció activo.

## Prueba de listas globales

Con una respuesta simulada de dos listas, la sección renderizó `Listas de reproducción globales · 2 recuperadas` y la leyenda `Catálogo compartido · se alimenta con cada búsqueda e interacción`. La página mostró la lista recuperada y no mostró el botón de más cuando la primera página ya alcanzó el total informado.

Nota de prueba: una primera simulación del respaldo local se ejecutó en una pestaña abierta antes de las últimas ediciones; el diagnóstico devolvió `reserveGetLocalCandidates is not defined`, confirmando que la pestaña estaba usando el bundle inline anterior. La validación final del respaldo se repetirá tras una recarga limpia, sin atribuir ese resultado al código actualizado.

Tras recargar la pestaña con el código actualizado, la prueba offline encontró una lista en `localStorage`, la renderizó en el catálogo global de listas y marcó la paginación como completa (`localItems=1`, `count=1`, `done=true`). Así queda verificado el respaldo local para esta sección.

## Prueba de canales globales

Con datos simulados, la sección de canales mostró `Canales globales · 1 recuperados` y la leyenda de catálogo compartido. La sección de listas mostró `Listas de reproducción globales · 2 recuperadas`; ambas quedaron sin botón adicional porque el total informado ya estaba completo.

