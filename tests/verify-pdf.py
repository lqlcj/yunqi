"""Optional rendered-PDF check; requires PyMuPDF, after test:readability."""
from pathlib import Path
import json
import pymupdf

out = Path('test-results/readability')
results = []
texts = []
for name in ('month-light.pdf', 'month-dark.pdf'):
    doc = pymupdf.open(out / name)
    text = ''.join(page.get_text() for page in doc)
    assert text.count('【模拟测试数据】') == 336, name
    for label in ('2027年1月13日', '开始时间', '持续时长', '间隔时长'):
        assert label in text, (name, label)
    spans = [s for p in doc for b in p.get_text('dict')['blocks'] if 'lines' in b
             for line in b['lines'] for s in line['spans'] if s['text'].strip()]
    assert all(s['color'] in (0x222222, 0x333333) for s in spans), name
    assert min(s['size'] for s in spans) >= 8, name  # SVG labels scale to about 8.16pt; body >=9pt.
    for p in doc:
        for b in p.get_text('blocks'):
            assert 0 <= b[0] < b[2] <= p.rect.width and 0 <= b[1] < b[3] <= p.rect.height, (name, p.number, b)
    doc[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(out / f'{name}-first.png')
    for p in doc:
        if '宫缩记录' in p.get_text():
            p.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(out / f'{name}-contractions.png')
    results.append({'file':name, 'pages':len(doc), 'recordMarkers':336, 'minFontPt':min(s['size'] for s in spans)})
    texts.append(text)
assert texts[0] == texts[1], 'Theme must not change exported report data'
(out / 'pdf-verification.json').write_text(json.dumps({'passed':True, 'results':results}, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False))
