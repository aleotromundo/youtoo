# Fallback oficial para videos de YouTube no embebibles

Nowarfy conserva el uso del **YouTube IFrame Player API**. Si YouTube informa un error de reproducción embebida, la aplicación no intenta extraer el stream, alterar la política del video ni forzar una inserción prohibida.

En su lugar, el reproductor muestra una tarjeta dentro del escenario actual con la miniatura, el título y dos acciones. **Ver en YouTube** abre el enlace original en una pestaña nueva. **Abrir flotante** usa `window.open()` desde el clic del usuario con un tamaño compacto de 640 × 390 y un nombre de ventana estable, de forma que los clics sucesivos puedan reutilizar esa ventana cuando el navegador lo permita. La PWA principal permanece abierta con la Playlist y el resto de Nowarfy.

La ventana compacta es una solicitud al navegador, no una garantía de ventana siempre encima. Chrome puede bloquear el popup, abrirlo como pestaña o aplicar sus propias preferencias de ventana. En ese caso Nowarfy informa el bloqueo y mantiene disponible el enlace oficial.

La tarjeta se conserva si se vuelve a renderizar la misma pista, para que no desaparezca antes de que el usuario pueda elegir cómo abrirla. Se limpia al cargar otra pista o cuando un nuevo IFrame informa `onReady`. El error ya no borra la posición ni avanza automáticamente la cola, porque una restricción de inserción no significa que el video haya dejado de existir.

## Referencias

- [YouTube IFrame Player API: Errors](https://developers.google.com/youtube/iframe_api_reference#onError)
- [MDN: Window.open()](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)
