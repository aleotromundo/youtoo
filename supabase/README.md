# Sincronización de preferencias de YouToo

La personalización actual de YouToo funciona íntegramente en el navegador mediante `localStorage`. La base de datos no debe activarse ni recibir actividad hasta que la persona cree una cuenta y elija explícitamente sincronizar entre dispositivos.

## Principio de funcionamiento

El dispositivo sigue siendo la fuente inmediata de actividad. Cuando una sesión autenticada activa la sincronización, el cliente puede enviar eventos de descubrimiento y mantener agregados de interés. La aplicación no debe usar la sincronización para publicitar, perfilar a terceros ni compartir información entre usuarios.

| Elemento | Uso | Retención recomendada |
|---|---|---|
| `youtoo_preferences` | Preferencias de personalización y sincronización por cuenta. | Hasta que la persona borre la cuenta. |
| `youtoo_discovery_events` | Señales de búsqueda, reproducción y apertura de canales/listas. | Aplicar una política de depuración configurable; iniciar con 180 días. |
| `youtoo_interest_topics` | Agregados de bajo volumen para ordenar la portada. | Mientras la sincronización permanezca activada. |

## Activación posterior

Se debe crear un proyecto Supabase, habilitar un método de inicio de sesión y ejecutar `001_profile_sync.sql` en el SQL Editor o como migración. Luego se agregan a Vercel solo las variables públicas necesarias para el cliente, por ejemplo `SUPABASE_URL` y una clave publicable. Las claves `service_role` nunca van al HTML, al repositorio ni al navegador.

Antes de habilitar la interfaz de sincronización se debe comprobar que las tablas tengan RLS activo y que una persona autenticada solo pueda leer y modificar filas cuyo `user_id` sea su propio `auth.uid()`. Las políticas de la migración se diseñaron con ese criterio.

## Borrado y portabilidad

La interfaz final debe ofrecer tres acciones claras: pausar la personalización local, borrar los datos del dispositivo y desconectar/borrar la copia sincronizada. Cuando se incorpore la cuenta, se agregará también una exportación de preferencias en JSON.

## Referencias

[1] [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

[2] [Supabase: Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data)
