"""Deterministic, visibly synthetic PDF fixtures. Not a model-output oracle."""
import json
import re
from pathlib import Path
from html import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parent
pdfmetrics.registerFont(TTFont('Latin', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('LatinBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('CJK', '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf'))

def rich(text):
    # The CJK fallback font has no Latin/digit glyphs; retain an explicit Latin
    # font for numbers, identifiers and European text in mixed-language lines.
    return re.sub(r'([\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]+)',
        r'<font name="CJK">\1</font>', escape(text))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Latin', 7)
    canvas.setFillColor(HexColor('#646c74'))
    canvas.drawString(doc.leftMargin, 24, 'SYNTHETIC TEST FIXTURE - NOT PAYABLE')
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 24, str(doc.page))
    canvas.restoreState()

for spec in json.loads((ROOT / 'cases.json').read_text())['documents']:
    receipt = spec['layout'] == 'receipt'
    size = (320, 740) if receipt else (595.28, 841.89)
    font = 'Latin'
    margin = 25 if receipt else 42
    document = SimpleDocTemplate(str(ROOT / (spec['id'] + '.pdf')), pagesize=size,
        leftMargin=margin, rightMargin=margin, topMargin=38, bottomMargin=45,
        title=spec['title'] + ' - SYNTHETIC TEST', author='avenOS test corpus', invariant=1)
    body = ParagraphStyle('body', fontName=font, fontSize=10 if not receipt else 9,
        leading=17, spaceAfter=10, textColor=HexColor('#263238'), wordWrap='CJK')
    heading = ParagraphStyle('heading', parent=body, fontName=font if font == 'CJK' else 'LatinBold',
        fontSize=19 if not receipt else 16, leading=25, spaceAfter=10, textColor=HexColor('#183b4e'))
    badge = ParagraphStyle('badge', fontName='LatinBold', fontSize=8, leading=12,
        textColor=HexColor('#a03030'), spaceAfter=16)
    story = [Paragraph('SYNTHETIC / FIKTIV - NICHT ZAHLBAR', badge),
        Paragraph(rich(spec['title']), heading), Paragraph(rich(spec['subtitle']), body), Spacer(1, 14)]
    story.extend(Paragraph(rich(line), body) for line in spec['lines'])
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(spec['id'] + '.pdf')
