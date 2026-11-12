# Registro de investigación: visualizador musical de YouToo

## Objetivo

Construir una visualización musical web que responda de forma expresiva, profunda y aparentemente mágica a la música. No alcanza con barras, cambios aleatorios de preset ni pequeñas mutaciones numéricas. El resultado debe tener múltiples variaciones de alta calidad, continuidad visual, golpes musicales reconocibles y escenas que no se repitan.

La referencia conceptual es MilkDrop, pero el objetivo es superarlo dentro de las posibilidades de WebGL2 y Web Audio en navegador.

## Estado actual del proyecto

Repositorio: `https://github.com/aleotromundo/youtoo`

Producción: `https://nowar-rose.vercel.app`

Motor activo actual:

- `modules/milkdrop-engine.js`
- Renderer propio en WebGL2.
- Feedback persistente ping-pong.
- Warp procedural.
- Ruido/FBM.
- Bloom y aberración cromática.
- Audio multibanda: graves, medios, agudos y beat.
- Escenas generativas con semillas.
- Fallback de micrófono cuando YouTube/CORS no permite analizar el audio interno.

Integración:

- `modules/classic.js`
- `styles-classic.css`
- Canvas: `#retroVisualizerCanvas`
- Contenedor fullscreen: `#retroVisualizerShell`

Importante: Butterchurn dejó de ser el renderer activo. Puede quedar como referencia histórica o dependencia de presets, pero la dirección actual es un motor propio.

## Problemas todavía abiertos

1. El análisis musical todavía es básico. Falta beat tracking estable, BPM, compás, transientes, fraseo y detección de secciones.
2. Las escenas actuales son generativas, pero todavía no tienen una gramática visual suficientemente rica.
3. El feedback está limitado a un pipeline principal; faltan capas visuales especializadas.
4. Falta un sistema de variaciones que combine familias visuales completas sin destruir coherencia.
5. Falta una biblioteca de escenas propias de calidad, curadas y clasificadas.
6. El fallback de micrófono reacciona al sonido captado por el ambiente, no a la salida interna de auriculares cerrados.
7. Hay que mantener rendimiento en Android y evitar saturación, parpadeo, pantalla blanca y pérdida de audio.

## Frentes para investigar con otras IAs

### A. MilkDrop y motores derivados

Investigar cómo funcionan realmente:

- Warp shader y composite shader.
- Feedback de doble buffer.
- Blur1/blur2/blur3 y ruido.
- Ecuaciones init, frame, pixel, vertex y point.
- Custom waves y custom shapes.
- Mashups por componente, no solo por parámetros.
- Transiciones, decay, zoom, rotación y simetría.
- Cómo clasificar presets y preservar relaciones entre parámetros.

Preguntas:

- ¿Qué partes de la gramática MilkDrop son esenciales para una escena convincente?
- ¿Cómo hacer mashups seguros entre shaders y ecuaciones incompatibles?
- ¿Cómo convertir un preset en componentes reutilizables?
- ¿Qué APIs internas de Butterchurn serían útiles si se hiciera un fork?

### B. Análisis musical

Investigar Web Audio y análisis musical offline/online:

- FFT y bandas perceptuales.
- RMS, energía, spectral flux, spectral centroid y spectral rolloff.
- Beat tracking y BPM adaptativo.
- Detección de onsets/transientes.
- Fase del beat y compás.
- Detección aproximada de intro, build-up, drop, break y clímax.
- Cómo suavizar sin eliminar los golpes.
- Cómo mapear rasgos musicales a movimiento, color, densidad y cámara.

Preguntas:

- ¿Qué análisis puede hacerse en tiempo real en Android sin consumir demasiado?
- ¿Qué parte conviene precalcular cuando se dispone del archivo completo?
- ¿Cómo se evita que toda la visualización pulse igual en cada beat?
- ¿Cómo hacer que graves, medios, agudos y transientes controlen roles diferentes?

