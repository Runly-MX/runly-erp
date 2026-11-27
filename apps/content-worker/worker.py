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


def page_result(unit, reference, text, source="digital", words=None, confidence=None, languages="", quality="balanced", canvas=None, second_passes=0, analysis=None):
    if len(text) > 200000:
        raise ProcessingError("LIMIT")
    return {"unit": unit, "reference": reference, "text": text, "source": source,
            "words": words or [], "confidence": confidence,
            "engine": {"version": ENGINE, "languages": languages, "model":
                       ("tessdata_best:e2aad9b983032bb1beff9133104a67cdbb87ca4d" if quality == "accurate" else "tessdata_fast:65727574dfcd264acbb0c3e07860e4e9e9b22185") if source == "ocr" else "native",
                       **({"canvas": canvas} if canvas else {}), "secondPasses": second_passes,
                       **({"analysis": analysis} if analysis else {})}}


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


# Stray symbols glued to letters/digits ("FCWQUG4YR|3") are how Tesseract renders a misread identifier character.
JUNK = re.compile(r"[A-Za-z0-9][|¦!§\\[\]{}]+[A-Za-z0-9]|[A-Za-z0-9]{3,}[|¦§\]]$")


def junk_count(result):
    return sum(1 for word in result[1] if JUNK.search(word["text"]))


def better(candidate, best):
    """Choose between two readings without trusting length or mean confidence alone:
    1. fewer corrupted alphanumeric words wins (identifiers are what users search for), provided the candidate keeps most coverage;
    2. otherwise the coverage-weighted confidence score decides."""
    if not candidate[0].strip():
        return False
    junk_candidate, junk_best = junk_count(candidate), junk_count(best)
    if junk_candidate != junk_best:
        return junk_candidate < junk_best and recognition_score(candidate) >= 0.8 * recognition_score(best)
    return recognition_score(candidate) > recognition_score(best)


def analyze(gray):
    """Cheap, bounded image statistics (thumbnail only). Heuristics for choosing extra work, not a quality guarantee."""
    thumb = gray.copy()
    thumb.thumbnail((400, 400))
    edges = ImageStat.Stat(thumb.filter(ImageFilter.FIND_EDGES))
    return {"contrast": round(ImageStat.Stat(thumb).stddev[0], 1),
            "sharpness": round(edges.var[0], 1)}


def adaptive_binary(gray):
    local = gray.filter(ImageFilter.BoxBlur(15))
    return ImageChops.subtract(local,gray).point(lambda difference: 0 if difference>10 else 255)


def analysis_of(details):
    return {key: details[key] for key in ("contrast", "sharpness", "perspective") if key in details}


def solve_homography(rect, quad):
    """Eight Pillow PERSPECTIVE coefficients mapping rectified (output) points to source points. Plain Gaussian elimination."""
    rows = []
    for (x, y), (u, v) in zip(rect, quad):
        rows.append([x, y, 1, 0, 0, 0, -x * u, -y * u, u])
        rows.append([0, 0, 0, x, y, 1, -x * v, -y * v, v])
    for column in range(8):
        pivot = max(range(column, 8), key=lambda r: abs(rows[r][column]))
        if abs(rows[pivot][column]) < 1e-9:
            return None
        rows[column], rows[pivot] = rows[pivot], rows[column]
        rows[column] = [value / rows[column][column] for value in rows[column]]
        for r in range(8):
            if r != column:
                factor = rows[r][column]
                rows[r] = [a - factor * b for a, b in zip(rows[r], rows[column])]
    return [rows[i][8] for i in range(8)]


def project(coefficients, x, y):
    a, b, c, d, e, f, g, h = coefficients
    divisor = g * x + h * y + 1
    return (a * x + b * y + c) / divisor, (d * x + e * y + f) / divisor


def otsu(histogram, total):
    weight_total = sum(i * count for i, count in enumerate(histogram))
    background = sum_background = 0
    best, threshold = 0, 127
    for level in range(256):
        background += histogram[level]
        if not background or background == total:
            continue
        sum_background += level * histogram[level]
        mean_back, mean_front = sum_background / background, (weight_total - sum_background) / (total - background)
        between = background * (total - background) * (mean_back - mean_front) ** 2
        if between > best:
            best, threshold = between, level
    return threshold


