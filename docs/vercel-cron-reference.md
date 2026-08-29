# Referencia operativa de Vercel Cron

Consultado el 26 de agosto de 2026:

- [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs): Vercel puede enviar automáticamente el valor de `CRON_SECRET` como encabezado `Authorization: Bearer ...` al invocar el cron. El endpoint debe comparar ese valor con la variable de entorno.
- [Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): Cron Jobs están disponibles en todos los planes; el plan Hobby tiene un intervalo mínimo de una ejecución diaria y precisión por hora (±59 min). Por eso la limpieza se programa una vez al día con `17 3 * * *`.
- [Getting Started](https://vercel.com/docs/cron-jobs/quickstart): el cron se declara en `vercel.json` y se ejecuta en despliegues de producción, no en previews.

La revisión diaria procesa un lote acotado y no debe considerarse una garantía de horario exacto. Si la reserva crece más rápido que el lote, habrá que aumentar el lote con cuidado o migrar la revisión a un worker dedicado.
