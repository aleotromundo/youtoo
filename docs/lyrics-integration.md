# Letras verificadas en Nowarfy

## Flujo implementado

Cuando cambia la pista, Nowarfy prepara una consulta únicamente si el contenido parece una canción individual. Quedan fuera playlists, videos libres, podcasts, entrevistas, audiolibros, tutoriales, reacciones y otros contenidos clasificados como no musicales. La consulta se hace a través de `/api/lyrics`, no directamente desde el navegador hacia LRCLIB, y una coincidencia positiva se guarda localmente durante catorce días con un límite de 80 entradas.

El frontend limpia los metadatos más frecuentes de YouTube antes de consultar: separa un prefijo `Artista - Tema` solamente cuando coincide con el canal, quita calificadores como `Official Music Video` y normaliza sufijos `VEVO`, `- Topic`, `Official` y nombres equivalentes. El proxy vuelve a derivar candidatos acotados en el servidor para que la validación no dependa de que el navegador haya interpretado correctamente un título de exhibición.

## Resolución y verificación

El proxy intenta primero un número limitado de consultas estructuradas a LRCLIB `/api/get`, usando las variantes más fuertes de título y artista. Si esas consultas devuelven 404 o no producen una coincidencia válida, usa como máximo dos consultas a LRCLIB `/api/search` y puntúa los resultados devueltos. La puntuación combina coincidencia de artista, título, versión y duración; se exige un umbral alto para los campos principales y se rechazan empates entre pistas lógicamente distintas.

La duración se compara cuando está disponible en el video y en la ficha de LRCLIB. Una diferencia de hasta tres segundos se considera exacta a efectos de la interfaz. Se permite una diferencia acotada de hasta doce segundos solamente cuando artista y título tienen una coincidencia fuerte, para cubrir introducciones, outros o pequeñas diferencias entre un video y su grabación de catálogo. Si no existe duración confiable, la letra puede aceptarse únicamente con coincidencias sólidas de artista y título. Una diferencia mayor, un resultado instrumental, ausencia de texto, un artista genérico o una selección ambigua producen `found:false`; en esos casos el botón **Ver letra** permanece oculto.

> La palabra “verificada” en la interfaz significa **coincidencia corroborada por los metadatos disponibles de la pista y por la ficha de la fuente de letras**. No significa que Nowarfy haya descargado el stream de YouTube, hecho reconocimiento fonético del audio ni comprobado cada palabra contra el sonido.

La respuesta incluye el método de coincidencia, la confianza, la diferencia de duración y la consulta normalizada para facilitar el diagnóstico. Esos datos no autorizan a mostrar una ficha que no haya superado el umbral; son metadatos de auditoría del resultado ya aceptado.

## Lectura y seguridad

La letra se inserta mediante `textContent`, nunca como HTML. El panel ocupa la zona de descripción del reproductor, tiene desplazamiento vertical independiente, funciona con rueda, teclado y gesto táctil, y ofrece zoom del 75% al 160% en pasos del 10%. El enlace de atribución apunta a la fuente que devolvió la ficha.

Nowarfy no extrae subtítulos ni streams de YouTube. La API pública de YouTube puede informar si existen captions, pero no habilita por sí sola la descarga de su contenido con una API key pública. Por eso la función no fabrica letras desde el video y mantiene el botón oculto cuando LRCLIB no ofrece una coincidencia de alta confianza. Que una canción no tenga botón no prueba que no existan letras en otra fuente: significa que la fuente disponible no pudo corroborar esa pista sin riesgo suficiente.

## Fuente y límites

LRCLIB documenta un endpoint público sin clave que recomienda enviar título, artista, álbum y duración para aumentar la precisión. También exige identificar el cliente, respetar sus límites y espaciar las solicitudes [1]. Para un producto que necesite una licencia comercial específica de letras, Musixmatch documenta una API con clave, revisión de integración y planes de licencia [2].

El fallback de búsqueda está deliberadamente limitado para no convertir cada cambio de canción en una ráfaga de solicitudes. Las respuestas 429 se devuelven con `Retry-After` y no se reintentan en cascada. El frontend no guarda resultados negativos como si fueran definitivos, de modo que una futura carga pueda volver a intentar una canción cuya fuente estaba temporalmente vacía.

## Referencias

[1]: https://lrclib.net/docs "LRCLIB API Documentation"
[2]: https://docs.musixmatch.com/getting-started "Musixmatch API — Getting started"
