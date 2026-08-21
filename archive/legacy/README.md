# Archivo de versiones históricas

Este directorio conserva versiones anteriores del frontend de Nowarfy · YouToo. Se mantienen por trazabilidad y consulta histórica, pero **no forman parte del despliegue actual**.

| Archivo | Descripción |
|---|---|
| `index-original-variant.html` | Variante original guardada antes de consolidar el frontend activo. |
| `index1.html` | Prototipo temprano con búsqueda híbrida y fallback inicial. |
| `index2.html` | Variante intermedia con flujo experimental de autenticación Openverse. |
| `index3.html` | Variante intermedia con otra evolución del reproductor y búsqueda. |

La entrada de producción es `/index.html`. No se deben corregir errores de producción editando estos archivos. Si una funcionalidad histórica vuelve a ser necesaria, debe migrarse explícitamente al código activo y probarse antes de eliminar o reutilizar la variante archivada.
