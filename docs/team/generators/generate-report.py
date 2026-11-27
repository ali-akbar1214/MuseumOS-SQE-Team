from pathlib import Path
import re
import textwrap
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, ListFlowable, ListItem,
    PageBreak, PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'docs' / 'team' / 'reporting' / 'completion-report.md'
LOGO_PATH = ROOT / 'docs' / 'team' / 'assets' / 'fast-nuces-logo.png'
OUTPUT_PDF = ROOT.parent / 'Deliverables' / 'Project_24I-3030_24I-3079_24I-3114_C.pdf'

# Cover page constants matching the FAST NUCES academic template
UNIVERSITY = 'FAST NUCES ISLAMABAD'
COURSE = 'Software Quality Engineering (SE3002)'
PROJECT_TITLE = 'Final Project: Automated Testing of MuseumOS'
SUBTITLE = 'Fall 2026'
INSTRUCTOR = ''  # Optional: e.g. 'Instructor: ...'

BLACK = colors.black
CODE_BG = colors.HexColor('#f4f5f7')
CODE_BORDER = colors.HexColor('#dcdfe4')
TABLE_HEAD_BG = colors.HexColor('#efefef')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name='CoverUni', parent=styles['Title'],
    fontName='Times-Bold', fontSize=18, leading=22,
    textColor=BLACK, alignment=TA_CENTER, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name='CoverLine', parent=styles['Title'],
    fontName='Times-Bold', fontSize=13, leading=18,
    textColor=BLACK, alignment=TA_CENTER, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name='CoverCell', parent=styles['BodyText'],
    fontName='Times-Bold', fontSize=10, leading=14,
    textColor=BLACK, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name='CoverCellMono', parent=styles['BodyText'],
    fontName='Courier-Bold', fontSize=8.3, leading=12,
    textColor=BLACK, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name='SectionH2', parent=styles['Heading1'],
    fontName='Times-Bold', fontSize=13, leading=17,
    textColor=BLACK, alignment=TA_CENTER,
    spaceBefore=12, spaceAfter=6, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name='SectionH3', parent=styles['Heading2'],
    fontName='Times-Bold', fontSize=11, leading=14.5,
    textColor=BLACK, alignment=TA_LEFT,
    spaceBefore=8, spaceAfter=4, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name='BodyAcademic', parent=styles['BodyText'],
    fontName='Times-Roman', fontSize=9.8, leading=13.6,
    textColor=BLACK, alignment=TA_LEFT, spaceAfter=4.5,
))
styles.add(ParagraphStyle(
    name='BulletAcademic', parent=styles['BodyText'],
    fontName='Times-Roman', fontSize=9.6, leading=13.4,
    textColor=BLACK, alignment=TA_LEFT,
    leftIndent=14, firstLineIndent=-9, spaceAfter=3.2,
))
styles.add(ParagraphStyle(
    name='TableHeadAcademic', parent=styles['BodyText'],
    fontName='Times-Bold', fontSize=7.4, leading=9.4, textColor=BLACK,
))
styles.add(ParagraphStyle(
    name='TableCellAcademic', parent=styles['BodyText'],
    fontName='Times-Roman', fontSize=7.3, leading=9.3, textColor=BLACK,
))
styles.add(ParagraphStyle(
    name='CodeBoxText', parent=styles['Code'],
    fontName='Courier', fontSize=7.1, leading=9.4,
    textColor=colors.HexColor('#1f2937'),
))
styles.add(ParagraphStyle(
    name='CaptionAcademic', parent=styles['BodyText'],
    fontName='Times-Italic', fontSize=8.5, leading=11,
    textColor=colors.HexColor('#374151'), alignment=TA_CENTER,
    spaceBefore=2, spaceAfter=6,
))