def find_quad(gray):
    """Dominant quadrilateral (label/document on a contrasting surface) on a <=200px thumbnail, or None.
    Bounded heuristic: largest connected region of one polarity, corners = diagonal extremes, accepted only if the region
    fills most of its quad, the quad is convex, covers 12-90% of the frame, does not run off the frame and is visibly
    skewed. It never crops: rectification is only a candidate that must beat the original reading."""
    thumb = gray.copy()
    thumb.thumbnail((200, 200))
    width, height = thumb.size
    if width < 40 or height < 40:
        return None
    scale = gray.width / width
    pixels = list(thumb.getdata())
    threshold = otsu(thumb.histogram(), width * height)
    best = None
    for bright in (True, False):
        mask = bytearray(1 if (value > threshold) == bright else 0 for value in pixels)
        seen = bytearray(width * height)
        for start in range(width * height):
            if not mask[start] or seen[start]:
                continue
            stack, region = [start], []
            seen[start] = 1
            while stack:
                index = stack.pop()
                region.append(index)
                x, y = index % width, index // width
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        neighbor = ny * width + nx
                        if mask[neighbor] and not seen[neighbor]:
                            seen[neighbor] = 1
                            stack.append(neighbor)
            if len(region) < width * height * 0.08:
                continue
            xs, ys = [i % width for i in region], [i // width for i in region]
            borders = (min(xs) == 0) + (max(xs) == width - 1) + (min(ys) == 0) + (max(ys) == height - 1)
            if borders >= 2:
                continue  # the surface behind the subject, not the subject
            diagonal = [x + y for x, y in zip(xs, ys)]
            anti = [x - y for x, y in zip(xs, ys)]
            at = lambda values, pick: (xs[values.index(pick(values))], ys[values.index(pick(values))])
            corners = [at(diagonal, min), at(anti, max), at(diagonal, max), at(anti, min)]  # tl, tr, br, bl
            area = abs(sum(corners[i][0] * corners[(i + 1) % 4][1] - corners[(i + 1) % 4][0] * corners[i][1] for i in range(4))) / 2
            crosses = [(corners[(i + 1) % 4][0] - corners[i][0]) * (corners[(i + 2) % 4][1] - corners[(i + 1) % 4][1])
                       - (corners[(i + 1) % 4][1] - corners[i][1]) * (corners[(i + 2) % 4][0] - corners[(i + 1) % 4][0]) for i in range(4)]
            if not (width * height * 0.12 <= area <= width * height * 0.9) or len(region) < area * 0.6 \
                    or not (all(c > 0 for c in crosses) or all(c < 0 for c in crosses)):
                continue
            sides = [math.dist(corners[i], corners[(i + 1) % 4]) for i in range(4)]
            skew = max(max(sides[0], sides[2]) / max(1, min(sides[0], sides[2])), max(sides[1], sides[3]) / max(1, min(sides[1], sides[3])))
            tilt = max(abs(math.degrees(math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0]))),
                       abs(math.degrees(math.atan2(corners[2][1] - corners[3][1], corners[2][0] - corners[3][0]))))
            if (skew < 1.06 and tilt < 3) or min(sides) < min(width, height) * 0.2:
                continue
            if best is None or area > best[0]:
                best = (area, corners)
    return [(x * scale, y * scale) for x, y in best[1]] if best else None


def rectify(gray, quad, policy):
    top, bottom = math.dist(quad[0], quad[1]), math.dist(quad[3], quad[2])
    left, right = math.dist(quad[0], quad[3]), math.dist(quad[1], quad[2])
    width, height = max(top, bottom), max(left, right)
    shrink = min(1.0, math.sqrt(policy["maxPixels"] / (width * height)), 4000 / max(width, height))
    size = (max(16, int(width * shrink)), max(16, int(height * shrink)))
    coefficients = solve_homography([(0, 0), (size[0], 0), (size[0], size[1]), (0, size[1])], quad)
    if coefficients is None:
        return None, None
    return gray.transform(size, Image.Transform.PERSPECTIVE, coefficients, Image.Resampling.BICUBIC, fillcolor=255), coefficients


