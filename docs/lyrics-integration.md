# Letras verificadas en Nowarfy

## Flujo implementado

Cuando cambia la pista, Nowarfy solo prepara una consulta si el contenido parece una canción individual. Quedan fuera playlists, videos libres, podcasts, entrevistas, audiolibros, tutoriales, reacciones y otros contenidos clasificados como no musicales. La consulta se hace a través de `/api/lyrics`, no desde el navegador directamente, y se guarda localmente durante catorce días con un límite de 80 entradas.

El proxy consulta LRCLIB con título, artista y, cuando está disponible, la duración real de la pista. La respuesta se acepta únicamente si devuelve texto, no marca la pista como instrumental y coincide con el artista y el título normalizados. La duración también debe estar dentro de tres segundos. Si alguna comprobación falla, el botón **Ver letra** permanece oculto; no se muestra texto aproximado ni una tarjeta de relleno.

> La palabra “verificada” en la interfaz significa **coincidencia corroborada por metadatos de la pista y por la ficha de la fuente de letras**. No significa que Nowarfy haya descargado el stream de YouTube, hecho reconocimiento fonético del audio ni comprobado cada palabra contra el sonido.

## Lectura

La letra se inserta mediante `textContent`, nunca como HTML. El panel ocupa la zona de descripción del reproductor, tiene desplazamiento vertical independiente, funciona con rueda, teclado y gesto táctil, y ofrece zoom del 75% al 160% en pasos del 10%. El enlace de atribución apunta a la fuente que devolvió la ficha.

## Fuente y límites

LRCLIB documenta un endpoint público sin clave que recomienda enviar título, artista, álbum y duración para aumentar la precisión. También exige identificar el cliente, respetar sus límites y espaciar las solicitudes [1]. Para un producto que necesite una licencia comercial específica de letras, Musixmatch documenta una API con clave, revisión de integración y planes de licencia [2].

Nowarfy no extrae subtítulos ni streams de YouTube. La API pública de YouTube puede informar si existen captions, pero no habilita por sí sola la descarga de su contenido con una API key pública. Por eso la función no fabrica letras desde el video y deja el botón oculto cuando la fuente no ofrece una coincidencia segura.

## Referencias

[1]: https://lrclib.net/docs "LRCLIB API Documentation"
[2]: https://docs.musixmatch.com/getting-started "Musixmatch API — Getting started"