def inline(text):
    text = text.replace(r'\le', '≤').replace(r'\ge', '≥').replace(r'\to', '→')
    text = text.replace(r'\rightarrow', '→').replace(r'\land', '&&').replace(r'\lor', '||').replace(r'\%', '%')
    text = re.sub(r'\$([^$]+)\$', r'\1', text)
    text = escape(text)
    text = re.sub(r'`([^`]+)`', r'<font name="Courier" size="8.2">\1</font>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*([^*]+)\*', r'<i>\1</i>', text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<link href="\2" color="#000000"><u>\1</u></link>', text)
    text = re.sub(r'\[([^\]]+)\]\((?!https?://)([^)]+)\)', r'<u>\1</u>', text)
    return text


def split_table_row(line):
    stripped = line.strip().strip('|')
    return [cell.replace(r'\|', '|').strip() for cell in re.split(r'(?<!\\)\|', stripped)]


def compute_col_widths(raw_rows, usable_width):
    num_cols = max(len(r) for r in raw_rows)
    if num_cols <= 1:
        return [usable_width]
    max_lens = [6] * num_cols
    for row_idx, r in enumerate(raw_rows):
        for idx, cell in enumerate(r):
            clean = re.sub(r'[`*\[\]]', '', cell)
            if row_idx == 0:
                max_lens[idx] = max(max_lens[idx], len(clean) + 2)
            else:
                longest_word = max((len(w) for w in clean.split()), default=0)
                max_lens[idx] = max(max_lens[idx], min(len(clean), 46), min(longest_word + 2, 18))
    total = sum(max_lens)
    min_w = usable_width * 0.055
    widths = [max(min_w, usable_width * (l / total)) for l in max_lens]
    scale = usable_width / sum(widths)
    return [w * scale for w in widths]


def draw_page_border(canvas, _doc):
    canvas.saveState()
    width, height = A4
    margin = 11 * mm
    canvas.setStrokeColor(BLACK)
    canvas.setLineWidth(1.1)
    canvas.rect(margin, margin, width - 2 * margin, height - 2 * margin, stroke=1, fill=0)
    canvas.restoreState()


class AcademicReportDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            str(filename),
            pagesize=A4,
            leftMargin=19 * mm,
            rightMargin=19 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title='MuseumOS SQE Final Project Report',
            author='FAST NUCES Islamabad - SE3002 Section C',
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id='body',
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id='academic', frames=[frame], onPage=draw_page_border))


def build_cover_page(usable_width):
    story = [Spacer(1, 18 * mm)]
    story.append(Paragraph(escape(UNIVERSITY), styles['CoverUni']))
    story.append(Spacer(1, 10 * mm))

    if LOGO_PATH.exists():
        logo = Image(str(LOGO_PATH), width=52 * mm, height=52 * mm)
        logo.hAlign = 'CENTER'
        story.append(logo)
        story.append(Spacer(1, 16 * mm))

    story.append(Paragraph(escape(COURSE), styles['CoverLine']))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(escape(PROJECT_TITLE), styles['CoverLine']))
    story.append(Spacer(1, 4 * mm))
    if INSTRUCTOR.strip():
        story.append(Paragraph(escape(INSTRUCTOR), styles['CoverLine']))
        story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(escape(SUBTITLE), styles['CoverLine']))
    story.append(Spacer(1, 18 * mm))

    meta_rows = [
        [
            Paragraph('Team Members:', styles['CoverCell']),
            Paragraph(
                'Burhan Ahmed (24I-3030)<br/>'
                'Syed Ali Akbar Naqvi (24I-3079)<br/>'
                'Huzaifa Ali (24I-3114)',
                styles['CoverCell'],
            ),
        ],
        [Paragraph('Section:', styles['CoverCell']), Paragraph('C', styles['CoverCell'])],
        [Paragraph('Department:', styles['CoverCell']), Paragraph('Software Engineering', styles['CoverCell'])],
        [Paragraph('Report Date:', styles['CoverCell']), Paragraph('2026-11-27', styles['CoverCell'])],
        [
            Paragraph('Baseline Commit:', styles['CoverCell']),
            Paragraph('0ef7004ebef1c59130101fa0a56c95a50ca31900', styles['CoverCellMono']),
        ],
        [
            Paragraph('Upstream Repo:', styles['CoverCell']),
            Paragraph('https://github.com/akolit/MuseumOS (AGPL-3.0)', styles['CoverCell']),
        ],
        [
            Paragraph('Team GitHub Repo:', styles['CoverCell']),
            Paragraph('https://github.com/ali-akbar1214/MuseumOS-SQE-Team', styles['CoverCell']),
        ],
    ]
    table_w = min(usable_width, 148 * mm)
    cover_table = Table(meta_rows, colWidths=[40 * mm, table_w - 40 * mm], hAlign='CENTER')
    cover_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.75, BLACK),
        ('BOX', (0, 0), (-1, -1), 0.9, BLACK),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cover_table)
    story.append(PageBreak())
    return story


