#!/usr/bin/env python3
"""Genera docs/informe-implementacion-pagopar.pdf desde el Markdown del informe."""
from __future__ import annotations

import re
from pathlib import Path

import os

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "informe-implementacion-pagopar.md"
OUT = ROOT / "docs" / "informe-implementacion-pagopar.pdf"

# Fuentes core Helvetica no cubren en-dash ni todas las tildes; usamos Arial/DejaVu del sistema.
def _unicode_font_paths() -> tuple[Path, Path | None] | None:
    windir = os.environ.get("WINDIR")
    if windir:
        reg = Path(windir) / "Fonts" / "arial.ttf"
        bold = Path(windir) / "Fonts" / "arialbd.ttf"
        if reg.is_file():
            return (reg, bold if bold.is_file() else None)
    a = Path("/Library/Fonts/Arial.ttf")
    b = Path("/Library/Fonts/Arial Bold.ttf")
    if a.is_file():
        return (a, b if b.is_file() else None)
    d = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    db = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    if d.is_file():
        return (d, db if db.is_file() else None)
    return None


def strip_md_inline(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    return s


def is_table_separator(line: str) -> bool:
    s = line.strip()
    if not s.startswith("|"):
        return False
    return bool(re.match(r"^\|?[\s\-:|]+\|?$", s))


class InformePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("TxUnicode", "", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, f"Página {self.page_no()}", align="C")


def main() -> None:
    raw = SRC.read_text(encoding="utf-8")
    fonts = _unicode_font_paths()
    if not fonts:
        raise SystemExit(
            "No se encontró Arial/DejaVu para PDF Unicode. Instalá fuentes o editá scripts/generate-informe-pagopar-pdf.py."
        )
    font_path, font_bold_path = fonts

    pdf = InformePDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_font("TxUnicode", "", str(font_path))
    pdf.add_font("TxUnicode", "B", str(font_bold_path or font_path))
    pdf.set_font("TxUnicode", "", 11)
    pdf.add_page()
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)
    usable_w = pdf.w - pdf.l_margin - pdf.r_margin

    for raw_line in raw.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            pdf.ln(3)
            continue

        line_disp = strip_md_inline(line)

        if line_disp.strip() == "---":
            y = pdf.get_y()
            pdf.set_draw_color(190, 190, 190)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(5)
            continue

        if line_disp.startswith("# "):
            pdf.set_font("TxUnicode", "B", 17)
            pdf.set_text_color(20, 20, 90)
            pdf.multi_cell(usable_w, 9, line_disp[2:].strip())
            pdf.set_font("TxUnicode", "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(2)
            continue

        if line_disp.startswith("## "):
            pdf.set_font("TxUnicode", "B", 13)
            pdf.set_text_color(35, 35, 120)
            pdf.multi_cell(usable_w, 8, line_disp[3:].strip())
            pdf.set_font("TxUnicode", "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(2)
            continue

        if line_disp.startswith("### "):
            pdf.set_font("TxUnicode", "B", 11.5)
            pdf.set_text_color(45, 45, 45)
            pdf.multi_cell(usable_w, 7, line_disp[4:].strip())
            pdf.set_font("TxUnicode", "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(1)
            continue

        if line_disp.startswith("|") and "|" in line_disp[1:]:
            if is_table_separator(line_disp):
                continue
            pdf.set_font("TxUnicode", "", 9)
            pdf.multi_cell(usable_w, 5, "  ".join(p.strip() for p in line_disp.split("|") if p.strip()))
            pdf.set_font("TxUnicode", "", 11)
            continue

        if line_disp.startswith("- "):
            pdf.set_x(pdf.l_margin + 3)
            pdf.multi_cell(usable_w - 3, 6, "\u2022 " + line_disp[2:].strip())
            continue

        if re.match(r"^\d+\.\s", line_disp):
            pdf.multi_cell(usable_w, 6, line_disp)
            continue

        if line_disp.startswith("*") and line_disp.endswith("*") and line_disp.count("*") == 2:
            pdf.set_font("TxUnicode", "", 10)
            pdf.set_text_color(80, 80, 80)
            pdf.multi_cell(usable_w, 6, line_disp.strip("*").strip())
            pdf.set_text_color(30, 30, 30)
            pdf.set_font("TxUnicode", "", 11)
            continue

        pdf.multi_cell(usable_w, 6, line_disp)

    pdf.output(OUT)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    main()
