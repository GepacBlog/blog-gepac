#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, CondPageBreak, KeepTogether, PageBreak


def main():
    if len(sys.argv) < 2:
        print("Uso: reporte-mensual-pdf.py <summary.json>")
        sys.exit(1)

    summary_path = Path(sys.argv[1])
    if not summary_path.exists():
        print(f"No existe {summary_path}")
        sys.exit(1)

    data = json.loads(summary_path.read_text(encoding="utf-8"))

    period = data.get("period", "")
    out_pdf = summary_path.with_suffix(".pdf")

    doc = SimpleDocTemplate(
        str(out_pdf), pagesize=A4,
        rightMargin=36, leftMargin=36, topMargin=40, bottomMargin=32
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#5A6273")))
    styles.add(ParagraphStyle(name="H1", parent=styles["Heading1"], fontSize=20, leading=24, textColor=colors.HexColor("#1f2533")))
    styles.add(ParagraphStyle(name="H2", parent=styles["Heading2"], fontSize=13, leading=16, textColor=colors.HexColor("#2d3548")))

    story = []
    story.append(Paragraph(f"Informe mensual de auditoría · Blog GEPAC/AEAL", styles["H1"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"Periodo analizado: <b>{period}</b>", styles["Small"]))
    story.append(Paragraph(f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles["Small"]))
    story.append(Spacer(1, 16))

    total = data.get("total", 0)
    by_editor = data.get("byEditor", {})
    by_email = data.get("byEmail", {})
    by_type = data.get("byType", {})
    by_entity = data.get("byEntity", {})
    mention_details = data.get("mentionDetails", [])
    mention_by_article = data.get("mentionByArticle", [])
    posts = data.get("posts", [])
    kpi = data.get("kpi", {})
    ga4 = data.get("ga4", {})

    summary_text = (
        f"Durante el periodo {period} se registraron <b>{total}</b> publicaciones en el blog. "
        f"La distribución editorial fue de <b>{by_editor.get('GEPAC', 0)}</b> piezas para GEPAC "
        f"y <b>{by_editor.get('AEAL', 0)}</b> para AEAL."
    )
    story.append(Paragraph(summary_text, styles["Normal"]))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Resumen ejecutivo", styles["H2"]))
    summary_table = Table([
        ["Indicador", "Valor"],
        ["Publicaciones totales", str(total)],
        ["GEPAC", str(by_editor.get("GEPAC", 0))],
        ["AEAL", str(by_editor.get("AEAL", 0))],
        ["Menciones farmacéuticas", str(by_type.get("farmaceutica", 0))],
        ["Menciones asociaciones", str(by_type.get("asociacion", 0))],
        ["Menciones entidades", str(by_type.get("entidad", 0))],
    ], colWidths=[300, 180])
    style_table(summary_table)
    story.append(summary_table)
    story.append(Spacer(1, 16))

    story.append(Spacer(1, 16))
    story.append(Paragraph("KPI editoriales (internos)", styles["H2"]))
    kpi_rows = [["KPI", "Valor"],
        ["Publicaciones del mes", str(kpi.get("totalPosts", 0))],
        ["Días activos de publicación", str(kpi.get("daysWithPosts", 0))],
        ["Cadencia media (artículos/semana)", str(kpi.get("postsPerWeek", "0.00"))],
        ["Menciones totales", str(kpi.get("totalMentions", 0))],
        ["Entidades únicas mencionadas", str(kpi.get("uniqueEntities", 0))],
    ]
    if kpi.get("topMentionedTitle"):
        kpi_rows.append(["Artículo con más menciones", Paragraph(f"{kpi.get('topMentionedTitle')} ({kpi.get('topMentionedCount',0)})", styles["Normal"])])
    kpi_table = Table(kpi_rows, colWidths=[260, 220])
    style_table(kpi_table)
    story.append(kpi_table)
    story.append(Spacer(1, 16))

    story.append(Paragraph("KPI de impacto (GA4 · últimos 30 días)", styles["H2"]))
    ga4_rows = [["Indicador", "Valor"],
      ["Sesiones", str(ga4.get("sessions", 0))],
      ["Usuarios", str(ga4.get("users", 0))],
      ["Tiempo interacción acumulado (s)", str(ga4.get("engagementSeconds", 0))],
    ]
    ga4_table = Table(ga4_rows, colWidths=[300, 180])
    style_table(ga4_table)
    story.append(ga4_table)
    story.append(Spacer(1, 16))

    author_rows = [["Email remitente", "Nº artículos"]]
    for k, v in sorted(by_email.items(), key=lambda x: x[1], reverse=True)[:20]:
        author_rows.append([k, str(v)])
    if len(author_rows) == 1:
        author_rows.append(["Sin datos", "0"])

    first_author_table = Table(author_rows[: min(len(author_rows), 8)], colWidths=[360, 120], repeatRows=1)
    style_table(first_author_table)
    story.append(CondPageBreak(190))
    story.append(KeepTogether([
        Paragraph("Control de autoría (emails remitentes)", styles["H2"]),
        Spacer(1, 6),
        first_author_table,
    ]))

    if len(author_rows) > 8:
        rest = author_rows[8:]
        for i in range(0, len(rest), 10):
            chunk = [["Email remitente", "Nº artículos"]] + rest[i:i+10]
            t = Table(chunk, colWidths=[360, 120], repeatRows=1)
            style_table(t)
            story.append(Spacer(1, 8))
            story.append(t)

    story.append(Spacer(1, 16))

    story.append(PageBreak())
    mention_rows = [["Entidad", "Nº menciones"]]
    for k, v in sorted(by_entity.items(), key=lambda x: x[1], reverse=True)[:25]:
        mention_rows.append([Paragraph(str(k), styles["Normal"]), str(v)])
    if len(mention_rows) == 1:
        mention_rows.append(["Sin menciones", "0"])

    # Mantener título + primera tabla juntos (sin título huérfano)
    mention_data = mention_rows[1:]
    first_chunk = mention_data[:12]
    first_table = Table([["Entidad", "Nº menciones"]] + first_chunk, colWidths=[360, 120], repeatRows=1)
    style_table(first_table)
    story.append(CondPageBreak(260))
    story.append(KeepTogether([
        Paragraph("Menciones detectadas (potenciales patrocinadores/entidades)", styles["H2"]),
        Spacer(1, 6),
        first_table,
    ]))

    # Resto de filas (si las hay) en tablas sucesivas
    for i in range(12, len(mention_data), 12):
        chunk = mention_data[i:i+12]
        t = Table([["Entidad", "Nº menciones"]] + chunk, colWidths=[360, 120], repeatRows=1)
        style_table(t)
        story.append(Spacer(1, 8))
        story.append(t)

    story.append(Spacer(1, 12))

    story.append(Paragraph("Detalle de menciones por artículo", styles["H2"]))
    if not mention_by_article:
        detail_rows = [["Fecha", "Artículo", "Entidades mencionadas"], ["—", "Sin menciones", "—"]]
        detail_table = Table(detail_rows, colWidths=[70, 220, 190], repeatRows=1)
        style_table(detail_table)
        story.append(detail_table)
    else:
        chunk_size = 14
        for i in range(0, min(len(mention_by_article), 60), chunk_size):
            chunk = mention_by_article[i:i+chunk_size]
            detail_rows = [["Fecha", "Artículo", "Entidades mencionadas"]]
            for d in chunk:
                detail_rows.append([
                    d.get("fecha", ""),
                    Paragraph(str(d.get("titulo", "")), styles["Normal"]),
                    Paragraph(", ".join(d.get("entidades", [])), styles["Normal"]),
                ])
            detail_table = Table(detail_rows, colWidths=[70, 220, 190], repeatRows=1)
            style_table(detail_table)
            story.append(detail_table)
            if i + chunk_size < min(len(mention_by_article), 60):
                story.append(Spacer(1, 10))
    story.append(Spacer(1, 16))

    story.append(PageBreak())
    story.append(Paragraph("Detalle de artículos del periodo", styles["H2"]))
    post_rows = [["Fecha", "Editorial", "Título"]]
    for p in sorted(posts, key=lambda x: x.get('date',''), reverse=True):
      post_rows.append([
          p.get('date',''),
          p.get('editorial',''),
          Paragraph(str(p.get('title','')), styles["Normal"]),
      ])
    if len(post_rows) == 1:
      post_rows.append(["—", "—", "Sin artículos en el periodo"])
    post_table = Table(post_rows, colWidths=[80, 90, 300])
    style_table(post_table)
    story.append(post_table)

    doc.build(story)
    print(str(out_pdf))


def style_table(table):
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eef2f9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2533')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 1), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d7deea')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fbfcff')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))


if __name__ == "__main__":
    main()
