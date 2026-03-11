#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


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

    story.append(Paragraph("Control de autoría (emails remitentes)", styles["H2"]))
    author_rows = [["Email remitente", "Nº artículos"]]
    for k, v in sorted(by_email.items(), key=lambda x: x[1], reverse=True)[:20]:
        author_rows.append([k, str(v)])
    if len(author_rows) == 1:
        author_rows.append(["Sin datos", "0"])
    author_table = Table(author_rows, colWidths=[360, 120])
    style_table(author_table)
    story.append(author_table)
    story.append(Spacer(1, 16))

    story.append(Paragraph("Menciones detectadas (potenciales patrocinadores/entidades)", styles["H2"]))
    mention_rows = [["Entidad", "Nº menciones"]]
    for k, v in sorted(by_entity.items(), key=lambda x: x[1], reverse=True)[:25]:
        mention_rows.append([Paragraph(str(k), styles["Normal"]), str(v)])
    if len(mention_rows) == 1:
        mention_rows.append(["Sin menciones", "0"])
    mention_table = Table(mention_rows, colWidths=[360, 120])
    style_table(mention_table)
    story.append(mention_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Detalle de menciones por artículo", styles["H2"]))
    detail_rows = [["Fecha", "Artículo", "Entidades mencionadas"]]
    for d in mention_by_article[:60]:
        detail_rows.append([
            d.get("fecha", ""),
            Paragraph(str(d.get("titulo", "")), styles["Normal"]),
            Paragraph(", ".join(d.get("entidades", [])), styles["Normal"]),
        ])
    if len(detail_rows) == 1:
        detail_rows.append(["—", "Sin menciones", "—"])
    detail_table = Table(detail_rows, colWidths=[70, 220, 190])
    style_table(detail_table)
    story.append(detail_table)
    story.append(Spacer(1, 16))

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
