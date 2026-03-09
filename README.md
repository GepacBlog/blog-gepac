# Blog Editorial GEPAC / AEAL

## Abrir
- Abre `blog/index.html` en el navegador.

## Estructura
- `data/posts.json`: listado de noticias (titular, resumen, foto, fecha, editorial, URL).
- `historicos/AÑO/MM-mes/gepac/`: noticias de Editorial GEPAC.
- `historicos/AÑO/MM-mes/aeal/`: noticias de Editorial AEAL.
  - Ejemplo: `historicos/2026/03-marzo/gepac/`

## Alta de noticias (crea histórico automáticamente)
Desde la carpeta `blog`:

```bash
node tools/add-article.mjs GEPAC 2026-03-07 "Título de la noticia" "Resumen corto" "https://...jpg"
```

Esto:
1. crea un archivo con formato: `NNN_YYYY-MM-DD_nombre-de-la-noticia.html`
2. ruta ejemplo: `historicos/2026/03-marzo/gepac/001_2026-03-07_titulo-de-la-noticia.html`
3. añade la noticia a `data/posts.json`

En portada solo salen noticias de los últimos 30 días y cada una abre en la misma pestaña.

También hay una pestaña `historico.html` ("Leer antiguas") donde se muestran las noticias anteriores al último mes dentro del año en curso.

También hay una pestaña `metricas.html` con resumen básico:
- Total publicaciones del año
- Totales por editorial (GEPAC/AEAL)
- Tabla mensual

## Publicación automática por Gmail
Script: `tools/publish-from-gmail.mjs`

Formato recomendado del correo:
- Asunto (admite mayúsculas/minúsculas):
  - `[GEPAC] Título de la noticia`
  - `GEPAC: Título de la noticia`
  - `Gepac - Título de la noticia`
  - `aeal Título de la noticia`
- Cuerpo (texto plano):
  - `Fecha: YYYY-MM-DD` (opcional)
  - `Autor: Nombre` (opcional)
  - `Resumen: ...` (opcional)
  - `Cuerpo: ...` (recomendado)
- Adjuntar imágenes (jpg/png/webp):
  - `01...` = imagen principal (tarjeta + cabecera de la noticia)
  - `02...` = imagen secundaria (al final de la noticia)

Ejecución manual desde `blog/`:

```bash
node tools/publish-from-gmail.mjs
```

## Control de autoría (Excel)
Se genera automáticamente `data/control_autoria.csv` con columnas:
- fecha
- hora
- editor (GEPAC/AEAL)
- email_remitente (del correo)
- autor_detectado
- titulo
- thread_id

Puedes abrir ese `.csv` directamente con Excel.

## Control de menciones (auditoría patrocinadores)
Se genera `data/control_menciones.csv` con detecciones por artículo:
- fecha, hora, editor, título, thread_id
- tipo (farmaceutica/asociacion/entidad)
- entidad detectada

## Informe mensual automático
Script: `tools/reporte-mensual.mjs`

Genera en `reports/`:
- `informe-YYYY-MM.md`
- `informe-YYYY-MM.csv`

Cron activo: **día 1 de cada mes, 09:00 (Europe/Madrid)** con envío de resumen por Telegram.

## Backup automático
Script de backup: `tools/backup-blog.sh`

- Guarda `.tar.gz` en `~/Desktop/iA/backups/blog/`
- Mantiene los 30 backups más recientes
- Cron diario activo: **02:30 Europe/Madrid**

El script:
1. lee correos `in:important is:unread` de `agentekrok@gmail.com`
2. filtra asuntos con `[GEPAC]` o `[AEAL]`
3. crea noticia en `historicos/AÑO/MM-mes/editorial/`
4. actualiza `data/posts.json` y `data/posts.js`
5. marca el hilo como leído y quita etiqueta IMPORTANT