### C. Feedback, fluidos y reacción-difusión

Investigar técnicas WebGL2/WebGPU aplicables en móvil:

- Ping-pong framebuffers.
- Advección y vorticidad.
- Fluids tipo Navier-Stokes simplificados.
- Reacción-difusión.
- Curl noise y campos vectoriales.
- Ray marching 2D/2.5D.
- Distorsión de dominio.
- Bloom multi-pass.
- Tonemapping y control de luminancia.
- Resolución dinámica y escalado por FPS.

Preguntas:

- ¿Qué técnicas producen riqueza visual sin requerir una simulación demasiado pesada?
- ¿Qué combinación de feedback, fluidos y ruido funciona mejor con audio?
- ¿Cuántos pases son razonables en Android?
- ¿Cómo se evita que el feedback se queme o muera?

### D. Partículas y geometría

Investigar:

- Partículas GPU con transform feedback o texturas de estado.
- Campos vectoriales audio-reactivos.
- SDFs, metaballs, blobs, anillos y túneles.
- Instancing de geometría.
- Trails y motion blur.
- Caleidoscopios y simetrías.
- Visuales radiales y no radiales.
- Cuándo usar 2D, 2.5D o 3D.

Preguntas:

- ¿Cómo usar partículas como una capa expresiva sin caer en un visualizador genérico?
- ¿Qué geometrías reaccionan mejor a graves, medios, agudos y voz?
- ¿Cómo combinar partículas con feedback sin ruido visual?

### E. Motores VJ profesionales

Investigar MilkDrop, NestDrop, Resolume, TouchDesigner, Synesthesia, projectM y visualizadores similares:

- Cómo organizan bancos, cues y familias visuales.
- Cómo hacen preview y selección.
- Cómo controlan transiciones.
- Cómo sincronizan cambios por beats o frases.
- Cómo evitan repetición.
- Cómo mezclan capas y decks.
- Qué controles son útiles para una experiencia automática y cuáles son solo para VJ.

Preguntas:

- ¿Qué ideas de workflows profesionales son transferibles a un reproductor web?
- ¿Conviene tener escenas, módulos, decks o solo un director automático?
- ¿Cómo crear un sistema de favoritos y memoria visual sin complicar la interfaz?

### F. Investigación académica y evaluación

Investigar:

- Sistemas de visualización audiovisual expresiva.
- Sincronización de ritmo visual y beat.
- Mapeo de rasgos musicales a parámetros visuales.
- Evaluación de creatividad y sincronía.
- Visualización sinestésica.
- Métricas de calidad perceptual.

Preguntas:

- ¿Cómo medir si una visualización realmente acompaña la música?
- ¿Qué hace que una respuesta parezca intencional y no simplemente reactiva?
- ¿Cómo evaluar variedad sin sacrificar coherencia?

## Arquitectura objetivo a evaluar

### Pipeline de audio

1. Capturar audio interno cuando sea posible.
2. Usar micrófono como fallback explícito cuando la fuente sea YouTube/CORS.
3. Calcular FFT suavizada por bandas perceptuales.
4. Calcular energía, RMS, spectral flux, centroid, rolloff y transientes.
5. Mantener un detector de beat con umbral adaptativo y fase.
6. Estimar BPM y secciones de canción cuando haya suficiente señal.
7. Exponer todos los rasgos al director visual con escalas suavizadas y picos separados.

### Director visual

1. Mantener una escena estable durante un período suficiente.
2. Modificar parámetros continuamente según el audio.
3. Introducir eventos visuales fuertes solo en transientes o cambios de sección.
4. Elegir la siguiente familia visual por compatibilidad de energía, color y movimiento.
5. Usar semillas reproducibles por canción, posición y sección.
6. Mantener memoria de combinaciones recientes y evitar repetición.
7. Evaluar estabilidad y luminancia antes de activar una variante.

### Renderer

