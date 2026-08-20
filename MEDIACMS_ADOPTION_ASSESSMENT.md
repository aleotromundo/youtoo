# Evaluación inicial para adoptar MediaCMS como base de YouToo

## Hallazgo principal

MediaCMS es una plataforma audiovisual completa, construida con Django y React, con API REST, roles, listas, búsqueda, flujo de publicación, reproducción de audio y video, subtítulos, HLS y transcodificación. Es una base adecuada para contenido propio y un portal con cuentas de usuario. [1]

| Aspecto | MediaCMS | Consecuencia para YouToo |
|---|---|---|
| Aplicación | Django, React, Django REST Framework | Se puede extender con módulos propios, pero no se ejecuta como HTML estático en Vercel. |
| Persistencia y trabajos | PostgreSQL, Redis, Celery, procesos web y workers | Requiere un entorno persistente con servicios coordinados. |
| Media propia | Subidas reanudables, perfiles de codificación, HLS, subtítulos | Es la capacidad que el sitio actual no tiene y que justifica la adopción. |
| Usuarios | Registro, roles, grupos y flujos público/privado/no listado | Puede reemplazar el perfil local cuando se active autenticación. |
| Personalización | Configuración de logo, portal, interfaz y páginas | Permite incorporar la identidad YouToo y sus controles distintivos. |

## Requisitos no negociables

La instalación recomendada por el proyecto usa Docker Compose y servicios de aplicación, base de datos, Redis y workers Celery. La documentación también indica que el escalado divide procesos web y workers, y que la transcodificación consume capacidad de cómputo y almacenamiento. [1]

Para adoptar MediaCMS sin perder las funciones actuales se deben desarrollar extensiones separadas: un adaptador para catálogo permitido de YouTube, un adaptador de Openverse, un reproductor flotante de YouToo, la cola persistente, Media Session y la personalización local/opt-in. No se deben descargar ni separar audio de YouTube; esa fuente continúa mediante su IFrame Player oficial.

## Licencia

MediaCMS está publicado bajo **AGPLv3**. La licencia exige conservar avisos y, cuando se presta una versión modificada por red, poner a disposición el código fuente correspondiente de esa versión. Esto requiere que la futura instancia de YouToo publique un enlace claro a su código fuente y se mantenga bajo la licencia aplicable. Esta es una consideración de implementación y producto que debe validarse jurídicamente antes de una explotación comercial cerrada. [2]

## Rutas técnicas posibles

| Alternativa | Ventaja | Límite |
|---|---|---|
| Mantener YouToo actual y conectar módulos propios | Conserva Vercel y APIs existentes; menor cambio inicial. | No obtiene de inmediato la administración completa de archivos y transcodificación de MediaCMS. |
| Adoptar MediaCMS en una instancia separada y migrar progresivamente | Obtiene biblioteca propia, roles, administración y HLS desde el comienzo. | Requiere un host con Docker, almacenamiento persistente y cumplimiento AGPL. |

## Conclusión provisional

La adopción es viable y tiene sentido si el objetivo incluye alojar y administrar media propia. No es un reemplazo directo del sitio Vercel: debe iniciarse en un entorno aislado, mantener YouToo actual como referencia funcional y añadir las integraciones externas mediante adaptadores explícitos.

## Referencias

