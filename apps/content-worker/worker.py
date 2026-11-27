"""Local-only document extraction. No document controls subprocess arguments or URLs."""
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse
import warnings
import zipfile
from xml.etree import ElementTree as ET

from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageSequence, ImageStat, UnidentifiedImageError

ENGINE = "runly-local-2"
MAX_TEXT = 1_000_000
OMP_ENV = {**os.environ, "OMP_THREAD_LIMIT": "1", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"}
warnings.simplefilter("error", Image.DecompressionBombWarning)


class ProcessingError(Exception):
    def __init__(self, code):
        self.code = code


def command(argv, timeout=30, max_bytes=8_000_000):
    # File-backed output bounds parent RAM; RLIMIT_FSIZE bounds parser output.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(argv, stdout=output, stderr=errors, env=OMP_ENV)
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise ProcessingError("TIMEOUT") from None
        if process.returncode:
            raise ProcessingError("PARSER")
        if output.tell() > max_bytes:
            raise ProcessingError("LIMIT")
        output.seek(0)
        return output.read(max_bytes + 1).decode("utf-8", errors="replace")


def safe_xml(data):
    if len(data) > 16_000_000 or b"\x00" in data or re.search(br"<!\s*(DOCTYPE|ENTITY)", data, re.I):
        raise ProcessingError("LIMIT")
    return ET.fromstring(data)


def xml_text(data):
    root = safe_xml(data)
    # Exclude executable/style nodes even though XML is never rendered or executed.
    return " ".join(text.strip() for node in root.iter()
                    if node.tag.rsplit("}", 1)[-1] not in ("script", "style")
                    for text in ([node.text] if node.text else []) if text.strip())


def _numbered(names, pattern):
    return sorted((n for n in names if re.fullmatch(pattern, n)), key=lambda n: int(re.search(r"(\d+)\.xml$", n)[1]))


def _paragraphs(root):
    # Table cells are paragraphs too; a row's cells are joined by " | " so the reading order stays row by row.
    out = []
    for node in root.iter():
        if node.tag.endswith("}tr"):
            cells = ["".join(t.text or "" for t in c.iter() if t.tag.endswith("}t")) for c in node if c.tag.endswith("}tc")]
            out.append(" | ".join(c for c in cells if c))
    in_table = {id(p) for tr in root.iter() if tr.tag.endswith("}tr") for p in tr.iter() if p.tag.endswith("}p")}
    body = []
    for p in root.iter():
        if p.tag.endswith("}p") and id(p) not in in_table:
            body.append("".join(n.text or "" for n in p.iter() if n.tag.endswith("}t")))
    return body, out


def _sheet_names(archive, names):
    # workbook.xml order + relationships give the real sheet names; never evaluates anything.
    try:
        rels = {r.get("Id"): r.get("Target") for r in safe_xml(archive.read("xl/_rels/workbook.xml.rels"))}
        mapping = {}
        for sheet in safe_xml(archive.read("xl/workbook.xml")).iter():
            if sheet.tag.endswith("}sheet"):
                target = rels.get(sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"), "")
                path = "xl/" + target.lstrip("/").removeprefix("xl/")
                if path in names:
                    mapping[path] = sheet.get("name", "")
        return mapping
    except (KeyError, ET.ParseError):
        return {}


def office_pages(path, mime, limit):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 2000 or sum(entry.file_size for entry in entries) > 64_000_000:
            raise ProcessingError("LIMIT")
        if any(entry.file_size > 16_000_000 or entry.flag_bits & 1
               or entry.file_size > max(1, entry.compress_size) * 200 for entry in entries):
            raise ProcessingError("LIMIT")
        names = set(archive.namelist())
        if "wordprocessingml" in mime:
            if "word/document.xml" not in names:
                raise ProcessingError("UNSUPPORTED")
            body, rows = _paragraphs(safe_xml(archive.read("word/document.xml")))
            parts = [("Documento", "\n".join(body + rows))]
            # Headers and footers are separate references so a hit says where the text lives.
            for kind, label in (("header", "Encabezado"), ("footer", "Pie de página")):
                for name in _numbered(names, rf"word/{kind}\d+\.xml")[:limit]:
                    body, rows = _paragraphs(safe_xml(archive.read(name)))
                    text = "\n".join(body + rows).strip()
                    if text:
                        parts.append((label, text))
            return parts, False
        if "presentationml" in mime:
            slides = _numbered(names, r"ppt/slides/slide\d+\.xml")
            return [(f"Diapositiva {i+1}", xml_text(archive.read(name)))
                    for i, name in enumerate(slides[:limit])], len(slides) > limit
        if "spreadsheetml" in mime:
            shared = []
            if "xl/sharedStrings.xml" in names:
                shared = ["".join(n.text or "" for n in item.iter() if n.tag.endswith("}t"))
                          for item in safe_xml(archive.read("xl/sharedStrings.xml"))]
            sheets = _numbered(names, r"xl/worksheets/sheet\d+\.xml")
            titles = _sheet_names(archive, names)
            pages = []
            for name in sheets[:limit]:
                cells = []
                for cell in safe_xml(archive.read(name)).iter():
                    if not cell.tag.endswith("}c") or cell.get("t") == "e":
                        continue
                    # Only the cached value is read; <f> formulas are never evaluated.
                    value = next((n.text or "" for n in cell if n.tag.endswith("}v")), "")
                    if cell.get("t") == "s" and value.isdigit() and int(value) < len(shared):
                        value = shared[int(value)]
                    elif cell.get("t") == "inlineStr":
                        value = "".join(n.text or "" for n in cell.iter() if n.tag.endswith("}t"))
                    elif cell.get("t") == "b":
                        value = "VERDADERO" if value == "1" else "FALSO"
                    if value:
                        cells.append(f"{cell.get('r', '?')}: {value}")
                pages.append((titles.get(name) or name, "\n".join(cells)))
            return pages, len(sheets) > limit
    raise ProcessingError("UNSUPPORTED")


def model_info():
    folders = [Path("/opt/content-tessdata-fast"), Path("/usr/share/tesseract-ocr/5/tessdata"), Path("/usr/share/tessdata")]
    models = {}
    for folder in folders:
        for model in folder.glob("*.traineddata"):
            models[model.stem] = hashlib.sha256(model.read_bytes()).hexdigest()
    for model in Path('/opt/content-tessdata-best').glob('*.traineddata'):
        models['best:' + model.stem] = hashlib.sha256(model.read_bytes()).hexdigest()
    return models


def page_result(unit, reference, text, source="digital", words=None, confidence=None, languages="", quality="balanced", canvas=None, second_passes=0):
    if len(text) > 200000:
        raise ProcessingError("LIMIT")
    return {"unit": unit, "reference": reference, "text": text, "source": source,
            "words": words or [], "confidence": confidence,
            "engine": {"version": ENGINE, "languages": languages, "model":
                       ("tessdata_best:e2aad9b983032bb1beff9133104a67cdbb87ca4d" if quality == "accurate" else "tessdata_fast:65727574dfcd264acbb0c3e07860e4e9e9b22185") if source == "ocr" else "native",
                       **({"canvas": canvas} if canvas else {}), "secondPasses": second_passes}}


def tesseract(image, directory, languages, psm, timeout, quality):
    image_path = Path(directory) / "prepared.png"
    image.save(image_path)
    model_args = ["--tessdata-dir", "/opt/content-tessdata-best"] if quality == 'accurate' else []
    raw = command(["tesseract", str(image_path), "stdout", *model_args, "-l", languages, "--psm", str(psm),
                   "-c", "tessedit_create_tsv=1", "-c", "tessedit_create_txt=0"], timeout)
    words = []
    lines = {}
    for row in csv.DictReader(io.StringIO(raw), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        confidence = float(row.get("conf", -1))
        if not text or confidence < 0:
            continue
        words.append({"text": text[:500], "x": int(row["left"]), "y": int(row["top"]),
                      "width": int(row["width"]), "height": int(row["height"]), "confidence": min(100, confidence)})
        key = (row.get("block_num"), row.get("par_num"), row.get("line_num"))
        lines.setdefault(key, []).append(text)
        if len(words) > 20000:
            raise ProcessingError("LIMIT")
    text = "\n".join(" ".join(line) for line in lines.values())
    average = sum(w["confidence"] * len(w["text"]) for w in words) / max(1, sum(len(w["text"]) for w in words))
    return text, words, average


def recognition_score(result):
    # Coverage matters: one confident word must not replace a complete readable line.
    return sum(len(word['text'])*max(0,word['confidence']-40)/60 for word in result[1])


def adaptive_binary(gray):
    local = gray.filter(ImageFilter.BoxBlur(15))
    return ImageChops.subtract(local,gray).point(lambda difference: 0 if difference>10 else 255)


def recognize(image, directory, policy, details=None):
    if image.width * image.height > policy["maxPixels"]:
        raise ProcessingError("LIMIT")
    image = ImageOps.exif_transpose(image).convert("RGB")
    if details is not None:
        details.update(width=image.width, height=image.height, secondPasses=0)
    transforms = []
    # Map processed boxes back to the displayed original (after EXIF orientation).
    def rotate(angle):
        nonlocal image
        before = image.size
        image = image.rotate(angle, expand=True, fillcolor="white", resample=Image.Resampling.BICUBIC)
        transforms.append(("rotate", angle, before, image.size))
    if policy["quality"] != "fast" and min(image.size) >= 200:
        image.save(Path(directory) / "orientation.png")
        try:
            osd = command(["tesseract", str(Path(directory) / "orientation.png"), "stdout", "--psm", "0"], 10)
            match = re.search(r"Rotate: (\d+)", osd)
            if match and int(match[1]):
                rotate(-int(match[1]))
        except ProcessingError:
            pass  # Sparse labels often cannot support reliable orientation detection.
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    if policy["quality"] != "fast":
        # Bounded deskew search on a thumbnail, only when projection gain is meaningful.
        thumb = gray.copy()
        thumb.thumbnail((600, 600))
        def projection_score(angle):
            candidate = thumb.rotate(angle, fillcolor=255)
            rows = candidate.point(lambda p: 255 if p < 150 else 0).resize((1, candidate.height), Image.Resampling.BOX)
            values = list(rows.getdata())
            return sum((values[i] - values[i-1]) ** 2 for i in range(1, len(values)))
        base = projection_score(0)
        angle = max(range(-4, 5), key=projection_score)
        if angle and projection_score(angle) > base * 1.25:
            rotate(angle)
            gray = ImageOps.autocontrast(ImageOps.grayscale(image))
    # Remove large empty scanner margins, retaining the inverse offset for word boxes.
    bounds = gray.point(lambda p: 255 if p < 225 else 0).getbbox()
    if bounds and (bounds[2]-bounds[0]) * (bounds[3]-bounds[1]) < gray.width * gray.height * 0.25:
        left, top = max(0, bounds[0]-24), max(0, bounds[1]-24)
        gray = gray.crop((left, top, min(gray.width, bounds[2]+24), min(gray.height, bounds[3]+24)))
        transforms.append(('crop', left, top))
    scale = min(2.0 if min(gray.size) < 1000 else 1.0,
                math.sqrt(policy["maxPixels"] / (gray.width * gray.height)))
    if scale > 1.01:
        before = gray.size
        gray = gray.resize((int(gray.width * scale), int(gray.height * scale)), Image.Resampling.LANCZOS)
        transforms.append(("scale", before, gray.size))
    languages = "+".join(policy["languages"])
    best = tesseract(gray, directory, languages, 3, min(45, policy["timeoutSeconds"]), policy["quality"])
    if policy["quality"] != "fast" and (best[2] < 78 or len(best[0]) < 20):
        variant = gray.filter(ImageFilter.MedianFilter(3)) if ImageStat.Stat(gray).stddev[0] < 55 else gray
        alternative = tesseract(variant, directory, languages, 11, min(45, policy["timeoutSeconds"]), policy["quality"])
        if details is not None:
            details['secondPasses'] += 1
        if recognition_score(alternative) > recognition_score(best) and alternative[0].strip():
            best = alternative
    if policy["quality"] == "accurate" and best[2] < 85:
        variant = adaptive_binary(gray) if ImageStat.Stat(gray).stddev[0]<65 else gray.point(lambda p: 0 if p < 160 else 255)
        alternative = tesseract(variant, directory, languages, 6, min(60, policy["timeoutSeconds"]), policy["quality"])
        if details is not None:
            details['secondPasses'] += 1
        if recognition_score(alternative) > recognition_score(best) and alternative[0].strip():
            best = alternative
    def inverse(x, y):
        for transform in reversed(transforms):
            if transform[0] == 'crop':
                x, y = x+transform[1], y+transform[2]
            elif transform[0] == "scale":
                x *= transform[1][0] / transform[2][0]
                y *= transform[1][1] / transform[2][1]
            else:
                _, angle, before, after = transform
                c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
                dx, dy = x - after[0] / 2, y - after[1] / 2
                x, y = c * dx - s * dy + before[0] / 2, s * dx + c * dy + before[1] / 2
        return max(0, x), max(0, y)
    for word in best[1]:
        corners = [inverse(x, y) for x in (word["x"], word["x"] + word["width"])
                   for y in (word["y"], word["y"] + word["height"])]
        word.update(x=min(c[0] for c in corners), y=min(c[1] for c in corners),
                    width=max(c[0] for c in corners)-min(c[0] for c in corners),
                    height=max(c[1] for c in corners)-min(c[1] for c in corners))
    return best


HEIF_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1"}


def heif_kind(data):
    """Detect ISO-BMFF stills by the real `ftyp` brands, never by the declared MIME or extension.
    Returns "heif" (HEVC family), "avif" (not decodable here) or None."""
    if len(data) < 16 or data[4:8] != b"ftyp":
        return None
    size = int.from_bytes(data[:4], "big")
    end = min(len(data), size if 16 <= size <= 512 else 64)
    brands = {data[8:12], *(data[i:i + 4] for i in range(16, end - 3, 4))}
    if brands & {b"avif", b"avis"}:
        return "avif"
    return "heif" if brands & HEIF_BRANDS else None


def decode_heif(path, policy):
    """Primary image only, upright (libheif applies irot/imir), 8-bit RGB. Auxiliary/depth/thumbnail images are never decoded.
    Returns (image, extra_images)."""
    try:
        import pillow_heif
    except ImportError:
        raise ProcessingError("UNSUPPORTED") from None
    pillow_heif.options.DECODE_THREADS = 1
    pillow_heif.options.THUMBNAILS = pillow_heif.options.DEPTH_IMAGES = pillow_heif.options.AUX_IMAGES = False
    try:
        heif = pillow_heif.open_heif(str(path), convert_hdr_to_8bit=True)
        width, height = heif.size
        if width * height > policy["maxPixels"]:  # checked on the header, before any pixel is decoded
            raise ProcessingError("LIMIT")
        return heif.to_pillow().convert("RGB"), max(0, len(heif) - 1)
    except ProcessingError:
        raise
    except (ValueError, SyntaxError, OSError, RuntimeError, MemoryError):
        raise ProcessingError("PARSER") from None


def extract(path, mime, policy, progress=lambda value: None, checkpoint=None, resume_units=()):
    data = Path(path).read_bytes()
    if len(data) > policy["maxFileBytes"]:
        raise ProcessingError("LIMIT")
    Image.MAX_IMAGE_PIXELS = policy["maxPixels"]
    pages, partial = [], False
    completed = set(resume_units)
    characters = 0
    second_passes = 0
    def emit(page, total):
        nonlocal characters, second_passes
        if page['unit'] in completed:
            return
        characters += len(page['text'])
        second_passes += page['engine'].get('secondPasses',0)
        if characters > MAX_TEXT:
            raise ProcessingError('LIMIT')
        if checkpoint:
            checkpoint(page,total)
        else:
            pages.append(page)
    with tempfile.TemporaryDirectory(prefix="content-") as directory:
        if data.startswith(b"%PDF-"):
            if mime != "application/pdf":
                raise ProcessingError("UNSUPPORTED")
            info = command(["pdfinfo", str(path)], 10)
            count = int(re.search(r"Pages:\s+(\d+)", info)[1])
            partial = count > policy["maxPages"]
            for unit in range(1, min(count, policy["maxPages"]) + 1):
                if unit in completed:
                    continue
                text = command(["pdftotext", "-f", str(unit), "-l", str(unit), "-layout", "-enc", "UTF-8", str(path), "-"], 20).strip()
                if text and policy.get('digitalExtraction', True):
                    emit(page_result(unit, f"Página {unit}", text), min(count, policy['maxPages']))
                elif policy["allowOcr"] and policy.get('pdfOcr', True):
                    prefix = str(Path(directory) / "page")
                    # scale-to prevents giant pages allocating unbounded raster memory.
                    raster_edge = min(3500, int(math.sqrt(policy["maxPixels"])))
                    command(["pdftoppm", "-f", str(unit), "-l", str(unit), "-singlefile", "-scale-to", str(raster_edge), "-png", str(path), prefix], 30)
                    with Image.open(prefix + ".png", formats=['PNG']) as image:
                        details = {}
                        text, words, confidence = recognize(image, directory, policy, details)
                    canvas = {'width':details['width'],'height':details['height'],'coordinateSpace':'pdf-raster'}
                    emit(page_result(unit, f"Página {unit}", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses']),min(count,policy['maxPages']))
                    Path(prefix + ".png").unlink(missing_ok=True)
                else:
                    # A digital-only pass must not report a scanned page as fully processed.
                    partial = True
                    if text:
                        emit(page_result(unit, f"Página {unit}", text),min(count,policy['maxPages']))
                progress(min(99, int(100 * unit / min(count, policy["maxPages"]))))
        elif data.startswith(b"PK\x03\x04"):
            if not policy.get('digitalExtraction', True):
                raise ProcessingError('UNSUPPORTED')
            if "openxmlformats-officedocument" not in mime:
                raise ProcessingError("UNSUPPORTED")
            units, partial = office_pages(path, mime, policy["maxPages"])
            for i, (reference,text) in enumerate(units):
                emit(page_result(i+1,reference,text),len(units))
        elif heif_kind(data[:512]):
            # HEIC/HEIF is recognized by content: a wrong MIME (iPhone uploads often arrive as octet-stream) must not hide it.
            if heif_kind(data[:512]) != "heif" or not policy["allowOcr"] or not policy.get('imageOcr', True):
                raise ProcessingError("UNSUPPORTED")
            image, extra = decode_heif(path, policy)
            partial = extra > 0  # burst/collection files: only the primary image is read
            details = {}
            text, words, confidence = recognize(image, directory, policy, details)
            canvas = {'width':details['width'],'height':details['height'],'coordinateSpace':'exif-oriented-image','source':'heif-primary'}
            emit(page_result(1, "Imagen 1", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses']),1)
        elif mime.startswith("image/") and mime != "image/svg+xml":
            if not policy["allowOcr"] or not policy.get('imageOcr', True):
                raise ProcessingError("UNSUPPORTED")
            try:
                opened=Image.open(path,formats=['JPEG','PNG','WEBP','TIFF'])
            except UnidentifiedImageError:
                raise ProcessingError('UNSUPPORTED') from None
            with opened as image:
                if image.format not in ("JPEG", "PNG", "WEBP", "TIFF"):
                    raise ProcessingError("UNSUPPORTED")
                partial = getattr(image, "n_frames", 1) > policy["maxPages"]
                for i, frame in enumerate(ImageSequence.Iterator(image)):
                    if i >= policy["maxPages"]:
                        break
                    if i+1 in completed:
                        continue
                    details = {}
                    text, words, confidence = recognize(frame, directory, policy, details)
                    canvas = {'width':details['width'],'height':details['height'],'coordinateSpace':'exif-oriented-image'}
                    total = min(getattr(image, 'n_frames', 1), policy["maxPages"])
                    emit(page_result(i+1, f"Imagen {i+1}", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses']),total)
                    progress(min(99, int(100 * (i+1) / total)))
        elif mime.startswith("text/") or mime in ("application/json", "application/xml", "image/svg+xml"):
            if not policy.get('digitalExtraction', True):
                raise ProcessingError('UNSUPPORTED')
            if b"\x00" in data or not data:
                raise ProcessingError("UNSUPPORTED")
            text = data.decode("utf-8-sig", errors="strict")
            if mime in ("application/xml", "text/xml", "image/svg+xml"):
                text = xml_text(data)
            emit(page_result(1, "Documento", text),1)
        else:
            raise ProcessingError("UNSUPPORTED")
    if sum(len(p["text"]) for p in pages) > MAX_TEXT:
        raise ProcessingError("LIMIT")
    return {"pages": pages, "partial": partial, 'metrics': {'secondPasses': second_passes, 'cpuMs':0, 'peakRssBytes':0}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ProcessingError("DOWNLOAD")


def api(path, body=None, lease=None, binary_limit=None):
    base = os.environ["RUNLY_CONTENT_API_URL"].rstrip("/")
    token = os.environ["RUNLY_CONTENT_WORKER_TOKEN"]
    target = urllib.parse.urlsplit(base)
    local_http = target.scheme == 'http' and target.hostname in ('api', 'localhost', '127.0.0.1', '::1', 'host.docker.internal')
    if (target.scheme != 'https' and not local_http) or target.username or target.password or target.query or target.fragment or len(token) < 32:
        raise RuntimeError("Configure a private API URL and worker token")
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    if lease:
        headers["X-Content-Lease"] = lease
    request = urllib.request.Request(base + "/content/worker/" + path,
                                     data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=25) as response:
        limit = binary_limit if binary_limit is not None else 2_000_000
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ProcessingError("LIMIT")
        return data if binary_limit is not None else json.loads(data)


def cgroup_number(name):
    try:
        value = Path("/sys/fs/cgroup/" + name).read_text().strip()
        return None if value == "max" else int(value)
    except (OSError, ValueError):
        return None


def resources():
    limit, used = cgroup_number("memory.max"), cgroup_number("memory.current")
    cpu = None
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if quota != "max":
            cpu = int(quota) / int(period)
    except (OSError, ValueError):
        pass
    return limit, used or 0, cpu


def stop_process(process):
    if process.is_alive():
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            process.kill()
    process.join()


def supervise(job, worker_id, capabilities):
    import multiprocessing
    # The parent owns the temporary tree: SIGKILL/OOM in the child cannot orphan it.
    with tempfile.TemporaryDirectory(prefix='content-job-') as workdir:
        process = multiprocessing.get_context('fork').Process(target=run_job,args=(job,workdir))
        process.start()
        start = time.monotonic()
        try:
            while process.is_alive():
                process.join(15)
                if not process.is_alive():
                    break
                _, used, _ = resources()
                capabilities['memoryUsed'] = used
                try:
                    api('heartbeat',{'id':worker_id,'capabilities':capabilities})
                    api(f"jobs/{job['id']}/heartbeat",{'progress':0},job['lease'])
                except Exception:
                    stop_process(process)
                    break
            if process.exitcode:
                code = 'TIMEOUT' if time.monotonic()-start>=job['policy']['timeoutSeconds'] else 'PARSER'
                try:
                    api(f"jobs/{job['id']}/result",{'pages':[],'errorCode':code},job['lease'])
                except Exception:
                    pass
        finally:
            stop_process(process)
            process.close()


def cpu_sample(previous):
    try:
        usage = int(dict(line.split() for line in Path('/sys/fs/cgroup/cpu.stat').read_text().splitlines())['usage_usec'])
        now = time.monotonic()
        _,_,limit = resources()
        percent = None
        if previous and limit and now>previous[1]:
            percent = max(0,100*(usage-previous[0])/(1000000*(now-previous[1])*limit))
        return (usage,now),percent
    except (OSError,KeyError,ValueError):
        return None,None


def next_cpu_debt(previous, percent, budget, elapsed):
    # Seconds of idle owed to the configured average CPU budget. Debt survives
    # heartbeat intervals: a long job at a 10% budget cannot resume after 10s.
    if percent is None or elapsed<=0:
        return previous
    return max(0,previous+(percent/max(1,budget)-1)*elapsed)


def governor_decision(limit, used, cpu, free_tmp, cpu_percent, cpu_debt, cpu_budget, was_resource_paused, was_cpu_paused):
    """Pure pause decision (no I/O) so it can be tested deterministically.

    Memory hysteresis: pause above 80% of the cgroup limit, resume below 65%.
    Missing cgroup limits or unreadable metrics fail closed ('no-limits').
    Returns (resource_paused, cpu_paused, reason).
    """
    if not limit or not cpu:
        return True, False, 'no-limits'
    if free_tmp < 100_000_000:
        return True, False, 'disk'
    if used > limit * (0.65 if was_resource_paused else 0.8):
        return True, False, 'memory'
    over = cpu_debt > 0.01 or (cpu_percent is not None and cpu_percent > (cpu_budget * 0.8 if was_cpu_paused else cpu_budget))
    return False, over, 'cpu' if over else 'ready'


def run_job(job, workdir=None):
    # Each job runs in its own process: deadline kills parsers AND Python ZIP/XML/image work.
    os.setsid()
    if workdir:
        tempfile.tempdir = workdir
    def deadline(_signum, _frame):
        os.killpg(os.getpgrp(), signal.SIGKILL)
    signal.signal(signal.SIGALRM, deadline)
    signal.setitimer(signal.ITIMER_REAL, job['policy']['timeoutSeconds'])
    payload = {"pages": [], "errorCode": "PARSER"}
    try:
        policy = job["policy"]
        memory_bytes = policy.get('memoryMiB',512)*1048576
        resource.setrlimit(resource.RLIMIT_AS,(memory_bytes,memory_bytes))
        threads = min(4,max(1,policy.get('threads',1)))
        OMP_ENV['OMP_THREAD_LIMIT'] = str(threads)
        OMP_ENV['OMP_NUM_THREADS'] = str(threads)
        raw = api(f"jobs/{job['id']}/source", lease=job["lease"], binary_limit=policy["maxFileBytes"])
        with tempfile.TemporaryDirectory(prefix="original-") as directory:
            path = Path(directory) / "source"
            path.write_bytes(raw)
            payload = extract(path, job["mimeType"], policy,
                              lambda value: api(f"jobs/{job['id']}/heartbeat", {"progress": value}, job["lease"]),
                              checkpoint=lambda page,total: api(f"jobs/{job['id']}/checkpoint", {'page':page,'totalUnits':total},job['lease']),
                              resume_units=job.get('resumeUnits',()))
    except MemoryError:
        payload = {'pages':[],'errorCode':'RESOURCES'}
    except ProcessingError as error:
        payload = {"pages": [], "errorCode": error.code}
    except urllib.error.HTTPError:
        payload = {"pages": [], "errorCode": "DOWNLOAD"}
    except Exception:
        pass
    try:
        own,children = resource.getrusage(resource.RUSAGE_SELF),resource.getrusage(resource.RUSAGE_CHILDREN)
        payload['metrics'] = {**payload.get('metrics', {}), 'cpuMs': int(1000*(own.ru_utime+own.ru_stime+children.ru_utime+children.ru_stime)),
                              'peakRssBytes': int(1024*max(own.ru_maxrss,children.ru_maxrss)), 'secondPasses':payload.get('metrics',{}).get('secondPasses',0)}
        api(f"jobs/{job['id']}/result", payload, job["lease"])
    except Exception:
        pass  # Expired/revoked leases cannot publish results; durable retry recovers.


def main():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (64_000_000, 64_000_000))
    models = model_info()
    worker_id = os.environ.get("RUNLY_CONTENT_WORKER_ID", "local-1")
    resource_paused = False
    cpu_paused = False
    cpu_debt = 0
    previous_cpu = None
    cpu_budget = 80
    def shutdown(_signum,_frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,shutdown)
    while True:
        try:
            limit, used, cpu = resources()
            free_tmp = os.statvfs(tempfile.gettempdir()).f_bavail * os.statvfs(tempfile.gettempdir()).f_frsize
            prior_cpu=previous_cpu
            previous_cpu,cpu_percent = cpu_sample(previous_cpu)
            elapsed=previous_cpu[1]-prior_cpu[1] if previous_cpu and prior_cpu else 0
            cpu_debt=next_cpu_debt(cpu_debt,cpu_percent,cpu_budget,elapsed)
            resource_paused,cpu_paused,_reason=governor_decision(limit,used,cpu,free_tmp,cpu_percent,cpu_debt,cpu_budget,resource_paused,cpu_paused)
            paused=resource_paused or cpu_paused
            capabilities = {"engine": ENGINE, "languages": sorted(k for k in models if ':' not in k), "models": models, "cpuLimit": cpu,
                            "memoryLimit": limit, "memoryUsed": used, "governor": "paused" if paused else "ready",'protocol':2,
                            'cpuUsedPercent':cpu_percent,'tempFreeBytes':free_tmp}
            api("heartbeat", {"id": worker_id, "capabilities": capabilities})
            if paused:
                time.sleep(10 if resource_paused else max(0.25,min(10,cpu_debt)))
                continue
            job = api("claim", {"id": worker_id}).get("data")
            if not job:
                time.sleep(5)
                continue
            if any(lang not in models for lang in job["policy"]["languages"]):
                api(f"jobs/{job['id']}/result", {"pages": [], "errorCode": "UNSUPPORTED"}, job["lease"])
                continue
            if job['policy']['quality'] == 'accurate' and any('best:' + lang not in models for lang in job['policy']['languages']):
                api(f"jobs/{job['id']}/result", {"pages": [], "errorCode": "UNSUPPORTED"}, job["lease"])
                continue
            cpu_budget = job['policy'].get('cpuBudgetPercent',80)
            supervise(job,worker_id,capabilities)
        except Exception:
            print("content-worker: connection or processing unavailable", flush=True)
            time.sleep(10)


if __name__ == "__main__":
    main()
