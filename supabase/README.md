# Sincronización de preferencias de YouToo

La personalización actual de YouToo funciona íntegramente en el navegador mediante `localStorage`. La base de datos no debe activarse ni recibir actividad hasta que la persona cree una cuenta y elija explícitamente sincronizar entre dispositivos.

## Principio de funcionamiento

El dispositivo sigue siendo la fuente inmediata de actividad. Cuando una sesión autenticada activa la sincronización, el cliente puede enviar eventos de descubrimiento y mantener agregados de interés. La aplicación no debe usar la sincronización para publicitar, perfilar a terceros ni compartir información entre usuarios.

| Elemento | Uso | Retención recomendada |
|---|---|---|
| `youtoo_preferences` | Preferencias de personalización y sincronización por cuenta. | Hasta que la persona borre la cuenta. |
| `youtoo_discovery_events` | Señales de búsqueda, reproducción y apertura de canales/listas. | Aplicar una política de depuración configurable; iniciar con 180 días. |
| `youtoo_interest_topics` | Agregados de bajo volumen para ordenar la portada. | Mientras la sincronización permanezca activada. |

## Reserva futura de candidatos

`002_discovery_reserve.sql` define `youtoo_discovery_candidates` y `youtoo_discovery_queries`. La primera tabla conserva identificadores, URLs, estilo, licencia y estado de candidatos descubiertos; no almacena audio ni video. La segunda conserva el estado de consultas, páginas y bloqueos de cuota. La reserva funciona primero en IndexedDB en cada dispositivo y se replica best-effort mediante el endpoint serverless `/api/reserve`, sin convertir Supabase en una dependencia de reproducción.

Las lecturas y escrituras globales pasan por `/api/reserve`, que usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` únicamente en Vercel. La clave `service_role` nunca llega al HTML ni al navegador. El endpoint admite búsqueda global, upsert por lotes, marcado de uso y exportación CSV con BOM, compatible con Excel. La migración `003_global_reserve_sync.sql` agrega Jamendo al conjunto de fuentes permitido.

## Activación posterior

Para activar la reserva global se agregan a Vercel `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; ambas son variables server-side usadas por `api/reserve.js`, y ninguna se incluye en `index.html`. Primero se ejecuta `002_discovery_reserve.sql` y luego `003_global_reserve_sync.sql` en el SQL Editor. La aplicación conserva IndexedDB como respaldo y no requiere login para la radio pública.

Antes de habilitar la interfaz de sincronización se debe comprobar que las tablas tengan RLS activo y que una persona autenticada solo pueda leer y modificar filas cuyo `user_id` sea su propio `auth.uid()`. Las políticas de la migración se diseñaron con ese criterio.

## Borrado y portabilidad

La interfaz final debe ofrecer tres acciones claras: pausar la personalización local, borrar los datos del dispositivo y desconectar/borrar la copia sincronizada. Cuando se incorpore la cuenta, se agregará también una exportación de preferencias en JSON.

## Referencias

[1] [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

[2] [Supabase: Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data)