[1] [MediaCMS — repositorio y documentación de administración](https://github.com/mediacms-io/mediacms)

[2] [MediaCMS — licencia AGPLv3](https://github.com/mediacms-io/mediacms/blob/main/LICENSE.txt)

## Verificación del origen de videos en la demo

La inspección del repositorio confirma que MediaCMS se centra en la **carga de archivos propios**. Sus flujos documentados incluyen subida reanudable, almacenamiento de archivos originales, codificación de múltiples resoluciones, publicación y generación de URLs o códigos de inserción para publicar ese contenido desde MediaCMS hacia otros sitios. No se encontró un conector nativo de catálogo para YouTube, Vimeo, Openverse, Pexels o Pixabay dentro de la base revisada. [3]

Por tanto, los videos de la demo son contenido alojado o administrado por su propia instancia; no provienen automáticamente de una API gratuita de terceros. Para YouToo, los catálogos externos deberán ser adaptadores añadidos por nosotros y no una configuración que MediaCMS traiga activada.

[3] [MediaCMS — documentación de usuario y desarrolladores](https://github.com/mediacms-io/mediacms/tree/main/docs)

## Fuentes externas que pueden complementar la biblioteca propia

| Fuente | Tipo de contenido | Acceso | Requisito de integración | Prioridad |
|---|---|---|---|---|
| YouTube Data API + IFrame Player | Canales, playlists y video musical | Cuota de proyecto y reproductor oficial | No extraer ni separar audio; aplicar filtros de embebibilidad y cuota. | Ya integrada |
| Openverse | Audio libre | OAuth ya configurado | Normalizar licencia, autor y enlace de origen; audio directo permite crossfade. | Ya integrada |
| Pexels | Video de stock | API key gratuita | Enlace destacado a Pexels en resultados, atribución cuando sea posible y respeto de límites/condiciones de API. [4] | Alta |
| Pixabay | Video y audio de stock | API key gratuita | Mostrar fuente, cachear al menos 24 h, no hacer consultas automatizadas masivas ni redistribuir material como catálogo independiente. [5] | Alta |
| Wikimedia Commons | Video, audio e imágenes libres | API pública | Capturar autor, licencia, URL de la ficha y posibles obligaciones de atribución/ShareAlike por archivo. [6] | Alta |
| Internet Archive | Colecciones históricas de audio y video | APIs de metadatos y búsqueda | Filtrar por derechos de cada registro antes de mostrar/importar; no asumir que todo el archivo es dominio público. [7] | Media |
| NASA | Video, audio e imágenes científicas | Biblioteca/API pública | Atribuir NASA, evitar apariencia de aval, y revisar elementos de terceros, marcas o personas identificables. [8] | Media, temática |
| PeerTube | Video federado | REST por instancia / búsqueda global configurable | Tratar cada instancia como fuente independiente y validar disponibilidad/licencia de los resultados. [9] | Experimental |

La fuente adecuada depende del papel dentro del producto. Pexels y Pixabay son mejores para clips de ambientación; Wikimedia, Internet Archive y NASA para colección cultural, histórica o científica; YouTube sigue siendo la fuente de descubrimiento musical y de canales; MediaCMS es el repositorio bajo control de YouToo para contenido propio.

[4] [Pexels API documentation](https://www.pexels.com/api/documentation/)

[5] [Pixabay API documentation](https://pixabay.com/api/docs/)

[6] [Wikimedia Commons API and reuse policy](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)

[7] [Internet Archive tools and APIs](https://archive.org/developers/index-apis.html)

[8] [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)

[9] [PeerTube REST API quick start](https://docs.joinpeertube.org/api/rest-getting-started)

## Experiencia nativa de YouToo y reglas de YouTube

La intención de evitar botones de salida es viable para navegación: los perfiles, listas, metadatos y la reproducción pueden presentarse dentro de YouToo. Sin embargo, la integración debe conservar las condiciones del reproductor oficial. Las políticas de YouTube prohíben alterar el contenido de resultados de búsqueda, requieren identificar las acciones relacionadas con recursos de YouTube y exigen transparencia y política de privacidad para clientes que usen sus servicios. [10]

El reproductor IFrame debe mantener un área mínima de 200 × 200 píxeles y no puede tener marcos, capas superpuestas u otros elementos que oculten una parte del reproductor o sus controles. El diseño premium puede envolver el escenario visual, pero la capa del reproductor debe permanecer visible y sin obstrucción. [11]

| Regla de fuente | Diseño nativo permitido en YouToo | Límite que se debe mantener |
|---|---|---|
| YouTube | Perfil, listas, detalles y escenario dentro de la interfaz; reproducción embebida. | Sin descarga/extracción de audio, sin overlays sobre el reproductor y sin modificar resultados como si fueran propios. |
| Audio directo | Reproductor flotante, cola, Media Session, precarga y crossfade. | Mantener autor, licencia y fuente cuando correspondan. |
| Media propia en MediaCMS | Reproductor YouToo total, HLS, transcodificación, subtítulos y controles propios. | Aplicar licencias y permisos de cada archivo subido. |

[10] [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)

[11] [YouTube API Services Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
