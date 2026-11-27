"""Fixtures for vertical-formats.mjs, run inside the worker image (needs pillow-heif). Prints one JSON object of base64 files."""
import base64
import io
import json
import os
import random
import zipfile

import corpus
import pillow_heif

pillow_heif.register_heif_opener()
env = os.environ


def b64(data):
    return base64.b64encode(data).decode()


def office(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, xml in files.items():
            archive.writestr(name, xml)
    return buffer.getvalue()


buffer = io.BytesIO()
corpus.render(f"ETIQUETA RED\nSerial {env['MARKER']}\nModelo AP-AX3000", 48, random.Random(7)).save(buffer, 'HEIF', quality=85)
heic = buffer.getvalue()
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
print(json.dumps({
    'heic': b64(heic), 'corrupt': b64(heic[:900]),
    'docx': b64(office({'word/document.xml': f"<w:document {W}><w:body><w:p><w:r><w:t>Contrato {env['DOC']}</w:t></w:r></w:p></w:body></w:document>",
                        'word/header1.xml': f"<w:hdr {W}><w:p><w:r><w:t>{env['HEADER']}</w:t></w:r></w:p></w:hdr>"})),
    'xlsx': b64(office({'xl/worksheets/sheet1.xml': f"<worksheet {S}><sheetData><row r=\"2\"><c r=\"B2\" t=\"inlineStr\"><is><t>{env['SHEET']}</t></is></c></row></sheetData></worksheet>"})),
    'pptx': b64(office({'ppt/slides/slide1.xml': f"<p:sld {P}><a:t>{env['DECK']}</a:t></p:sld>"})),
}))
