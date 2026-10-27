"""Independent raster inspection of the local viewport/text PDF regression."""
import json
from pathlib import Path
import pymupdf

root = Path('.artifacts/studio/viewport')
results = []
for profile in ['rgb', 'cmyk']:
    for count in [1, 16, 4]:
        name = f'{profile}-{count}.pdf'
        pdf = pymupdf.open(root / name)
        assert len(pdf) == count
        source_indices = [0] if count == 1 else list(range(16)) if count == 16 else [0, 1, 2, 4]
        montage = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 4 * 320, 4 * 320), False)
        montage.clear_with(240)
        for index, page in enumerate(pdf):
            source = source_indices[index]
            pix = page.get_pixmap(matrix=pymupdf.Matrix(300 / 72, 300 / 72), alpha=False)
            expected = (240, 320) if source % 2 else (320, 240)
            assert abs(pix.width - expected[0]) <= 1 and abs(pix.height - expected[1]) <= 1
            # Page-order marker, local photo, gradient endpoints, and real text.
            red, green, blue = pix.pixel(20, 180)[:3]
            assert (red > 180 and blue < 100) if source % 2 else (blue > 140 and red < 100)
            red, green, blue = pix.pixel(200, 180)[:3]
            assert red > 170 and green > 110 and blue < 100
            left, right = pix.pixel(110, 180), pix.pixel(175, 180)
            assert sum(abs(a - b) for a, b in zip(left, right)) > 70
            dark = sum(min(pix.pixel(x, y)[:3]) < 150 for y in range(16, 145) for x in range(12, 210))
            assert dark > 100, f'Text missing on {name}/{index + 1}'
            # PyMuPDF copy uses absolute coordinates; move the source rectangle.
            pix.set_origin(index % 4 * 320, index // 4 * 320)
            montage.copy(pix, pix.irect)
        montage.save(root / f'{profile}-{count}-contact.png')
        results.append({'file': name, 'pages': count, 'rasterContent': True})
(root / 'pdf-raster-result.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results))
