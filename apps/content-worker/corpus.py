"""Seeded synthetic corpus generator with ground truth. Binaries are never committed.

python corpus.py OUT_DIR --size smoke|standard|extended [--seed N]
Real authorized photos: drop IMAGE.ext + IMAGE.txt (ground truth) into a directory and pass
--real DIR; they are listed in the manifest as kind "real" and stay outside Git.
"""
import argparse
import io
import json
import random
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
         '/usr/share/fonts/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']
SIZES = {'smoke': 1, 'standard': 8, 'extended': 40}  # variants per base document
DEVICES = [('LAPTOP', 'Service Tag', 'Model Latitude 7450'), ('SWITCH', 'Serial', 'Hostname {host}'),
           ('ACCESS POINT', 'Asset Tag', 'Model AP-AX3000'), ('CAMARA CCTV', 'Serial', 'Model IPC-4MP')]
TRANSFORMS = ['rotate', 'tilt', 'perspective', 'blur', 'noise', 'reflection', 'shadow', 'lowcontrast', 'jpeg', 'small', 'background']


def font(size):
    for path in FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit('No TrueType font found; run inside the worker image or pass a system font')


def code(rng, n, alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'):
    return ''.join(rng.choice(alphabet) for _ in range(n))


def identifiers(rng):
    return {'serial': 'FCW' + code(rng, 8), 'tag': 'RUNLY' + str(rng.randint(10000, 99999)), 'service': code(rng, 7),
            'host': 'SW-' + code(rng, 4) + '-0' + str(rng.randint(1, 9)), 'rfc': code(rng, 3, 'ABCDEFGHJKLMNPQRSTUVWXYZ') + str(rng.randint(100000, 999999)) + code(rng, 3),
            'folio': 'MX-2026-' + str(rng.randint(100000, 999999))}


def device_text(rng, ids):
    name, label, extra = rng.choice(DEVICES)
    return f"{name}\n{label} {ids['service'] if label == 'Service Tag' else ids['serial'] if label == 'Serial' else ids['tag']}\n{extra.format(host=ids['host'])}"


def invoice_text(ids, page=1):
    return f"FACTURA {ids['folio']}\nRFC {ids['rfc']}\nPagina {page} Total MXN {1000 + page * 250}.50"


def render(text, size, rng, background='#414952'):
    image = Image.new('RGB', (1400, 700), background)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((100, 80, 1300, 620), radius=25, fill='#b8bdc4')
    draw.rectangle((170, 145, 1230, 520), fill='white')
    draw.multiline_text((210, 195), text, font=font(size), fill='#101820', spacing=24)
    return image


def transform(image, names, rng):
    applied = []
    for name in names:
        if name == 'rotate':
            angle = rng.choice([90, 180, 270]); image = image.rotate(angle, expand=True); applied.append({'rotate': angle})
        elif name == 'tilt':
            angle = round(rng.uniform(-6, 6), 1); image = image.rotate(angle, expand=True, fillcolor='#414952'); applied.append({'tilt': angle})
        elif name == 'perspective':
            w, h = image.size; d = int(w * rng.uniform(.03, .08))
            coeffs = (1, rng.uniform(-.05, .05), 0, 0, 1, 0, rng.uniform(0, .00015), 0)
            image = image.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor='#414952'); applied.append({'perspective': [round(coeffs[1], 3), round(coeffs[6], 6)]})
        elif name == 'blur':
            r = round(rng.uniform(.8, 2.2), 1); image = image.filter(ImageFilter.GaussianBlur(r)); applied.append({'blur': r})
        elif name == 'noise':
            amp = rng.randint(20, 45); noise = Image.effect_noise(image.size, amp).convert('RGB')
            image = Image.blend(image, noise, .25); applied.append({'noise': amp})
        elif name == 'reflection':
            overlay = Image.new('RGBA', image.size)
            x = rng.randint(300, 900)
            ImageDraw.Draw(overlay).polygon([(x, 100), (x + 120, 100), (x - 200, 600), (x - 320, 600)], fill=(255, 255, 255, 190))
            image = Image.alpha_composite(image.convert('RGBA'), overlay).convert('RGB'); applied.append({'reflection': x})
        elif name == 'shadow':
            shade = Image.linear_gradient('L').resize(image.size).rotate(rng.choice([0, 90, 180, 270]))
            image = Image.composite(image, Image.new('RGB', image.size, '#000'), shade.point(lambda v: 90 + v * 165 // 255)); applied.append({'shadow': True})
        elif name == 'lowcontrast':
            c = round(rng.uniform(.2, .45), 2); image = ImageEnhance.Contrast(image).enhance(c); applied.append({'contrast': c})
        elif name == 'small':
            scale = round(rng.uniform(.4, .6), 2); w, h = image.size
            image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS); applied.append({'scale': scale})
        elif name == 'background':
            draw = ImageDraw.Draw(image)
            for _ in range(25):
                x, y = rng.randint(0, image.width), rng.randint(0, image.height)
                draw.line((x, y, x + rng.randint(-150, 150), y + rng.randint(-150, 150)), fill=(rng.randint(60, 200),) * 3, width=2)
            applied.append({'background': 25})
    return image, applied


def _homography(rect, quad):
    rows = []
    for (x, y), (u, v) in zip(rect, quad):
        rows.append([x, y, 1, 0, 0, 0, -x * u, -y * u, u])
        rows.append([0, 0, 0, x, y, 1, -x * v, -y * v, v])
    for column in range(8):
        pivot = max(range(column, 8), key=lambda r: abs(rows[r][column]))
        rows[column], rows[pivot] = rows[pivot], rows[column]
        rows[column] = [value / rows[column][column] for value in rows[column]]
        for r in range(8):
            if r != column:
                factor = rows[r][column]
                rows[r] = [a - factor * b for a, b in zip(rows[r], rows[column])]
    return [rows[i][8] for i in range(8)]


def quad_warp(label, rng, strength=0.18):
    """Photograph the label from an angle: the whole label becomes a trapezoid on a larger dark surface.
    Returns (image, quad) where quad are the label corners (tl, tr, br, bl) in the output, the independent geometric truth."""
    w, h = label.size
    out_w, out_h = 1500, 1000
    margin_x, margin_y = 170, 130
    jitter = lambda scale: rng.uniform(0, scale)
    quad = [(margin_x + jitter(w * strength), margin_y + jitter(h * strength)),
            (out_w - margin_x - jitter(w * strength), margin_y + jitter(h * strength * 0.3)),
            (out_w - margin_x - jitter(w * strength * 0.4), out_h - margin_y - jitter(h * strength * 0.3)),
            (margin_x + jitter(w * strength * 0.5), out_h - margin_y - jitter(h * strength))]
    coefficients = _homography(quad, [(0, 0), (w, 0), (w, h), (0, h)])  # output -> source
    canvas = Image.new('RGB', (out_w, out_h), '#2f353c')
    warped = label.transform((out_w, out_h), Image.PERSPECTIVE, coefficients, Image.BICUBIC, fillcolor=(47, 53, 60))
    return warped, [(round(x, 1), round(y, 1)) for x, y in quad]


def save_image(image, path, jpeg_quality=None):
    if jpeg_quality:
        image.save(path, 'JPEG', quality=jpeg_quality)
    else:
        image.save(path, 'PNG')


def pdf(path, pages, rotate=0):
    """pages: list of (text|None, Image|None). Text pages use native text; image pages embed a JPEG."""
    objects = [b'', b'', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for text, image in pages:
        content = b''
        resources = '/Font << /F1 3 0 R >>'
        if image is not None:
            buffer = io.BytesIO(); image.convert('RGB').save(buffer, 'JPEG', quality=85); raw = buffer.getvalue()
            objects.append(f'<< /Type /XObject /Subtype /Image /Width {image.width} /Height {image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(raw)} >>\nstream\n'.encode() + raw + b'\nendstream')
            resources += f' /XObject << /Im1 {len(objects)} 0 R >>'
            content += b'q 560 0 0 280 20 400 cm /Im1 Do Q '
        if text:
            y = 760
            for line in text.split('\n'):
                content += f'BT /F1 14 Tf 40 {y} Td ({line.replace("(", "").replace(")", "")}) Tj ET '.encode(); y -= 22
        objects.append(f'<< /Length {len(content)} >>\nstream\n'.encode() + content + b'\nendstream')
        rotation = f' /Rotate {rotate}' if rotate else ''
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800]{rotation} /Resources << {resources} >> /Contents {len(objects)} 0 R >>'.encode())
        kids.append(len(objects))
    objects[0] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {len(kids)} >>'.encode()
    out = bytearray(b'%PDF-1.4\n'); offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out)); out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    Path(path).write_bytes(bytes(out))