def recognize(image, directory, policy, details=None):
    if image.width * image.height > policy["maxPixels"]:
        raise ProcessingError("LIMIT")
    image = ImageOps.exif_transpose(image).convert("RGB")
    if details is not None:
        details.update(width=image.width, height=image.height, secondPasses=0, perspective="none")
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
    if details is not None:
        details.update(analyze(gray))
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
    if policy["quality"] != "fast" and (best[2] < 78 or len(best[0]) < 20 or junk_count(best)):
        variant = gray.filter(ImageFilter.MedianFilter(3)) if ImageStat.Stat(gray).stddev[0] < 55 else gray
        alternative = tesseract(variant, directory, languages, 11, min(45, policy["timeoutSeconds"]), policy["quality"])
        if details is not None:
            details['secondPasses'] += 1
        if better(alternative, best):
            best = alternative
    if policy["quality"] == "accurate" and (best[2] < 85 or junk_count(best)):
        variant = adaptive_binary(gray) if ImageStat.Stat(gray).stddev[0]<65 else gray.point(lambda p: 0 if p < 160 else 255)
        alternative = tesseract(variant, directory, languages, 6, min(60, policy["timeoutSeconds"]), policy["quality"])
        if details is not None:
            details['secondPasses'] += 1
        if better(alternative, best):
            best = alternative
    chain = transforms
    if policy["quality"] != "fast" and (best[2] < 80 or len(best[0]) < 20 or junk_count(best)):
        quad = find_quad(gray)
        if quad:
            rectified, coefficients = rectify(gray, quad, policy)
            if rectified is not None:
                alternative = tesseract(rectified, directory, languages, 3, min(45, policy["timeoutSeconds"]), policy["quality"])
                if details is not None:
                    details['secondPasses'] += 1
                    details['perspective'] = "candidate"
                if better(alternative, best):
                    best, chain = alternative, transforms + [("perspective", coefficients)]
                    if details is not None:
                        details['perspective'] = "applied"

    def inverse(x, y):
        for transform in reversed(chain):
            if transform[0] == 'perspective':
                x, y = project(transform[1], x, y)
            elif transform[0] == 'crop':
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
    projective = any(transform[0] == 'perspective' for transform in chain)
    for word in best[1]:
        corners = [inverse(x, y) for x, y in ((word["x"], word["y"]), (word["x"] + word["width"], word["y"]),
                                              (word["x"] + word["width"], word["y"] + word["height"]), (word["x"], word["y"] + word["height"]))]
        left, top = min(c[0] for c in corners), min(c[1] for c in corners)
        word.update(x=left, y=top, width=max(c[0] for c in corners) - left, height=max(c[1] for c in corners) - top)
        if projective:  # a rectangle cannot represent a projectively mapped word: keep the four real corners
            word["polygon"] = [round(value, 1) for corner in corners for value in corner]
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
                    emit(page_result(unit, f"Página {unit}", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses'],analysis_of(details)),min(count,policy['maxPages']))
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
            emit(page_result(1, "Imagen 1", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses'],analysis_of(details)),1)
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
                    emit(page_result(i+1, f"Imagen {i+1}", text, "ocr", words, confidence, "+".join(policy["languages"]), policy["quality"],canvas,details['secondPasses'],analysis_of(details)),total)
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


# Helvetica (standard-14) advance widths for ASCII 32..126, per 1000 em. Used only to scale the invisible text to the word box.
HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
             1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
             333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
SEARCHABLE_ENGINE = "runly-searchable-pdf-1"


def helvetica_width(text, size):
    return sum(HELVETICA[ord(c) - 32] if 32 <= ord(c) <= 126 else 556 for c in text) * size / 1000


def pdf_literal(text):
    """Windows-1252 literal string. Characters outside it become '?' and are counted: nothing is invented, only dropped."""
    raw = text.encode("cp1252", errors="replace")
    lost = sum(1 for c in text if c.encode("cp1252", errors="replace") == b"?" and c != "?")
    return b"(" + raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)") + b")", lost


def ocr_page_pdf(jpeg, image_size, page_size, words, canvas):
    """One-page PDF: the scan full-bleed plus an invisible (render mode 3) text layer aligned to each recognized word."""
    width, height = page_size
    sx, sy = width / canvas["width"], height / canvas["height"]
    stream, lost = [], 0
    for word in words:
        text = word["text"][:200]
        if not text.strip():
            continue
        size = max(1.0, word["height"] * sy * 0.85)
        natural = helvetica_width(text + " ", size)
        horizontal = max(10.0, min(400.0, 100 * (word["width"] * sx) / max(0.1, helvetica_width(text, size))))
        literal, dropped = pdf_literal(text + " ")
        lost += dropped
        x, y = word["x"] * sx, height - (word["y"] + word["height"]) * sy + word["height"] * sy * 0.2
        stream.append(f"BT /F1 {size:.2f} Tf {horizontal:.1f} Tz 1 0 0 1 {x:.2f} {y:.2f} Tm ".encode() + literal + b" Tj ET")
    content = f"q {width:.2f} 0 0 {height:.2f} 0 0 cm /Im1 Do Q\n3 Tr\n".encode() + b"\n".join(stream)
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width:.2f} {height:.2f}] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>".encode(),
               f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
               f"<< /Type /XObject /Subtype /Image /Width {image_size[0]} /Height {image_size[1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(jpeg)} >>\nstream\n".encode() + jpeg + b"\nendstream"]
    out, offsets = bytearray(b"%PDF-1.5\n"), []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out), lost


