# Notas de plataforma para reproducción en segundo plano

Fecha de consulta: 26 de agosto de 2026.

## Fuentes

- Chrome Developers, “Automatic picture-in-picture for video conferencing web apps”: https://developer.chrome.com/blog/automatic-picture-in-picture
- Chrome Developers, “Picture-in-Picture for any Element, not just `<video>`”: https://developer.chrome.com/docs/web-platform/document-picture-in-picture
- MDN, “Picture-in-Picture API”: https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API

## Hallazgos relevantes

Chrome documenta el Auto-PiP sin gesto para aplicaciones web que cumplen condiciones específicas. En el caso de videoconferencia, la elegibilidad incluye un handler `enterpictureinpicture`, captura activa de cámara o micrófono mediante `getUserMedia` y el permiso del usuario para picture-in-picture automático. Por lo tanto, una PWA musical no debe asumir que puede abrir PiP automáticamente al apagar la pantalla.

Document Picture-in-Picture requiere una acción del usuario al llamar a `documentPictureInPicture.requestWindow()` y crea una ventana que no sobrevive si se cierra la ventana de origen. El PiP tradicional se aplica a un elemento HTML `<video>`; el video interno de un IFrame de YouTube es de otro origen y no queda disponible para que la PWA le aplique `requestPictureInPicture()` directamente.

La alternativa más sólida para Nowarfy es mantener el IFrame oficial, activar el audio auxiliar desde el gesto inicial, usar Media Session, reciclar el mismo IFrame para las transiciones y consultar estado/posición como respaldo. Ninguna de esas técnicas puede obligar a ChromeOS o YouTube a reproducir si suspenden completamente el proceso o bloquean autoplay. La prueba definitiva de pantalla apagada requiere ejecutarse en el Chromebook real con un video reproducible y una sesión válida.
