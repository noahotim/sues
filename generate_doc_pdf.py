#!/usr/bin/env python3
"""Generate a professional PDF from DOCUMENTATION.md using fpdf2."""

import re
import sys
from pathlib import Path
from fpdf import FPDF

# ── SUES brand colors ──────────────────────────────────────────────
NAVY   = (22, 33, 62)
GOLD   = (218, 165, 32)
WHITE  = (255, 255, 255)
BLACK  = (30, 30, 30)
GRAY   = (120, 120, 120)
LTGRAY = (240, 240, 240)


class SuesPDF(FPDF):
    """Custom PDF with SUES header/footer."""

    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=25)
        # Register fonts (built-in with fpdf2)
        self._section_number = 0
        self._toc_entries = []

    def header(self):
        if self.page_no() == 1:
            return  # cover page has its own header
        # Navy top band
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 12, "F")
        # Gold accent
        self.set_fill_color(*GOLD)
        self.rect(0, 12, 210, 1.5, "F")
        # Title text
        self.set_xy(15, 2)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*WHITE)
        self.cell(0, 8, "SUES Election Management System", align="L")
        self.set_xy(15, 2)
        self.set_font("Helvetica", "", 7)
        self.cell(0, 8, f"Page {self.page_no()}", align="R")
        self.ln(16)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GRAY)
        self.cell(0, 10, "Soroti University Engineering Society  |  Generated from DOCUMENTATION.md", align="C")

    # ── helpers ─────────────────────────────────────────────────────
    def cover_page(self, title: str, subtitle: str):
        self.add_page()
        # Navy background
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 297, "F")
        # Gold accent stripe
        self.set_fill_color(*GOLD)
        self.rect(30, 120, 150, 2, "F")
        # Main title
        self.set_xy(30, 130)
        self.set_font("Helvetica", "B", 28)
        self.set_text_color(*WHITE)
        self.multi_cell(150, 14, title, align="C")
        # Subtitle
        self.set_xy(30, 170)
        self.set_font("Helvetica", "", 14)
        self.set_text_color(*GOLD)
        self.multi_cell(150, 8, subtitle, align="C")
        # Organization
        self.set_xy(30, 200)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*WHITE)
        self.cell(150, 8, "Soroti University Engineering Society", align="C")
        # Date
        self.set_xy(30, 220)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(180, 180, 180)
        from datetime import datetime
        self.cell(150, 8, datetime.now().strftime("%B %Y"), align="C")

    def add_toc(self, entries: list):
        self.add_page()
        self.set_font("Helvetica", "B", 20)
        self.set_text_color(*NAVY)
        self.cell(0, 12, "Table of Contents", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*GOLD)
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(6)
        for i, (num, title) in enumerate(entries):
            self.set_font("Helvetica", "", 11)
            self.set_text_color(*BLACK)
            bg = LTGRAY if i % 2 == 0 else WHITE
            self.set_fill_color(*bg)
            self.cell(0, 8, sanitize(f"  {num}   {title}"), fill=True, new_x="LMARGIN", new_y="NEXT")

    def section_heading(self, number: str, title: str):
        self.ln(4)
        self.set_fill_color(*GOLD)
        self.rect(15, self.get_y(), 4, 10, "F")
        self.set_x(22)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*NAVY)
        self.cell(0, 10, sanitize(f"{number}   {title}"), new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def sub_heading(self, title: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*NAVY)
        self.set_x(15)
        self.cell(0, 8, sanitize(title), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BLACK)
        self.set_x(15)
        self.multi_cell(180, 5.5, sanitize(text))

    def bullet(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BLACK)
        self.set_x(22)
        self.cell(5, 5.5, "-")
        self.multi_cell(168, 5.5, sanitize(text))

    def code_block(self, text: str):
        self.set_fill_color(245, 245, 245)
        self.set_font("Courier", "", 8.5)
        self.set_text_color(40, 40, 40)
        self.set_x(18)
        for line in text.split("\n"):
            self.set_x(18)
            self.cell(174, 4.5, sanitize(line), fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def table(self, headers: list, rows: list):
        col_count = len(headers)
        if col_count == 0:
            return
        avail = 180
        col_w = avail / col_count

        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 9)
        self.set_x(15)
        for h in headers:
            self.cell(col_w, 7, sanitize(h), border=0, fill=True, align="C")
        self.ln()

        self.set_font("Helvetica", "", 9)
        for i, row in enumerate(rows):
            bg = LTGRAY if i % 2 == 0 else WHITE
            self.set_fill_color(*bg)
            self.set_text_color(*BLACK)
            self.set_x(15)
            max_h = 7
            for val in row:
                lines = self.multi_cell(col_w, 5, sanitize(str(val)), split_only=True)
                needed = max(7, len(lines) * 5)
                if needed > max_h:
                    max_h = needed
            self.set_x(15)
            y_start = self.get_y()
            x_pos = 15
            for val in row:
                self.set_xy(x_pos, y_start)
                self.multi_cell(col_w, 5, sanitize(str(val)), fill=True)
                x_pos += col_w
            self.set_y(y_start + max_h)
        self.ln(3)


def sanitize(text: str) -> str:
    """Replace Unicode chars that built-in fonts can't render."""
    replacements = {
        "\u2014": "--",   # em-dash
        "\u2013": "-",    # en-dash
        "\u2018": "'",    # left single quote
        "\u2019": "'",    # right single quote
        "\u201c": '"',    # left double quote
        "\u201d": '"',    # right double quote
        "\u2026": "...",  # ellipsis
        "\u2022": "*",    # bullet
        "\u2192": "->",   # right arrow
        "\u2190": "<-",   # left arrow
        "\u2265": ">=",   # greater-or-equal
        "\u2264": "<=",   # less-or-equal
        "\u00b0": " deg", # degree
        "\u2713": "[x]",  # checkmark
        "\u2717": "[ ]",  # cross
        "\u25b6": ">",    # play/right triangle
        "\u25cf": "o",    # filled circle
        "\u25cb": "o",    # empty circle
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    # Fallback: replace any remaining non-latin-1 chars
    result = []
    for ch in text:
        try:
            ch.encode("latin-1")
            result.append(ch)
        except UnicodeEncodeError:
            result.append("?")
    return "".join(result)


def parse_markdown(md_text: str):
    """Parse the markdown into structured blocks for the PDF."""
    blocks = []
    lines = md_text.split("\n")
    i = 0
    current_para = []
    in_code = False
    code_lines = []
    in_table = False
    table_headers = []
    table_rows = []

    def flush_para():
        nonlocal current_para
        if current_para:
            text = " ".join(current_para).strip()
            if text:
                blocks.append(("para", text))
            current_para = []

    while i < len(lines):
        line = lines[i]

        # Code block
        if line.strip().startswith("```"):
            if in_code:
                blocks.append(("code", "\n".join(code_lines)))
                code_lines = []
                in_code = False
            else:
                flush_para()
                if in_table:
                    blocks.append(("table", table_headers, table_rows))
                    table_headers = []
                    table_rows = []
                    in_table = False
                in_code = True
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        # Table
        if "|" in line and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            # Check if separator row
            if all(re.match(r"^[-:]+$", c) for c in cells):
                i += 1
                continue
            if not in_table:
                flush_para()
                in_table = True
                table_headers = cells
            else:
                table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            blocks.append(("table", table_headers, table_rows))
            table_headers = []
            table_rows = []
            in_table = False

        # Headings
        m_h = re.match(r"^(#{1,4})\s+(.*)", line)
        if m_h:
            flush_para()
            level = len(m_h.group(1))
            blocks.append((f"h{level}", m_h.group(2).strip()))
            i += 1
            continue

        # Bullet
        m_b = re.match(r"^[-*]\s+(.*)", line)
        if m_b:
            flush_para()
            blocks.append(("bullet", m_b.group(1).strip()))
            i += 1
            continue

        # Numbered list
        m_n = re.match(r"^\d+\.\s+(.*)", line)
        if m_n:
            flush_para()
            blocks.append(("bullet", m_n.group(1).strip()))
            i += 1
            continue

        # Blank line
        if not line.strip():
            flush_para()
            i += 1
            continue

        # Regular text
        current_para.append(line.strip())
        i += 1

    flush_para()
    if in_table:
        blocks.append(("table", table_headers, table_rows))

    return blocks


def build_pdf(md_path: str, out_path: str):
    md_text = Path(md_path).read_text(encoding="utf-8")
    blocks = parse_markdown(md_text)

    pdf = SuesPDF()
    pdf.set_margin(15)

    # ── Cover page ──────────────────────────────────────────────────
    pdf.cover_page(
        "Election Management\nSystem",
        "System Documentation"
    )

    # ── Build TOC entries ───────────────────────────────────────────
    toc = []
    sec_num = 0
    for btype, *rest in blocks:
        if btype == "h1":
            sec_num += 1
            toc.append((f"{sec_num}.", rest[0]))

    pdf.add_toc(toc)

    # ── Render all blocks ───────────────────────────────────────────
    pdf.add_page()
    sec_num = 0

    for block in blocks:
        btype = block[0]

        if btype == "h1":
            sec_num += 1
            if pdf.get_y() > 230:
                pdf.add_page()
            pdf.section_heading(str(sec_num), sanitize(block[1]))

        elif btype == "h2":
            if pdf.get_y() > 250:
                pdf.add_page()
            pdf.sub_heading(sanitize(block[1]))

        elif btype == "h3":
            pdf.ln(1)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*NAVY)
            pdf.set_x(15)
            pdf.cell(0, 7, sanitize(block[1]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

        elif btype == "h4":
            pdf.ln(1)
            pdf.set_font("Helvetica", "BI", 10)
            pdf.set_text_color(*NAVY)
            pdf.set_x(15)
            pdf.cell(0, 6, sanitize(block[1]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

        elif btype == "para":
            text = block[1]
            if text.startswith("**") and text.endswith("**") and text.count("**") == 2:
                clean = text.replace("**", "")
                pdf.ln(1)
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(*NAVY)
                pdf.set_x(15)
                pdf.cell(0, 6, sanitize(clean), new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)
            else:
                pdf.body_text(text)
                pdf.ln(1)

        elif btype == "bullet":
            pdf.bullet(block[1])

        elif btype == "code":
            pdf.code_block(block[1])

        elif btype == "table":
            headers = block[1]
            rows = block[2]
            # Check for page break
            if pdf.get_y() > 220:
                pdf.add_page()
            pdf.table(headers, rows)

    # ── Save ────────────────────────────────────────────────────────
    pdf.output(out_path)
    print(f"PDF saved to: {out_path}")
    print(f"Pages: {pdf.pages_count}")


if __name__ == "__main__":
    base = Path(r"C:\Users\GEMTECH 1\Documents\Default Project\sues")
    build_pdf(
        str(base / "DOCUMENTATION.md"),
        str(base / "DOCUMENTATION.pdf")
    )