def office(path, kind, text):
    entry, xml = {'docx': ('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p></w:body></w:document>'),
                  'xlsx': ('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>%s</t></is></c></row></sheetData></worksheet>'),
                  'pptx': ('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>%s</a:t></p:sld>')}[kind]
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr(entry, xml % text)


def office_rich(path, kind, ids):
    """DOCX with body paragraph, table row and header: exercises the documented extraction order (body, then table rows)."""
    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('word/document.xml', f'<w:document {w}><w:body><w:p><w:r><w:t>Intro {ids["serial"]}</w:t></w:r></w:p>'
                         f'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{ids["tag"]}</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
        archive.writestr('word/header1.xml', f'<w:hdr {w}><w:p><w:r><w:t>Encabezado {ids["host"]}</w:t></w:r></w:p></w:hdr>')


MIME = {'heic': 'image/heic', 'png': 'image/png', 'jpg': 'image/jpeg', 'pdf': 'application/pdf', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'}


def build(out, size='smoke', seed=20261126, real=None):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed); entries = []
    def add(name, kind, truth, ids, applied, pages=None, route='ocr', **extra):
        ext = name.rsplit('.', 1)[1]
        entries.append({'id': name.rsplit('.', 1)[0], 'file': name, 'mime': MIME[ext], 'kind': kind, 'truth': truth, 'identifiers': ids,
                        'difficulty': extra.get('difficulty') or ('clean' if not applied else 'moderate' if len(applied) == 1 else 'hard'), **{k: v for k, v in extra.items() if k != 'difficulty'},
                        'transforms': applied, 'expectedRoute': route, 'pages': pages or [{'truth': truth}]})
    for n in range(SIZES[size]):
        variants = [[]] + [rng.sample(TRANSFORMS[:-1], rng.randint(1, 3)) for _ in range(3 if size != 'smoke' else 2)]
        ids = identifiers(rng); text = device_text(rng, ids); font_size = rng.choice([30, 36, 42])
        for v, names in enumerate(variants):
            image, applied = transform(render(text, font_size, rng), [x for x in names if x not in ('jpeg',)], rng)
            jpeg = 'jpeg' in names or v % 2
            name = f'device-{n:03d}-{v}.' + ('jpg' if jpeg else 'png')
            save_image(image, out / name, 70 if jpeg else None)
            add(name, 'device-label', text, [ids['serial'] if 'Serial' in text else ids['tag'] if 'Asset' in text else ids['service']], applied + ([{'jpeg': 70}] if jpeg else []))
        invoice = invoice_text(ids)
        image, applied = transform(render(invoice, 36, rng), rng.sample(TRANSFORMS[:-1], 1), rng); save_image(image, out / f'invoice-{n:03d}.png')
        add(f'invoice-{n:03d}.png', 'invoice', invoice, [ids['folio'], ids['rfc']], applied)
        screen = f"Inventario\nHostname {ids['host']}\nEstado Disponible"
        save_image(render(screen, 32, rng, '#ffffff'), out / f'screenshot-{n:03d}.png'); add(f'screenshot-{n:03d}.png', 'screenshot', screen, [ids['host']], [])
        pages = [invoice_text(ids, p) for p in (1, 2, 3)]
        pdf(out / f'invoice-multi-{n:03d}.pdf', [(t, None) for t in pages])
        add(f'invoice-multi-{n:03d}.pdf', 'pdf-digital', '\n'.join(pages), [ids['folio']], [], [{'truth': t} for t in pages], 'digital')
        scan, applied = transform(render(invoice, 36, rng), ['tilt'], rng); pdf(out / f'scan-{n:03d}.pdf', [(None, scan)])
        add(f'scan-{n:03d}.pdf', 'pdf-scanned', invoice, [ids['folio']], applied)
        hybrid = ['Contrato de servicio ' + ids['folio'], invoice]
        pdf(out / f'hybrid-{n:03d}.pdf', [(hybrid[0], None), (None, render(invoice, 36, rng))])
        add(f'hybrid-{n:03d}.pdf', 'pdf-hybrid', '\n'.join(hybrid), [ids['folio']], [], [{'truth': hybrid[0], 'route': 'digital'}, {'truth': invoice, 'route': 'ocr'}], 'mixed')
        for ext in ('docx', 'xlsx', 'pptx'):
            text = f"Documento {ext} Serie {ids['serial']}"; office(out / f'office-{n:03d}.{ext}', ext, text)
            # Documented extractor contract: spreadsheet cells are referenced as 'A1: value' so a hit says where it lives.
            add(f'office-{n:03d}.{ext}', 'office', ('A1: ' + text) if ext == 'xlsx' else text, [ids['serial']], [], None, 'digital')
        blank = Image.new('RGB', (1400, 700), '#d0d4d8').filter(ImageFilter.GaussianBlur(3)); save_image(blank, out / f'notext-{n:03d}.png')
        add(f'notext-{n:03d}.png', 'no-text', '', [], [])

    # Stage 4C additions use their own RNG: every case above keeps its exact previous content for regression comparison.
    extra_rng = random.Random(seed + 4)
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pillow_heif = None
    for n in range(SIZES[size]):
        ids = identifiers(extra_rng); text = device_text(extra_rng, ids); ident = [ids['serial'] if 'Serial' in text else ids['tag'] if 'Asset' in text else ids['service']]
        label = render(text, extra_rng.choice([34, 40]), extra_rng)
        photo, quad = quad_warp(label, extra_rng, 0.12 + 0.1 * (n % 3))
        save_image(photo, out / f'persp-{n:03d}.jpg', 80); add(f'persp-{n:03d}.jpg', 'perspective-label', text, ident, [{'quad': quad}], difficulty='hard', quad=quad)
        tiny = label.resize((int(label.width * .38), int(label.height * .38)), Image.LANCZOS); save_image(tiny, out / f'tiny-{n:03d}.png')
        add(f'tiny-{n:03d}.png', 'small-label', text, ident, [{'scale': .38}], difficulty='hard')
        glare, applied = transform(label, ['reflection', 'shadow', 'blur'], extra_rng); save_image(glare, out / f'glare-{n:03d}.jpg', 75)
        add(f'glare-{n:03d}.jpg', 'glare-shadow', text, ident, applied, difficulty='hard')
        if pillow_heif:
            heic_image, applied = transform(render(text, 36, extra_rng), ['tilt'] if n % 2 else [], extra_rng); heic_image.save(out / f'photo-{n:03d}.heic', 'HEIF', quality=85)
            add(f'photo-{n:03d}.heic', 'heic-photo', text, ident, applied)
        invoice = invoice_text(ids)
        for turns in (90, 270):  # PDF pages whose /Rotate flag differs from the scan orientation
            scan = render(invoice, 36, extra_rng)
            pdf(out / f'scan-rot{turns}-{n:03d}.pdf', [(None, scan)], rotate=turns)
            add(f'scan-rot{turns}-{n:03d}.pdf', 'pdf-rotated', invoice, [ids['folio']], [{'pdfRotate': turns}], difficulty='moderate', pdfRotate=turns)
        rich = f"Intro {ids['serial']}\nCelda A | {ids['tag']}"
        office_rich(out / f'office-rich-{n:03d}.docx', 'docx', ids)
        add(f'office-rich-{n:03d}.docx', 'office', rich + f"\nEncabezado {ids['host']}", [ids['serial'], ids['tag'], ids['host']], [], difficulty='clean', route='digital')
    for path in sorted(Path(real).glob('*.*') if real else []):
        truth = path.with_suffix('.txt')
        if path.suffix.lower() in ('.png', '.jpg', '.jpeg') and truth.exists():
            entries.append({'id': 'real-' + path.stem, 'file': str(path), 'mime': MIME['jpg' if path.suffix.lower() != '.png' else 'png'], 'kind': 'real',
                            'truth': truth.read_text(encoding='utf-8').strip(), 'identifiers': [], 'transforms': [], 'expectedRoute': 'ocr', 'pages': [{'truth': ''}]})
    manifest = {'seed': seed, 'size': size, 'synthetic': True, 'count': len(entries), 'entries': entries}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('out'); parser.add_argument('--size', default='smoke', choices=SIZES)
    parser.add_argument('--seed', type=int, default=20261126); parser.add_argument('--real')
    args = parser.parse_args(); manifest = build(args.out, args.size, args.seed, args.real)
    print(json.dumps({'count': manifest['count'], 'size': args.size, 'seed': args.seed}))
