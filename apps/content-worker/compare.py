"""Compare two evaluate.py JSON reports (before/after) on the files BOTH versions could process, so a new capability
(e.g. HEIC) never inflates or hides a regression. Every number comes from the two reports; nothing is estimated.

python compare.py BEFORE.json AFTER.json OUT.md
"""
import json
import statistics
import sys
from pathlib import Path

before, after = (json.loads(Path(p).read_text(encoding='utf-8')) for p in sys.argv[1:3])
OCR_KINDS = {'device-label', 'invoice', 'screenshot', 'perspective-label', 'small-label', 'glare-shadow', 'pdf-scanned', 'pdf-hybrid', 'pdf-rotated'}
index = lambda report: {(r['id'], r['quality']): r for r in report['rows']}
b_rows, a_rows = index(before), index(after)
qualities = list(after['summary'])


def stats(rows):
    rows = [r for r in rows if 'error' not in r and r['truthChars']]
    if not rows:
        return None
    ids = sum(r['identifiers'] for r in rows)
    return {'n': len(rows), 'cer': statistics.fmean(r['cer'] for r in rows), 'ids': sum(r['identifiersExact'] for r in rows) / max(1, ids),
            'sec': statistics.fmean(r['seconds'] for r in rows), 'passes': sum(r['secondPasses'] for r in rows), 'rss': max(r['peakRssKiB'] for r in rows) / 1024}


def cell(s):
    return '-' if not s else f"{s['cer']:.3f} / {s['ids']:.3f} / {s['sec']:.2f}s / {s['passes']}"


def table(title, groups, filt):
    lines = [f'### {title}', '', '| Grupo | n | ' + ' | '.join(f'{q} antes | {q} despues' for q in qualities) + ' |', '|---|---|' + '---|---|' * len(qualities)]
    for name, member in groups:
        common = {key for key, r in a_rows.items() if member(r) and filt(r) and key in b_rows and 'error' not in r and 'error' not in b_rows[key]}
        if not common:
            continue
        n = len({k[0] for k in common})
        cells = []
        for q in qualities:
            keys = [k for k in common if k[1] == q]
            cells += [cell(stats([b_rows[k] for k in keys])), cell(stats([a_rows[k] for k in keys]))]
        lines.append(f'| {name} | {n} | ' + ' | '.join(cells) + ' |')
    return lines + ['']


out = ['# Comparativa antes / despues (conjunto comun)', '',
       'Cada celda: CER medio / identificadores exactos / segundos por archivo / segundas pasadas. Solo archivos que ambas versiones procesan sin error; '
       f"HEIC ({sum(1 for r in before['rows'] if r['kind'] == 'heic-photo' and 'error' in r and r['quality'] == qualities[0])} archivos) no se puede comparar: la version anterior no los admite.", '']
out += table('OCR (imagenes y PDF escaneados), por modo', [('todos los tipos OCR', lambda r: True)], lambda r: r['kind'] in OCR_KINDS)
out += table('Por tipo', [(k, lambda r, k=k: r['kind'] == k) for k in sorted({r['kind'] for r in after['rows']})], lambda r: True)
out += table('OCR por dificultad', [(d, lambda r, d=d: r['difficulty'] == d) for d in ('clean', 'moderate', 'hard')], lambda r: r['kind'] in OCR_KINDS)
out += ['### Capacidades nuevas (sin comparacion posible)', '']
for kind in ('heic-photo',):
    rows = [r for r in after['rows'] if r['kind'] == kind]
    for q in qualities:
        s = stats([r for r in rows if r['quality'] == q])
        if s:
            out.append(f'- {kind} / {q}: n={s["n"]}, CER {s["cer"]:.3f}, identificadores exactos {s["ids"]:.3f}, {s["sec"]:.2f} s por archivo.')
Path(sys.argv[3]).write_text('\n'.join(out) + '\n', encoding='utf-8')
print('\n'.join(out))
