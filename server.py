#!/usr/bin/env python3
"""Small same-origin API and static server for the Sheets browser."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import csv, io, json, os, re, threading, time
import requests

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv('PORT', '8000'))
SHEETS = [
    {'id': 'sheet-one', 'name': 'سجل طلبات التمويل', 'short': 'السجل الأول', 'sheet_id': '1WBZGny3t6JuQExqBxMu32JzEs4lR71OKlzPsn9nqb9I', 'gid': '413467096'},
    {'id': 'sheet-two', 'name': 'بيانات متابعة التمويل', 'short': 'السجل الثاني', 'sheet_id': '1JWICsDpvCS-V6d9kk3UYmaN8cnHNsTYUhA8AW4v1CwM', 'gid': '482471481'},
]
CACHE_TTL = int(os.getenv('CACHE_TTL', '300'))
_cache = {'at': 0, 'data': None, 'error': None}
_lock = threading.Lock()


def fetch_sheet(sheet):
    url = f"https://docs.google.com/spreadsheets/d/{sheet['sheet_id']}/gviz/tq?tqx=out:csv&gid={sheet['gid']}"
    response = requests.get(url, timeout=25, headers={'User-Agent': 'Mozilla/5.0 (compatible; SheetBrowse/1.0)'})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or 'utf-8'
    parsed = list(csv.reader(io.StringIO(response.text.lstrip('\ufeff'))))
    if not parsed:
        return {'columns': [], 'rows': []}
    columns = [str(c).strip() for c in parsed[0]]
    rows = []
    for idx, values in enumerate(parsed[1:], start=2):
        values += [''] * max(0, len(columns) - len(values))
        if not any(str(v).strip() for v in values):
            continue
        record = {col: (values[i].strip() if i < len(values) else '') for i, col in enumerate(columns)}
        record['_row_id'] = f"{sheet['id']}-{idx}"
        record['_source'] = sheet['id']
        rows.append(record)
    return {'columns': columns, 'rows': rows}


def get_data(force=False):
    with _lock:
        if not force and _cache['data'] is not None and time.time() - _cache['at'] < CACHE_TTL:
            return _cache['data'], True
        # Refresh each sheet independently; preserve clear error state and don't substitute demo content.
        results, failures = [], []
        for sheet in SHEETS:
            try:
                results.append(fetch_sheet(sheet))
            except Exception as exc:
                failures.append({'source': sheet['id'], 'message': str(exc)})
                results.append(None)
        if all(x is None for x in results):
            if _cache['data'] is not None:
                raise RuntimeError('تعذر تحديث المصدرين. البيانات المعروضة قديمة؛ ' + '; '.join(x['message'] for x in failures))
            raise RuntimeError('تعذر الوصول إلى جداول Google: ' + '; '.join(x['message'] for x in failures))
        sheets, rows, all_columns = [], [], []
        for sheet, result in zip(SHEETS, results):
            if result is None:
                result = {'columns': [], 'rows': []}
            sheets.append({'id': sheet['id'], 'name': sheet['name'], 'short': sheet['short'], 'columns': result['columns'], 'count': len(result['rows']), 'error': next((e['message'] for e in failures if e['source'] == sheet['id']), None)})
            rows.extend(result['rows'])
            for col in result['columns']:
                if col not in all_columns:
                    all_columns.append(col)
        data = {'sheets': sheets, 'columns': all_columns, 'rows': rows, 'updated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'errors': failures}
        _cache.update(at=time.time(), data=data, error=failures)
        return data, False


def drive_id(value):
    value = value.strip()
    if re.fullmatch(r'[A-Za-z0-9_-]{10,}', value):
        return value
    if not re.match(r'^https?://(drive\.google\.com|docs\.google\.com)/', value, re.I):
        return None
    match = re.search(r'(?:[?&]id=|/d/)([A-Za-z0-9_-]{10,})', value)
    return match.group(1) if match else None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/data':
            force = parse_qs(parsed.query).get('refresh', ['0'])[0] == '1'
            try:
                data, cached = get_data(force)
                data['cached'] = cached
                self.send_json(data)
            except Exception as exc:
                self.send_json({'error': str(exc)}, 502)
            return
        if parsed.path.startswith('/api/pdf/'):
            ident = drive_id(parsed.path.rsplit('/', 1)[-1])
            if not ident:
                self.send_json({'error': 'رابط Google Drive غير صالح'}, 400)
                return
            try:
                url = 'https://drive.google.com/uc?export=download&id=' + ident
                response = requests.get(url, stream=True, timeout=35, headers={'User-Agent': 'Mozilla/5.0'})
                # Google occasionally returns an HTML confirmation page; expose that as an unavailable file.
                ctype = response.headers.get('Content-Type', '')
                first = next(response.iter_content(8192), b'')
                if response.status_code >= 400 or not first.startswith(b'%PDF'): 
                    response.close()
                    self.send_json({'error': 'تعذّر الوصول إلى الملف. قد يكون غير متاح أو ليس ملف PDF.'}, 502)
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'inline; filename="{ident}.pdf"')
                self.send_header('Cache-Control', 'private, max-age=300')
                if response.headers.get('Content-Length'):
                    self.send_header('Content-Length', response.headers['Content-Length'])
                self.end_headers()
                self.wfile.write(first)
                for chunk in response.iter_content(65536):
                    if chunk:
                        self.wfile.write(chunk)
                response.close()
            except Exception as exc:
                try: self.send_json({'error': 'فشل تحميل الملف: ' + str(exc)}, 502)
                except (BrokenPipeError, ConnectionResetError): pass
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        print('[%s] %s' % (self.log_date_time_string(), fmt % args))

if __name__ == '__main__':
    print(f'Sheets browser running on 0.0.0.0:{PORT}')
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
