# Hallazgos verificables de auditoría — 2026-08-21

## Reproducción local de YouTube

En producción, desde una carga anónima limpia, se pulsó el botón Play sobre `Pantera - 5 Minutes Alone (Official Music Video) [4K Remaster]`. El escenario mostró el iFrame de YouTube con el mensaje visible **“Sign in to confirm you’re not a bot”**. El reproductor no emitió sonido, no avanzó el progreso y quedó en `0:00`.

Este resultado demuestra que el problema no puede atribuirse solamente a Supabase Remote Control. Si el reproductor local de YouTube no obtiene audio en ese navegador, el handoff de YouTube tampoco puede transferir sonido. El estado de metadata y la barra de Nowarfy pueden cambiar aunque el audio real no comience.

## Auth en carga limpia

La configuración pública `/api/auth-config` devolvió URL y anon key presentes. En estado anónimo, el modal mostró el panel de invitado y ocultó el panel de usuario. Al cerrarlo, la UI mostró “Modo anónimo activo en este dispositivo; la cuenta es opcional”. No había sesión Supabase persistida en localStorage ni cookies de Auth.

## Estructura estática

El verificador estático encontró 82 IDs, 266 funciones con nombres únicos, cero referencias `getElementById` a IDs inexistentes y ningún nombre de función duplicado. Esto no demuestra que el comportamiento sea correcto; solo descarta varios errores estructurales básicos.

## Conclusión provisional

La transferencia automática de audio no puede declararse funcional mientras la fuente YouTube quede bloqueada por el embed. Hay que separar en la interfaz y en las pruebas: (1) estado remoto sincronizado, (2) carga de pista en destino y (3) audio realmente audible. Cada uno debe verificarse por separado.

## Audio directo local

Se seleccionó `hard rock intro.wav` desde la sección de audio libre. El elemento HTML5 `audio-element` quedó con `readyState: 4`, `paused: false`, `currentTime: 6.98`, `duration: 21.33` y una URL MP3 real de Freesound. Esto confirma que el reproductor local puede emitir audio directo; el fallo observado en YouTube no representa por sí solo un fallo del elemento de audio HTML5.

## Inicio de radio en estado local limpio

Después de limpiar `localStorage` y `sessionStorage` y recargar producción, la interfaz inició con una Playlist de **41 canciones**, no con una tanda visible de 20. La sección inicial mostró cinco videos de YouTube y cinco audios libres, mientras que la Playlist contenía además numerosos candidatos de la reserva local/global. Esto debe compararse con el requisito de que la radio cargue 20 canciones por tanda; la reserva puede estar funcionando, pero la cantidad inicial no está alineada de forma evidente con esa regla.

## Fallback de YouTube observado

En estado local limpio se seleccionó `Metallica: Nothing Else Matters`. El embed volvió a mostrar `Sign in to confirm you’re not a bot`. Tras esperar el timeout, la Playlist pasó de 1 a 21 elementos y agregó una tanda de 20 relacionadas, pero la pista actual siguió siendo `Metallica: Nothing Else Matters` en `0:00` con el embed bloqueado. Por lo tanto, la lógica de crecimiento de 20 funciona parcialmente, pero el fallback no cambia necesariamente la pista que está bloqueada ni garantiza continuidad audible.

## Flujo de cuenta y modo anónimo

La aplicación desplegada abre en modo anónimo sin iniciar reproducción. El botón `Usar cuenta o continuar anónimo` abre un modal visible con email, contraseña, iniciar sesión, crear cuenta y enlace mágico; no se observó un modal bloqueado en este estado limpio.
