"""Synthetic, reproducible corpus. Run inside the worker image; no external data."""
import importlib.util
import io
import json
import multiprocessing
import re
import resource
import tempfile
import time
import unittest
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
from worker import ProcessingError, build_searchable_pdf, cgroup_number, command, extract, resources, safe_xml, next_cpu_debt
FONT = next(str(path) for path in [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/dejavu/DejaVuSans.ttf')] if path.exists())

POLICY = {"quality": "balanced", "languages": ["spa", "eng"], "allowOcr": True,
          "maxPixels": 16000000, "maxPages": 10, "maxFileBytes": 10485760, "timeoutSeconds": 120}
TRUTH = "RUNLY INVENTARIO\nService Tag ABC123XYZ\nNumero de serie O0 I1 S5 B8 Z2\nFactura MXN 1250.50 Fecha 2026-11-25"
MEASUREMENTS = []


def label():
    image = Image.new("RGB", (1800, 800), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, 50)
    draw.multiline_text((70, 110), TRUTH, fill="black", font=font, spacing=30)
    return image


def make_pdf(path, kinds):
    objects = [b"", b""]
    font_id = len(objects) + 1
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages = []
    for kind in kinds:
        image_id = None
        if kind == "image":
            jpeg = io.BytesIO()
            label().save(jpeg, "JPEG")
            raw = jpeg.getvalue()
            image_id = len(objects) + 1
            objects.append(f"<< /Type /XObject /Subtype /Image /Width 1800 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(raw)} >>\nstream\n".encode() + raw + b"\nendstream")
            content = b"q 600 0 0 267 0 300 cm /Im1 Do Q"
        else:
            content = b"BT /F1 18 Tf 40 700 Td (Documento digital Serie DIGITAL987 texto nativo) Tj ET"
        content_id = len(objects) + 1
        objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")
        page_id = len(objects) + 1
        resources = f"/Font << /F1 {font_id} 0 R >>" + (f" /XObject << /Im1 {image_id} 0 R >>" if image_id else "")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << {resources} >> /Contents {content_id} 0 R >>".encode())
        pages.append(page_id)
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[1] = f"<< /Type /Pages /Count {len(pages)} /Kids [{' '.join(f'{i} 0 R' for i in pages)}] >>".encode()
    raw, offsets = b"%PDF-1.4\n", [0]
    for i, obj in enumerate(objects):
        offsets.append(len(raw))
        raw += f"{i+1} 0 obj\n".encode() + obj + b"\nendobj\n"
    at = len(raw)
    raw += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    raw += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    raw += f"trailer << /Root 1 0 R /Size {len(offsets)} >>\nstartxref\n{at}\n%%EOF\n".encode()
    path.write_bytes(raw)


def distance(a, b):
    row = list(range(len(b)+1))
    for i, x in enumerate(a):
        next_row = [i+1]
        for j, y in enumerate(b):
            next_row.append(min(next_row[-1]+1, row[j+1]+1, row[j]+(x != y)))
        row = next_row
    return row[-1]


class Corpus(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "original"

    def tearDown(self):
        self.temp.cleanup()

    def test_cpu_debt_proportional_and_low_budget_is_not_reset_by_heartbeat(self):
        self.assertAlmostEqual(next_cpu_debt(0,100,80,2),0.5)
        self.assertAlmostEqual(next_cpu_debt(.5,0,80,.5),0)
        debt=next_cpu_debt(0,100,10,5)
        self.assertEqual(debt,45)
        self.assertEqual(next_cpu_debt(debt,0,10,10),35)
        self.assertEqual(next_cpu_debt(debt,None,10,10),45)

    def test_ocr_modes_ground_truth_and_coordinates(self):
        label().save(self.path, "PNG")
        original = self.path.read_bytes()
        for quality in ("fast", "balanced", "accurate"):
            started = time.monotonic()
            result = extract(self.path, "image/png", {**POLICY, "quality": quality})
            text = result["pages"][0]["text"]
            normalized = re.sub(r"\s+", " ", text).strip()
            truth = re.sub(r"\s+", " ", TRUTH).strip()
            MEASUREMENTS.append({"case": "label", "quality": quality, "seconds": round(time.monotonic()-started, 3),
                                 "cer": distance(truth, normalized)/len(truth),
                                 "wer": distance(truth.split(), normalized.split())/len(truth.split()),
                                 "exactSerial": "ABC123XYZ" in text, "recognized": text})
            self.assertIn("ABC123XYZ", text)
            self.assertFalse(result["partial"])
            for word in result["pages"][0]["words"]:
                self.assertLessEqual(word["x"]+word["width"], 1802)
                self.assertLessEqual(word["y"]+word["height"], 802)
        self.assertEqual(original, self.path.read_bytes())

    def test_rotated_and_inclined_low_contrast(self):
        for name, image in (("rotated", label().rotate(90, expand=True)),
                            ("inclined", ImageEnhance.Contrast(label()).enhance(0.45).rotate(3, expand=True, fillcolor="white"))):
            image.save(self.path, "PNG")
            started = time.monotonic()
            text = extract(self.path, "image/png", POLICY)["pages"][0]["text"]
            MEASUREMENTS.append({"case": name, "seconds": round(time.monotonic()-started, 3), "exactSerial": "ABC123XYZ" in text, "recognized": text})
            self.assertIn("ABC123XYZ", text)

    def test_spanish_and_english(self):
        image = label()
        ImageDraw.Draw(image).text((70, 550), "Español: número, información. English: invoice date.",
                                  font=ImageFont.truetype(FONT, 42), fill="black")
        image.save(self.path, "PNG")
        text = extract(self.path, "image/png", POLICY)["pages"][0]["text"]
        self.assertIn("información", text)
        self.assertIn("invoice", text)

    def test_empty_image(self):
        Image.new("RGB", (500, 500), "white").save(self.path, "PNG")
        self.assertEqual(extract(self.path, "image/png", POLICY)["pages"][0]["text"], "")

    def test_exif_canvas_matches_browser_oriented_image(self):
        exif=Image.Exif();exif[274]=6
        label().rotate(90,expand=True).save(self.path,'JPEG',exif=exif)
        page=extract(self.path,'image/jpeg',POLICY)['pages'][0]
        self.assertEqual((page['engine']['canvas']['width'],page['engine']['canvas']['height']),(1800,800))
        self.assertIn('ABC123XYZ',page['text'])

    def test_pdf_native_scanned_and_hybrid(self):
        for kinds in (["digital"], ["image"], ["digital", "image"]):
            make_pdf(self.path, kinds)
            result = extract(self.path, "application/pdf", POLICY)
            self.assertEqual([p["source"] for p in result["pages"]], ["digital" if k == "digital" else "ocr" for k in kinds])
            self.assertEqual(len(result["pages"]), len(kinds))
            self.assertIn("DIGITAL987" if kinds[-1] == "digital" else "ABC123XYZ", result["pages"][-1]["text"])

    def test_pdf_limit_is_partial(self):
        make_pdf(self.path, ["digital", "digital"])
        result = extract(self.path, "application/pdf", {**POLICY, "maxPages": 1})
        self.assertTrue(result["partial"])
        self.assertEqual(len(result["pages"]), 1)

    def test_checkpoints_resume_without_retaining_all_pages(self):
        make_pdf(self.path,['digital','image'])
        saved=[]
        result=extract(self.path,'application/pdf',POLICY,checkpoint=lambda page,total:saved.append((page,total)),resume_units=[1])
        self.assertEqual(result['pages'],[])
        self.assertEqual([page['unit'] for page,total in saved],[2])
        self.assertEqual(saved[0][1],2)
        self.assertEqual(saved[0][0]['engine']['canvas']['coordinateSpace'],'pdf-raster')

    def test_parent_cleans_temp_after_child_is_killed(self):
        import worker
        from unittest.mock import patch
        def killed(job,workdir):
            import os,signal
            os.setsid()
            (Path(workdir)/'orphan').write_bytes(b'synthetic')
            os.kill(os.getpid(),signal.SIGKILL)
        with tempfile.TemporaryDirectory() as root:
            with patch.object(worker,'run_job',killed),patch.object(worker,'api',return_value={}),patch.object(tempfile,'tempdir',root):
                worker.supervise({'id':'synthetic','lease':'synthetic','policy':POLICY},'test',{})
            self.assertEqual(list(Path(root).iterdir()),[])

    def test_light_does_not_call_ocr_on_scan(self):
        make_pdf(self.path, ["image"])
        result = extract(self.path, "application/pdf", {**POLICY, "allowOcr": False})
        self.assertTrue(result["partial"])
        self.assertEqual(result["pages"], [])

    def test_digital_documents_and_safe_svg(self):
        for mime, data, expected in [("text/plain", "Número ABC123XYZ", "Número"),
                                     ("text/csv", "Serie,Importe\nABC123XYZ,100", "ABC123XYZ"),
                                     ("text/markdown", "# Modelo ABC123XYZ", "Modelo"),
                                     ("application/json", '{"serie":"ABC123XYZ"}', "ABC123XYZ"),
                                     ("image/svg+xml", '<svg><text>ABC123XYZ</text><image href="https://never-fetch.invalid/image"/></svg>', "ABC123XYZ")]:
            self.path.write_text(data)
            self.assertIn(expected, extract(self.path, mime, POLICY)["pages"][0]["text"])

    def test_office_docx_xlsx_pptx(self):
        cases = [("wordprocessingml.document", "word/document.xml", '<w:document xmlns:w="w"><w:p><w:r><w:t>Serie DOCX123</w:t></w:r></w:p></w:document>', 'DOCX123'),
                 ("spreadsheetml.sheet", "xl/worksheets/sheet1.xml", '<worksheet xmlns="s"><row><c r="A1" t="inlineStr"><is><t>XLSX456</t></is></c></row></worksheet>', 'A1: XLSX456'),
                 ("presentationml.presentation", "ppt/slides/slide1.xml", '<slide xmlns="s"><t>PPTX789</t></slide>', 'PPTX789')]
        for suffix, name, xml, expected in cases:
            with zipfile.ZipFile(self.path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(name, xml)
            self.assertIn(expected, extract(self.path, "application/vnd.openxmlformats-officedocument." + suffix, POLICY)["pages"][0]["text"])

    def test_office_structure_references_and_no_formula_evaluation(self):
        w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        docx = {"word/document.xml": f'<w:document {w}><w:body><w:p><w:r><w:t>Intro DOC1</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>TABLA77</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
                "word/header1.xml": f'<w:hdr {w}><w:p><w:r><w:t>ENCAB55</w:t></w:r></w:p></w:hdr>', "word/footer1.xml": f'<w:ftr {w}><w:p><w:r><w:t>PIE66</w:t></w:r></w:p></w:ftr>'}
        with zipfile.ZipFile(self.path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, xml in docx.items():
                archive.writestr(name, xml)
        pages = extract(self.path, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", POLICY)["pages"]
        self.assertEqual([p["reference"] for p in pages], ["Documento", "Encabezado", "Pie de página"])
        self.assertIn("Celda A | TABLA77", pages[0]["text"])
        self.assertTrue(all(not p["words"] for p in pages))  # no invented coordinates
        s = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        r = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        sheet = lambda body: f'<worksheet {s}><sheetData>{body}</sheetData></worksheet>'
        xlsx = {"xl/workbook.xml": f'<workbook {s} {r}><sheets><sheet name="Inventario" sheetId="1" r:id="rId1"/><sheet name="Resumen" sheetId="2" r:id="rId2"/></sheets></workbook>',
                "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet10.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
                "xl/sharedStrings.xml": f'<sst {s}><si><t>COMPART88</t></si></sst>',
                "xl/worksheets/sheet10.xml": sheet('<row r="3"><c r="B3" t="s"><v>0</v></c><c r="C3"><f>SUM(A1:A2)</f><v>42</v></c><c r="D3" t="e"><v>#REF!</v></c></row>'),
                "xl/worksheets/sheet2.xml": sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>SEGUNDA</t></is></c></row>')}
        with zipfile.ZipFile(self.path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, xml in xlsx.items():
                archive.writestr(name, xml)
        pages = extract(self.path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", POLICY)["pages"]
        by_ref = {p["reference"]: p["text"] for p in pages}
        self.assertEqual(by_ref["Inventario"], "B3: COMPART88\nC3: 42")  # cached value only, error cell skipped
        self.assertIn("A1: SEGUNDA", by_ref["Resumen"])

    @unittest.skipUnless(importlib.util.find_spec("pillow_heif"), "pillow-heif is only in the release image")
    def test_heic_by_content_with_limits_and_controlled_failures(self):
        import pillow_heif
        pillow_heif.register_heif_opener()
        heic = Path(self.path).with_suffix(".heic")
        label().save(heic, format="HEIF", quality=85)
        for mime in ("image/heic", "application/octet-stream"):  # the real brand decides, not the declared type
            result = extract(heic, mime, POLICY)
            page = result["pages"][0]
            self.assertIn("ABC123XYZ", page["text"])
            self.assertEqual((page["engine"]["canvas"]["width"], page["engine"]["canvas"]["height"]), (1800, 800))
            self.assertFalse(result["partial"])
            self.assertTrue(any("ABC123XYZ" in word["text"] for word in page["words"]))
        original = heic.read_bytes()
        self.assertEqual(heic.read_bytes(), original)  # source untouched
        with self.assertRaises(ProcessingError) as limit:
            extract(heic, "image/heic", {**POLICY, "maxPixels": 1000})
        self.assertEqual(limit.exception.code, "LIMIT")
        heic.write_bytes(original[:700])
        with self.assertRaises(ProcessingError) as broken:
            extract(heic, "image/heic", POLICY)
        self.assertEqual(broken.exception.code, "PARSER")
        heic.write_bytes(original.replace(b"heic", b"avif", 1))
        with self.assertRaises(ProcessingError) as avif:
            extract(heic, "image/avif", POLICY)
        self.assertEqual(avif.exception.code, "UNSUPPORTED")
        heic.unlink()

    def test_searchable_pdf_aligns_text_keeps_digital_pages_and_never_touches_the_original(self):
        from PIL import ImageChops
        make_pdf(self.path, ["image", "text", "image"])
        original = self.path.read_bytes()
        result = extract(self.path, "application/pdf", POLICY)
        pages = [{"unit": p["unit"], "source": p["source"], "words": p["words"], "canvas": p["engine"].get("canvas")} for p in result["pages"]]
        out = Path(self.temp.name) / "searchable.pdf"
        info = build_searchable_pdf(self.path, out, pages, POLICY, self.temp.name)
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual((info["pages"], info["ocr"], info["signed"]), (3, 2, False))
        text = command(["pdftotext", "-layout", str(out), "-"], 20)
        self.assertIn("ABC123XYZ", text)                    # recognized text is selectable/searchable in the scanned pages
        self.assertEqual(text.count("DIGITAL987"), 1)       # the digital page is passed through, never duplicated
        # Where the invisible words sit: pdftotext -bbox must place ABC123XYZ inside the label region of page 1.
        boxes = command(["pdftotext", "-bbox", "-f", "1", "-l", "1", str(out), "-"], 20)
        match = re.search(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">ABC123XYZ', boxes)
        self.assertTrue(match)
        # The visible page is unchanged: render both and compare.
        for name, path in (("a", self.path), ("b", out)):
            command(["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-r", "40", "-png", str(path), str(Path(self.temp.name) / name)], 20)
        with Image.open(Path(self.temp.name) / "a.png") as a, Image.open(Path(self.temp.name) / "b.png") as b:
            self.assertEqual(a.size, b.size)
            self.assertLess(sum(ImageChops.difference(a.convert("L"), b.convert("L")).histogram()[40:]) / (a.width * a.height), 0.03)
        with self.assertRaises(ProcessingError) as digital_only:  # a purely digital PDF needs no copy
            make_pdf(self.path, ["text"])
            build_searchable_pdf(self.path, out, [], POLICY, self.temp.name)
        self.assertEqual(digital_only.exception.code, "NOT_NEEDED")

    def test_canvas_is_the_original_bitmap_even_when_orientation_or_perspective_changes_the_working_image(self):
        from worker import recognize
        source = label().rotate(90, expand=True)              # OSD will turn it back: working image differs from the canvas
        details = {}
        recognize(source, self.temp.name, {**POLICY, "quality": "accurate"}, details)
        self.assertEqual((details["width"], details["height"]), source.size)
        self.assertIn(details["perspective"], ("none", "candidate", "applied"))

    def test_pdf_word_geometry_against_layout_truth_for_mediabox_cropbox_and_rotation(self):
        """Ground truth comes from where the label bitmap was placed on the page (layout arithmetic) and from measured ink,
        never from the OCR result. Tolerance: 0.6 word-heights horizontally (Tesseract word boxes can start half a glyph late,
        measured separately) and 0.35 vertically."""
        from PIL import ImageChops
        text_line = TRUTH.split("\n")[1]                                   # "Service Tag ABC123XYZ"
        blank = Image.new("RGB", (1800, 800), "white")
        only = blank.copy()
        ImageDraw.Draw(only).multiline_text((70, 110), "\n" + text_line, fill="black", font=ImageFont.truetype(FONT, 50), spacing=30)
        ink = ImageChops.difference(blank.convert("L"), only.convert("L")).point(lambda v: 255 if v > 60 else 0)
        cols = [x for x in range(ink.width) if ink.crop((x, 0, x + 1, ink.height)).getbbox()]
        start = max(cols[i + 1] for i in range(len(cols) - 1) if cols[i + 1] - cols[i] > 20)   # last word starts after the last wide gap
        word = ink.crop((start, 0, cols[-1] + 1, ink.height)).getbbox()
        u, v = (start + cols[-1] + 1) / 2 / 1800, ((word[1] + word[3]) / 2) / 800                  # marker word centre inside the bitmap
        cases = [((0, 0, 612, 792), None, 0), ((0, 0, 612, 792), (50, 100, 562, 700), 0), ((0, 0, 842, 595), None, 90),
                 ((0, 0, 612, 792), (50, 100, 562, 700), 180), ((20, 30, 500, 800), (60, 80, 460, 700), 270)]
        for media, crop, rotate in cases:
            w = (media[2] - media[0]) - 60
            x0, y0, h = media[0] + 30, media[1] + 150, w * 800 / 1800
            jpeg = io.BytesIO()
            label().save(jpeg, "JPEG", quality=92)
            raw = jpeg.getvalue()
            content = f"q {w} 0 0 {h} {x0} {y0} cm /Im1 Do Q".encode()
            box = crop or media
            crop_entry = f" /CropBox [{' '.join(map(str, crop))}]" if crop else ""
            page_dict = (f"<< /Type /Page /Parent 2 0 R /MediaBox [{' '.join(map(str, media))}]{crop_entry} /Rotate {rotate} "
                         f"/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>").encode()
            objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", page_dict,
                       f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
                       f"<< /Type /XObject /Subtype /Image /Width 1800 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(raw)} >>\nstream\n".encode() + raw + b"\nendstream"]
            out, offsets = b"%PDF-1.4\n", []
            for number, body in enumerate(objects, 1):
                offsets.append(len(out))
                out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
            at = len(out)
            out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
            out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{at}\n%%EOF\n".encode()
            self.path.write_bytes(out)
            page = extract(self.path, "application/pdf", {**POLICY, "quality": "balanced"})["pages"][0]
            canvas = page["engine"]["canvas"]
            hit = next(w_ for w_ in page["words"] if "ABC123XYZ" in w_["text"])
            ux, uy = x0 + u * w, y0 + (1 - v) * h                                      # user space, origin bottom-left
            fx, fy = (ux - box[0]) / (box[2] - box[0]), 1 - (uy - box[1]) / (box[3] - box[1])
            fx, fy = {0: (fx, fy), 90: (1 - fy, fx), 180: (1 - fx, 1 - fy), 270: (fy, 1 - fx)}[rotate]
            dx = abs(hit["x"] + hit["width"] / 2 - fx * canvas["width"])
            dy = abs(hit["y"] + hit["height"] / 2 - fy * canvas["height"])
            self.assertLessEqual(dx, 0.6 * hit["height"], (media, crop, rotate, "x", dx, hit["height"]))
            self.assertLessEqual(dy, 0.35 * hit["height"], (media, crop, rotate, "y", dy, hit["height"]))
            # The searchable copy must put the same word at the same place of the visible page (crop box and rotation included).
            pages = [{"unit": 1, "source": "ocr", "words": page["words"], "canvas": canvas, "orientation": page["engine"].get("analysis", {}).get("orientation", 0)}]
            derived = Path(self.temp.name) / "geometry.pdf"
            build_searchable_pdf(self.path, derived, pages, POLICY, self.temp.name)
            bbox = command(["pdftotext", "-bbox", str(derived), "-"], 20)
            size = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', bbox)
            word_box = re.search(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">ABC123XYZ', bbox)
            self.assertTrue(word_box, (media, crop, rotate, bbox[:600]))
            page_w, page_h = float(size[1]), float(size[2])
            pdx = abs((float(word_box[1]) + float(word_box[3])) / 2 - fx * page_w)
            pdy = abs((float(word_box[2]) + float(word_box[4])) / 2 - fy * page_h)
            tolerance = 0.6 * hit["height"] * page_w / canvas["width"]
            self.assertLessEqual(pdx, tolerance, (media, crop, rotate, "copy x", pdx, tolerance))
            self.assertLessEqual(pdy, 0.6 * tolerance, (media, crop, rotate, "copy y", pdy))
            MEASUREMENTS.append({"pdfGeometry": [list(media), crop, rotate, round(dx, 1), round(dy, 1), round(hit["height"], 1)]})

    def test_searchable_text_layer_keeps_unicode_exactly_and_counts_what_it_cannot_encode(self):
        from worker import ocr_page_pdf
        words = [{"text": t, "x": 50, "y": 40 + 60 * i, "width": 40 * len(t), "height": 40, "confidence": 90}
                 for i, t in enumerate(["Año", "ñandú", "¿Qué?", "€1.250,50", "£9", "áéíóú", "Ünï", "straße", "★", "naïve—fin", "a(b)c\d"])]
        jpeg = io.BytesIO()
        Image.new("RGB", (60, 80), "white").save(jpeg, "JPEG")
        pdf_bytes, lost = ocr_page_pdf(jpeg.getvalue(), (60, 80), (600, 800), words, {"width": 600, "height": 800})
        self.assertEqual(lost, 0)
        path = Path(self.temp.name) / "unicode.pdf"
        path.write_bytes(pdf_bytes)
        text = command(["pdftotext", "-enc", "UTF-8", str(path), "-"], 20)
        for word in words:
            self.assertIn(word["text"], text)
        many = [{"text": "".join(chr(0x4e00 + n + 40 * i) for n in range(40)), "x": 10, "y": 10 + 15 * i, "width": 500, "height": 12, "confidence": 90} for i in range(8)]
        _, lost = ocr_page_pdf(jpeg.getvalue(), (60, 80), (600, 800), many, {"width": 600, "height": 800})
        self.assertGreater(lost, 0)                                  # beyond the spare codes of one page: dropped and reported, never substituted

    def test_encrypted_protected_and_signed_pdfs_are_refused_or_flagged_never_bypassed(self):
        import hashlib

        def rc4(key, data):
            state, j = list(range(256)), 0
            for i in range(256):
                j = (j + state[i] + key[i % len(key)]) % 256
                state[i], state[j] = state[j], state[i]
            out, i, j = bytearray(), 0, 0
            for byte in data:
                i = (i + 1) % 256
                j = (j + state[i]) % 256
                state[i], state[j] = state[j], state[i]
                out.append(byte ^ state[(state[i] + state[j]) % 256])
            return bytes(out)

        pad = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")

        def encrypted(user_password, permissions):
            """Standard security handler, revision 2 (RC4 40-bit), built only to prove the worker refuses such files."""
            owner = hashlib.md5(pad).digest() * 2
            file_id = bytes(range(16))
            key = hashlib.md5((user_password + pad)[:32] + owner + permissions.to_bytes(4, "little", signed=True) + file_id).digest()[:5]
            user = rc4(key, pad)
            objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                       b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>"]
            out, offsets = b"%PDF-1.4\n", []
            for number, body in enumerate(objects, 1):
                offsets.append(len(out))
                out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
            enc = f"<< /Filter /Standard /V 1 /R 2 /O <{owner.hex()}> /U <{user.hex()}> /P {permissions} >>".encode()
            offsets.append(len(out))
            out += b"4 0 obj\n" + enc + b"\nendobj\n"
            at = len(out)
            out += f"xref\n0 5\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
            out += f"trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<{file_id.hex()}> <{file_id.hex()}>] >>\nstartxref\n{at}\n%%EOF\n".encode()
            return out

        scanned = [{"unit": 1, "source": "ocr", "words": [{"text": "x", "x": 1, "y": 1, "width": 5, "height": 5}], "canvas": {"width": 100, "height": 100}}]
        out = Path(self.temp.name) / "out.pdf"
        for label_, password, permissions in (("restrictions only (empty user password)", b"", -3904), ("password protected", b"secret", -3904)):
            self.path.write_bytes(encrypted(password, permissions))
            with self.assertRaises(ProcessingError) as refused:
                build_searchable_pdf(self.path, out, scanned, POLICY, self.temp.name)
            self.assertEqual(refused.exception.code, "ENCRYPTED", label_)
            self.assertFalse(out.exists())
            with self.assertRaises(ProcessingError):                     # text extraction does not bypass it either
                extract(self.path, "application/pdf", POLICY)
        make_pdf(self.path, ["image"])
        self.path.write_bytes(self.path.read_bytes() + b"99 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 10 20 30] /Contents <00> >>\nendobj\n")
        result = extract(self.path, "application/pdf", POLICY)
        pages = [{"unit": p["unit"], "source": p["source"], "words": p["words"], "canvas": p["engine"].get("canvas")} for p in result["pages"]]
        self.assertTrue(build_searchable_pdf(self.path, out, pages, POLICY, self.temp.name)["signed"])   # flagged: the copy is not the signed document

    def test_hostile_inputs_fail_in_a_controlled_way_without_side_effects(self):
        """Each case must end in a ProcessingError (or empty text) quickly, never a crash, a network call or a host path read."""
        import struct
        import zlib
        png = io.BytesIO()
        label().save(png, "PNG")
        good = png.getvalue()
        header = lambda w, h: b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0) + struct.pack(">I", zlib.crc32(b"IHDR" + struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        jpeg = io.BytesIO()
        label().save(jpeg, "JPEG")
        exif = Image.Exif()
        exif[0x010E] = "A" * 60000                                         # oversized metadata field
        bloated = io.BytesIO()
        label().save(bloated, "JPEG", exif=exif)
        svg_remote = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="http://127.0.0.1:9/x.png"/><text>SVG-LOCAL</text></svg>'
        docm = Path(self.temp.name) / "macro.docm"
        with zipfile.ZipFile(docm, "w") as archive:
            archive.writestr("word/document.xml", '<w:document xmlns:w="w"><w:p><w:r><w:t>MACRO-DOC</w:t></w:r></w:p></w:document>')
            archive.writestr("word/vbaProject.bin", b"\xd0\xcf\x11\xe0 Shell(\"calc\")")
        cases = {
            "truncated png": (good[: len(good) // 3], "image/png", {"PARSER", "UNSUPPORTED"}),
            "truncated jpeg": (jpeg.getvalue()[: len(jpeg.getvalue()) // 2], "image/jpeg", {"PARSER", "UNSUPPORTED", None}),
            "png header claiming 60000x60000": (header(60000, 60000) + good[33:], "image/png", {"LIMIT", "PARSER", "UNSUPPORTED"}),
            "png with a pdf extension-like wrong mime": (good, "application/pdf", {"UNSUPPORTED"}),
            "random bytes as pdf": (b"%PDF-1.4\n" + bytes(range(256)) * 40, "application/pdf", {"PARSER", "UNSUPPORTED", "TIMEOUT"}),
            "empty file": (b"", "image/png", {"UNSUPPORTED", "PARSER", "LIMIT"}),
        }
        for name, (data, mime, accepted) in cases.items():
            self.path.write_bytes(data)
            try:
                result = extract(self.path, mime, POLICY)
                self.assertIn(None, accepted, name)                      # a parse that succeeded must be an accepted outcome
                self.assertLess(sum(len(p["text"]) for p in result["pages"]), 1000, name)
            except ProcessingError as error:
                self.assertIn(error.code, accepted, name)
        self.path.write_bytes(bloated.getvalue())
        extract(self.path, "image/jpeg", POLICY)                          # big EXIF is ignored, the image is still read
        self.path.write_bytes(svg_remote)
        page = extract(self.path, "image/svg+xml", POLICY)["pages"][0]    # text only: the remote reference is never followed
        self.assertIn("SVG-LOCAL", page["text"])
        self.assertEqual(page["words"], [])
        text = extract(docm, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", POLICY)["pages"][0]["text"]
        self.assertEqual(text, "MACRO-DOC")                               # macros are neither read nor executed
        bomb = Path(self.temp.name) / "bomb.docx"
        with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", "<w:document xmlns:w=\"w\"><w:p><w:r><w:t>" + "A" * 30_000_000 + "</w:t></w:r></w:p></w:document>")
        with self.assertRaises(ProcessingError):
            extract(bomb, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", POLICY)
        files_before = set(Path(tempfile.gettempdir()).glob("content-*"))
        self.path.write_bytes(b"%PDF-1.4\n" + b"0" * 100)
        with self.assertRaises(ProcessingError):
            extract(self.path, "application/pdf", POLICY)
        self.assertEqual(set(Path(tempfile.gettempdir()).glob("content-*")), files_before)   # no temp tree left behind after a failure

    def test_zip_bomb_and_xml_entities_rejected(self):
        with zipfile.ZipFile(self.path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", "A" * 1000000)
        with self.assertRaises(ProcessingError):
            extract(self.path, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", POLICY)
        for data in (b'<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',
                     '<!DOCTYPE x [<!ENTITY a "bad">]><x>&a;</x>'.encode("utf-16")):
            with self.assertRaises(ProcessingError):
                safe_xml(data)

    def test_file_pixel_and_type_limits(self):
        label().save(self.path, "PNG")
        with self.assertRaises(ProcessingError):
            extract(self.path, "image/png", {**POLICY, "maxFileBytes": 10})
        with self.assertRaises(Exception):
            extract(self.path, "image/png", {**POLICY, "maxPixels": 100000})
        self.path.write_bytes(b"%PDF-1.4 not an image")
        with self.assertRaises(ProcessingError):
            extract(self.path, "image/png", POLICY)
        Image.new('RGB',(10,10)).save(self.path,'BMP')
        with self.assertRaises(ProcessingError) as error:
            extract(self.path,'image/png',POLICY)
        self.assertEqual(error.exception.code,'UNSUPPORTED')

    def test_command_timeout(self):
        with self.assertRaises(ProcessingError) as error:
            command(["python3", "-c", "import time; time.sleep(5)"], 0.1)
        self.assertEqual(error.exception.code, "TIMEOUT")

    def test_job_deadline_kills_python_and_native_group(self):
        def hung_job():
            import worker
            worker.api = lambda *args, **kwargs: b'synthetic'
            worker.extract = lambda *args, **kwargs: time.sleep(5)
            worker.run_job({'id': 'synthetic', 'lease': 'synthetic', 'mimeType': 'text/plain',
                            'policy': {**POLICY, 'timeoutSeconds': 0.2}})
        process = multiprocessing.Process(target=hung_job)
        process.start()
        process.join(2)
        if process.is_alive():
            process.kill()
            process.join()
            self.fail('Job exceeded its hard deadline')
        self.assertEqual(process.exitcode, -9)


if __name__ == "__main__":
    started = time.monotonic()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Corpus)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    memory_limit, _, cpu_limit = resources()
    print(json.dumps({"measurements": MEASUREMENTS, "peakRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                      "nativeChildPeakRssKiB": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                      "containerMemoryPeakBytes": cgroup_number('memory.peak'), "memoryLimitBytes": memory_limit,
                      "cpuLimit": cpu_limit, "suiteSeconds": round(time.monotonic()-started, 3)}, ensure_ascii=False))
    raise SystemExit(not result.wasSuccessful())