1. Feedback ping-pong.
2. Pass de warp/advección.
3. Pass de formas o partículas.
4. Pass de blur/bloom.
5. Pass de color/tonemapping.
6. Composición final con vignette y control de saturación.
7. Calidad adaptativa según FPS, pantalla y dispositivo.

## Criterios de éxito

Una versión se considera buena si:

- Los graves generan expansión, presión o desplazamiento perceptible.
- Los medios modifican formas y estructuras, no solo brillo.
- Los agudos aportan detalle, chispa o textura.
- Los transientes producen eventos visuales claros sin parpadeo.
- El movimiento continúa entre beats y no parece una secuencia de flashes.
- Las escenas cambian de forma progresiva y no se sienten repetidas.
- La luminancia se mantiene controlada.
- La imagen nunca queda en blanco uniforme ni completamente muerta.
- El audio sigue sonando aunque WebGL falle.
- Android mantiene una tasa de frames estable.
- La respuesta se percibe musical incluso con una canción nueva.

## Prompt reutilizable para otras IAs

> Estoy construyendo un visualizador musical web para YouToo con WebGL2 y Web Audio API. Quiero una calidad cercana o superior a MilkDrop: feedback persistente, warp, composite, bloom, fluidos, partículas, múltiples capas, variaciones complejas y respuesta musical expresiva. El proyecto debe funcionar en Android y escritorio, con rendimiento adaptativo.
>
> No quiero una respuesta genérica ni un visualizador de barras. Investigá fuentes primarias, documentación técnica, papers, repositorios y demostraciones. Analizá por separado: (1) arquitectura de renderer GPU, (2) análisis musical, (3) técnicas de fluidos/feedback/reacción-difusión, (4) partículas y geometría, (5) composición de escenas y variaciones anti-repetición, (6) workflows VJ y sincronización por beat/frase, y (7) rendimiento móvil.
>
> Para cada técnica devolvé: mecanismo, por qué mejora la percepción musical, costo aproximado, riesgos visuales, compatibilidad con WebGL2, y cómo integrarla en un renderer existente. Citá URLs concretas. Terminá con una arquitectura recomendada por passes, un pipeline de audio, un sistema de variaciones y un plan de implementación por fases. No propongas cambiar todo a un framework ni uses IA generativa de imágenes/video como sustituto del renderer en tiempo real.

## Prompt para revisar una implementación concreta

> Revisá estos archivos de un visualizador WebGL2 audio-reactivo: `modules/milkdrop-engine.js` y `modules/classic.js`. Buscá errores que impidan que la visualización responda musicalmente: análisis de audio mal conectado, smoothing excesivo, beat detection pobre, uniforms sin efecto, feedback que satura, escenas repetidas, falta de continuidad, shaders demasiado simples, pérdida de audio y problemas de rendimiento móvil.
>
> No reescribas sin justificar. Devolvé un diagnóstico priorizado: bloqueador, impacto visual, evidencia en el código, solución propuesta y costo. Prestá especial atención a que el audio siga sonando si WebGL falla y a que la salida no se vuelva blanca o negra.

## Fuentes ya consultadas

- https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html
- https://github.com/jberg/butterchurn
- https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-write-a-web-based-music-visualizer.html
- https://arxiv.org/abs/2106.10134
- https://www.youtube.com/watch?v=G870Mlik4qY
- https://www.youtube.com/watch?v=uYdNv0JrPbU
- https://dl.acm.org/doi/abs/10.1145/3197517.3201371

## Regla de continuidad

No volver a implementar cambios pequeños basados solo en nombres de presets o multiplicadores aleatorios. Cada mejora importante debe responder a una de estas preguntas:

1. ¿Mejora el análisis musical?
2. ¿Mejora la riqueza del renderer?
3. ¿Mejora la composición y coherencia de variaciones?
4. ¿Mejora la continuidad y evita repetición?
5. ¿Mantiene rendimiento y audio en Android?

Si no responde claramente a una de ellas, probablemente sea un adorno y no una mejora del motor.