def make_code_box(raw_lines, usable_width):
    wrapped = []
    for raw in raw_lines:
        if not raw.strip():
            wrapped.append('')
        else:
            wrapped.extend(textwrap.wrap(raw, width=96, replace_whitespace=False, drop_whitespace=False) or [''])
    pre = Preformatted('\n'.join(wrapped), styles['CodeBoxText'])
    box = Table([[pre]], colWidths=[usable_width], hAlign='LEFT')
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CODE_BG),
        ('BOX', (0, 0), (-1, -1), 0.5, CODE_BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return [Spacer(1, 2), box, Spacer(1, 5)]


def build_story(markdown):
    lines = markdown.splitlines()
    usable_width = A4[0] - 38 * mm
    story = build_cover_page(usable_width)
    pending_heading = None
    i = 0

    while i < len(lines):
        raw_line = lines[i]
        line = raw_line.strip()

        if line == '<!-- PAGEBREAK -->':
            if pending_heading is not None:
                story.append(pending_heading)
                pending_heading = None
            story.append(PageBreak())
            i += 1
            continue

        if not line or line == '---':
            i += 1
            continue

        if line.startswith('```'):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i].rstrip('\r\n'))
                i += 1
            if i < len(lines):
                i += 1
            code_block = make_code_box(code_lines, usable_width)
            if pending_heading is not None:
                story.append(KeepTogether([pending_heading, *code_block]))
                pending_heading = None
            else:
                story.append(KeepTogether(code_block))
            continue

        img_match = re.fullmatch(r'!\[([^\]]*)\]\(([^)]+)\)', line)
        if img_match:
            caption, rel_path = img_match.groups()
            img_path = (ROOT / 'docs' / 'team' / rel_path).resolve()
            if not img_path.exists():
                img_path = (ROOT / rel_path).resolve()
            if img_path.exists():
                with PILImage.open(img_path) as im:
                    iw, ih = im.size
                target_w = min(usable_width, 162 * mm)
                target_h = target_w * (ih / iw)
                max_h = 88 * mm
                if target_h > max_h:
                    target_h = max_h
                    target_w = target_h * (iw / ih)
                img_flow = Image(str(img_path), width=target_w, height=target_h)
                img_flow.hAlign = 'CENTER'
                block = [Spacer(1, 3), img_flow]
                if caption:
                    block.append(Paragraph(inline(caption), styles['CaptionAcademic']))
                if pending_heading is not None:
                    story.append(KeepTogether([pending_heading, *block]))
                    pending_heading = None
                else:
                    story.append(KeepTogether(block))
            i += 1
            continue

        if line.startswith('|'):
            raw_rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = split_table_row(lines[i])
                if not all(re.fullmatch(r':?-{2,}:?', cell.replace(' ', '')) for cell in cells):
                    raw_rows.append(cells)
                i += 1
            if raw_rows:
                width_count = max(len(row) for row in raw_rows)
                col_widths = compute_col_widths(raw_rows, usable_width)
                data = []
                for row_index, row in enumerate(raw_rows):
                    row = row + [''] * (width_count - len(row))
                    style = 'TableHeadAcademic' if row_index == 0 else 'TableCellAcademic'
                    data.append([Paragraph(inline(cell), styles[style]) for cell in row])
                table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT', splitByRow=1)
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEAD_BG),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ('GRID', (0, 0), (-1, -1), 0.55, BLACK),
                    ('BOX', (0, 0), (-1, -1), 0.75, BLACK),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4.5),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4.5),
                    ('TOPPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ]))
                table_block = [Spacer(1, 2), table, Spacer(1, 5)]
                if pending_heading is not None:
                    story.append(KeepTogether([pending_heading, *table_block]))
                    pending_heading = None
                else:
                    story.append(KeepTogether(table_block))
            continue

        if pending_heading is not None:
            story.append(pending_heading)
            pending_heading = None

        if line.startswith('## '):
            heading = Paragraph(f'<u>{inline(line[3:])}</u>', styles['SectionH2'])
            next_line = i + 1
            while next_line < len(lines) and not lines[next_line].strip():
                next_line += 1
            if next_line < len(lines) and lines[next_line].strip().startswith(('|', '![', '```')):
                pending_heading = heading
            else:
                story.append(heading)
            i += 1
            continue

        if line.startswith('### '):
            heading = Paragraph(inline(line[4:]), styles['SectionH3'])
            next_line = i + 1
            while next_line < len(lines) and not lines[next_line].strip():
                next_line += 1
            if next_line < len(lines) and lines[next_line].strip().startswith(('|', '![', '```')):
                pending_heading = heading
            else:
                story.append(heading)
            i += 1
            continue

        if line.startswith('- '):
            while i < len(lines) and lines[i].strip().startswith('- '):
                story.append(Paragraph(f'\u2022&nbsp;&nbsp;{inline(lines[i].strip()[2:])}', styles['BulletAcademic']))
                i += 1
            story.append(Spacer(1, 2))
            continue

        if re.match(r'^\d+\.\s+', line):
            num = 1
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i].strip()):
                content = re.sub(r'^\d+\.\s+', '', lines[i].strip())
                story.append(Paragraph(f'<b>{num}.</b>&nbsp;&nbsp;{inline(content)}', styles['BulletAcademic']))
                num += 1
                i += 1
            story.append(Spacer(1, 2))
            continue

        story.append(Paragraph(inline(line), styles['BodyAcademic']))
        i += 1

    return story


def main():
    content = SOURCE.read_text(encoding='utf-8')
    story = build_story(content)
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    AcademicReportDoc(OUTPUT_PDF).build(story)
    print(f'Wrote {OUTPUT_PDF}')


if __name__ == '__main__':
    main()
