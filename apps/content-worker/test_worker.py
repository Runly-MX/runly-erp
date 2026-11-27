"""Synthetic, reproducible corpus. Run inside the worker image; no external data."""
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
from worker import ProcessingError, cgroup_number, command, extract, resources, safe_xml, next_cpu_debt
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