def build_searchable_pdf(source, out, ocr_pages, policy, directory):
    """Copy of a PDF where scanned pages gain an invisible text layer. Pages that already carry digital text are passed through
    untouched (pdfseparate/pdfunite), so no text layer is ever duplicated. Encrypted files are refused, never unlocked."""
    data = Path(source).read_bytes()
    if not data.startswith(b"%PDF-"):
        raise ProcessingError("UNSUPPORTED")
    info = command(["pdfinfo", str(source)], 10)
    if re.search(r"^Encrypted:\s+yes", info, re.M):
        raise ProcessingError("ENCRYPTED")
    count = int(re.search(r"Pages:\s+(\d+)", info)[1])
    if count > policy["maxPages"]:
        raise ProcessingError("LIMIT")
    signed = bool(re.search(rb"/ByteRange\s*\[|/Type\s*/Sig\b", data))
    scanned = {page["unit"]: page for page in ocr_pages if page.get("source") == "ocr" and page.get("words") and page.get("canvas")}
    if not scanned:
        raise ProcessingError("NOT_NEEDED")
    edge = min(3500, int(math.sqrt(policy["maxPixels"])))
    pieces, dropped = [], 0
    for unit in range(1, count + 1):
        piece = Path(directory) / f"piece-{unit}.pdf"
        if unit in scanned:
            prefix = str(Path(directory) / f"raster-{unit}")
            command(["pdftoppm", "-f", str(unit), "-l", str(unit), "-singlefile", "-scale-to", str(edge), "-png", str(source), prefix], 30)
            with Image.open(prefix + ".png", formats=["PNG"]) as raster:
                raster = raster.convert("RGB")
                size = raster.size
                buffer = io.BytesIO()
                raster.save(buffer, "JPEG", quality=82)
            Path(prefix + ".png").unlink(missing_ok=True)
            box = re.search(rf"Page\s+{unit} size:\s+([\d.]+) x ([\d.]+) pts", command(["pdfinfo", "-f", str(unit), "-l", str(unit), str(source)], 10))
            page_size = (float(box[1]), float(box[2])) if box else (size[0] * 0.24, size[1] * 0.24)
            if (page_size[0] > page_size[1]) != (size[0] > size[1]):
                page_size = page_size[::-1]  # the visible page, with /Rotate applied, decides the new page orientation
            pdf_bytes, lost = ocr_page_pdf(buffer.getvalue(), size, page_size, scanned[unit]["words"], scanned[unit]["canvas"])
            dropped += lost
            piece.write_bytes(pdf_bytes)
        else:
            command(["pdfseparate", "-f", str(unit), "-l", str(unit), str(source), str(Path(directory) / "piece-%d.pdf")], 30)
        pieces.append(str(piece))
    if len(pieces) == 1:
        Path(out).write_bytes(Path(pieces[0]).read_bytes())
    else:
        command(["pdfunite", *pieces, str(out)], 60)
    return {"pages": count, "ocr": len(scanned), "signed": signed, "dropped": dropped}


