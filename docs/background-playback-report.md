# Informe Técnico: Reproducción en Segundo Plano y Pantalla Apagada

Este documento detalla la investigación y las implementaciones realizadas en **Nowarfy YouToo®** para gestionar la continuidad del audio cuando la aplicación no está en primer plano o el dispositivo tiene la pantalla apagada.

## 1. El Desafío Técnico de YouTube

La reproducción en segundo plano es una de las restricciones más estrictas de los navegadores modernos y de la plataforma YouTube. Según la documentación oficial de la **IFrame Player API** [1], el reproductor está diseñado para ejecutarse en un contexto visible. 

> "Embedded players must have a viewport that is at least 200px by 200px... a playback only counts toward a video's official view count if it is initiated via a native play button." [1]

En dispositivos móviles (Android e iOS), los navegadores suelen pausar automáticamente cualquier video dentro de un `<iframe>` si la pestaña pierde el foco o la pantalla se apaga para ahorrar batería y cumplir con las políticas de las tiendas de aplicaciones.

## 2. Comparativa de Capacidades por Tipo de Contenido

La aplicación gestiona tres tipos de medios, cada uno con un comportamiento distinto en segundo plano:

| Tipo de Medio | Fuente | Soporte Segundo Plano | Soporte Pantalla Apagada | Técnica Utilizada |
| :--- | :--- | :--- | :--- | :--- |
| **YouTube** | IFrame Oficial | Limitado / Nulo [2] | Nulo | Media Session API (Controles) |
| **Audio Directo** | MP3 (Openverse/Jamendo) | **Total** | **Total** | HTML5 Audio + Media Session |
| **Video Libre** | MP4/WebM Directo | **Alto** | **Alto** | HTML5 Video + Media Session |

## 3. Implementación de Media Session API

Se ha reforzado la integración con la **Media Session API** [3] para que el sistema operativo reconozca a Nowarfy como un reproductor de medios legítimo. Esto permite:

- **Controles en Bloqueo**: Visualización de título, artista y carátula en la pantalla de bloqueo y centro de notificaciones.
- **Hardware Keys**: Uso de botones de auriculares o teclado para pausar, reproducir o cambiar de pista.
- **Continuidad**: Informar al navegador que hay una sesión activa, lo que reduce la probabilidad de que el proceso sea finalizado prematuramente por el sistema.

## 4. Estrategia de Persistencia de Nowarfy

Para ofrecer la mejor experiencia posible sin violar los términos de servicio de las plataformas, Nowarfy utiliza una arquitectura de **"Intento de Continuidad"**:

1. **Memoria de Posición**: Se registra el segundo exacto (`currentTime`) cada 5 segundos. Si el sistema corta la reproducción al apagar la pantalla, al volver a abrir la app, esta sabe exactamente dónde retomar.
2. **Priorización de Audio Directo**: Cuando el usuario busca música, el sistema intenta priorizar o sugerir fuentes de audio directo (MP3) si están disponibles, ya que estas garantizan el funcionamiento con la pantalla apagada.
3. **Respaldo de IFrame**: Para el contenido exclusivo de YouTube, se utiliza el reproductor oficial para garantizar la estabilidad y legalidad, aceptando las limitaciones impuestas por el navegador en segundo plano.

## 5. Recomendaciones para el Usuario

Para mejorar la persistencia en dispositivos móviles, se recomienda:
- **Desactivar el ahorro de batería** para el navegador (Chrome/Safari).
- **Mantener la pestaña abierta** en lugar de minimizarla totalmente si se desea escuchar YouTube.
- **Usar auriculares** con controles físicos para gestionar la cola sin encender la pantalla.

## Referencias

[1] [YouTube Player API Reference for iframe Embeds](https://developers.google.com/youtube/iframe_api_reference)
[2] [You can no longer have YouTube running in the background - Reddit Research](https://www.reddit.com/r/youtube/comments/1qqt8tb/you_can_no_longer_have_youtube_running_in_the/)
[3] [Media Session API - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)

---
*Autor: Manus AI*
*Fecha: 26 de agosto de 2026*
