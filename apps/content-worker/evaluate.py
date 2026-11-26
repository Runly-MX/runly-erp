"""Run the OCR pipeline over a corpus.py manifest per quality mode; emit JSON + Markdown.

python evaluate.py CORPUS_DIR OUT_PREFIX [--qualities fast,balanced,accurate] [--timeout 120]
Every number is measured on this run; nothing is estimated.
"""
import argparse
import json
import multiprocessing
import resource
import statistics
import time
import unicodedata
from pathlib import Path
from worker import extract

POLICY = {'languages': ['spa', 'eng'], 'allowOcr': True, 'maxPixels': 16000000, 'maxPages': 10, 'maxFileBytes': 10485760, 'timeoutSeconds': 120}


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        row = [i]
        for j, y in enumerate(b, 1):
            row.append(min(previous[j] + 1, row[-1] + 1, previous[j - 1] + (x != y)))
        previous = row
    return previous[-1]


def fold(text):
    """Search normalization only (case/accents); recognized text itself is never rewritten."""
    return unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()


def child(connection, path, mime, quality):
    started = time.monotonic()
    try:
        result = extract(path, mime, {**POLICY, 'quality': quality})
        own, kids = resource.getrusage(resource.RUSAGE_SELF), resource.getrusage(resource.RUSAGE_CHILDREN)
        connection.send({'text': '\n'.join(page['text'] for page in result['pages']), 'seconds': time.monotonic() - started,
                         'cpuSeconds': own.ru_utime + own.ru_stime + kids.ru_utime + kids.ru_stime,
                         'peakRssKiB': max(own.ru_maxrss, kids.ru_maxrss), 'secondPasses': result['metrics'].get('secondPasses', 0),
                         'sources': sorted({page.get('source', '') for page in result['pages']})})
    except Exception as error:
        connection.send({'error': type(error).__name__ + ':' + str(getattr(error, 'code', ''))})
    finally:
        connection.close()


def run_one(path, mime, quality, timeout):
    receive, send = multiprocessing.Pipe(duplex=False)
    process = multiprocessing.get_context('fork').Process(target=child, args=(send, path, mime, quality))
    process.start()
    send.close()
    if not receive.poll(timeout):
        process.kill(); process.join()
        return {'error': 'TIMEOUT'}
    try:
        return receive.recv()
    except EOFError:
        return {'error': 'CHILD_DIED'}
    finally:
        process.join()


def evaluate(corpus, qualities, timeout):
    manifest = json.loads((corpus / 'manifest.json').read_text(encoding='utf-8'))
    rows = []
    for entry in manifest['entries']:
        path = Path(entry['file']) if Path(entry['file']).is_absolute() else corpus / entry['file']
        for quality in qualities:
            result = run_one(path, entry['mime'], quality, timeout)
            truth = ' '.join(entry['truth'].split())
            actual = ' '.join(result.get('text', '').split())
            hits = [i for i in entry['identifiers'] if i in actual]
            rows.append({'id': entry['id'], 'kind': entry['kind'], 'quality': quality, 'transforms': entry['transforms'], 'truthChars': len(truth),
                         'cer': distance(truth, actual) / len(truth) if truth else (0.0 if not actual else 1.0),
                         'wer': distance(truth.split(), actual.split()) / len(truth.split()) if truth else 0.0,
                         'identifiers': len(entry['identifiers']), 'identifiersExact': len(hits),
                         **{k: v for k, v in result.items() if k != 'text'}, 'text': actual})
    summary = {}
    for quality in qualities:
        every = [r for r in rows if r['quality'] == quality]
        subset = [r for r in every if 'error' not in r and r['truthChars']]
        # Search: each identifier is a query over every recognized text (folded match only).
        tp = fp = fn = queries = 0
        owners = {}
        for entry in manifest['entries']:
            for identifier in entry['identifiers']:
                owners.setdefault(identifier, set()).add(entry['id'])
        for identifier, expected in owners.items():
            queries += 1
            matched = {r['id'] for r in every if fold(identifier) in fold(r['text'])}
            tp += len(matched & expected); fn += len(expected - matched); fp += len(matched - expected)
        ids = sum(r['identifiers'] for r in subset)
        seconds = sorted(r['seconds'] for r in subset)
        summary[quality] = {'files': len(subset), 'errors': sum('error' in r for r in every),
                            'cerMean': statistics.fmean(r['cer'] for r in subset) if subset else None,
                            'werMean': statistics.fmean(r['wer'] for r in subset) if subset else None,
                            'identifierExact': sum(r['identifiersExact'] for r in subset) / max(1, ids),
                            'secondsMean': statistics.fmean(seconds) if seconds else None,
                            'secondsP95': seconds[int(.95 * (len(seconds) - 1))] if seconds else None,
                            'peakRssMiB': max((r['peakRssKiB'] for r in subset), default=0) / 1024,
                            'secondPasses': sum(r['secondPasses'] for r in subset),
                            'searchQueries': queries, 'searchRecall': tp / max(1, tp + fn), 'searchPrecision': tp / max(1, tp + fp)}
    return {'synthetic': manifest['synthetic'], 'seed': manifest['seed'], 'size': manifest['size'], 'files': len(manifest['entries']), 'summary': summary, 'rows': rows}


def markdown(report):
    def f(v, n=3):
        return '-' if v is None else f'{v:.{n}f}'
    lines = [f"# OCR corpus {report['size']} (seed {report['seed']}, {report['files']} files, synthetic={report['synthetic']})", '',
             '| Modo | Archivos | Errores | CER | WER | Ids exactos | Recall busqueda | Precision busqueda | s medio | s p95 | RSS max MiB | 2das pasadas |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for quality, s in report['summary'].items():
        lines.append(f"| {quality} | {s['files']} | {s['errors']} | {f(s['cerMean'])} | {f(s['werMean'])} | {f(s['identifierExact'])} | {f(s['searchRecall'])} | "
                     f"{f(s['searchPrecision'])} | {f(s['secondsMean'], 2)} | {f(s['secondsP95'], 2)} | {s['peakRssMiB']:.0f} | {s['secondPasses']} |")
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('corpus'); parser.add_argument('out')
    parser.add_argument('--qualities', default='fast,balanced,accurate'); parser.add_argument('--timeout', type=int, default=120)
    args = parser.parse_args()
    report = evaluate(Path(args.corpus), args.qualities.split(','), args.timeout)
    Path(args.out + '.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    Path(args.out + '.md').write_text(markdown(report), encoding='utf-8')
    print(markdown(report))