def searchable_pdf_job(job, path, directory):
    pages = json.loads(api(f"derivatives/{job['id']}/pages", lease=job["lease"], binary_limit=16_000_000))["pages"]
    out = Path(directory) / "searchable.pdf"
    info = build_searchable_pdf(path, out, pages, job["policy"], directory)
    api(f"derivatives/{job['id']}/file", lease=job["lease"], raw=out.read_bytes())
    return {"pages": info["pages"], "ocrPages": info["ocr"], "signed": info["signed"],
            "engine": {"tool": SEARCHABLE_ENGINE, "droppedCharacters": info["dropped"]}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ProcessingError("DOWNLOAD")


def api(path, body=None, lease=None, binary_limit=None, raw=None):
    base = os.environ["RUNLY_CONTENT_API_URL"].rstrip("/")
    token = os.environ["RUNLY_CONTENT_WORKER_TOKEN"]
    target = urllib.parse.urlsplit(base)
    local_http = target.scheme == 'http' and target.hostname in ('api', 'localhost', '127.0.0.1', '::1', 'host.docker.internal')
    if (target.scheme != 'https' and not local_http) or target.username or target.password or target.query or target.fragment or len(token) < 32:
        raise RuntimeError("Configure a private API URL and worker token")
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    if lease:
        headers["X-Content-Lease"] = lease
    if raw is not None:
        headers["Content-Type"] = "application/pdf"
    request = urllib.request.Request(base + "/content/worker/" + path, method="PUT" if raw is not None else None,
                                     data=raw if raw is not None else json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=120 if raw is not None else 25) as response:
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
                    api(f"{job.get('route','jobs')}/{job['id']}/heartbeat",{'progress':0},job['lease'])
                except Exception:
                    stop_process(process)
                    break
            if process.exitcode:
                code = 'TIMEOUT' if time.monotonic()-start>=job['policy']['timeoutSeconds'] else 'PARSER'
                try:
                    api(f"{job.get('route','jobs')}/{job['id']}/result",{'errorCode':code} if job.get('kind') else {'pages':[],'errorCode':code},job['lease'])
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
    derivative = bool(job.get('kind'))
    fail = (lambda code: {"errorCode": code}) if derivative else (lambda code: {"pages": [], "errorCode": code})
    route = job.get('route', 'jobs')
    payload = fail("PARSER")
    try:
        policy = job["policy"]
        memory_bytes = policy.get('memoryMiB',512)*1048576
        resource.setrlimit(resource.RLIMIT_AS,(memory_bytes,memory_bytes))
        threads = min(4,max(1,policy.get('threads',1)))
        OMP_ENV['OMP_THREAD_LIMIT'] = str(threads)
        OMP_ENV['OMP_NUM_THREADS'] = str(threads)
        raw = api(f"{route}/{job['id']}/source", lease=job["lease"], binary_limit=policy["maxFileBytes"])
        with tempfile.TemporaryDirectory(prefix="original-") as directory:
            path = Path(directory) / "source"
            path.write_bytes(raw)
            payload = searchable_pdf_job(job, path, directory) if derivative else extract(path, job["mimeType"], policy,
                              lambda value: api(f"jobs/{job['id']}/heartbeat", {"progress": value}, job["lease"]),
                              checkpoint=lambda page,total: api(f"jobs/{job['id']}/checkpoint", {'page':page,'totalUnits':total},job['lease']),
                              resume_units=job.get('resumeUnits',()))
    except MemoryError:
        payload = fail('RESOURCES')
    except ProcessingError as error:
        payload = fail(error.code)
    except urllib.error.HTTPError:
        payload = fail("DOWNLOAD")
    except Exception:
        pass
    try:
        if derivative:
            api(f"{route}/{job['id']}/result", payload, job["lease"])
            return
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
            job = api("claim", {"id": worker_id}).get("data") or api("derivative/claim", {"id": worker_id}).get("data")
            if not job:
                time.sleep(5)
                continue
            if job.get('kind'):
                cpu_budget = job['policy'].get('cpuBudgetPercent', 80)
                supervise(job, worker_id, capabilities)
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
