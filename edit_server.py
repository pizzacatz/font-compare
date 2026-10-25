"""Local server for the compare app + glyph editor.
Serves this folder at /, the font project at /fp/, and JSON endpoints. Every endpoint takes a font
variant (normal, narrow, small, short, small_narrow, and pokeemerald-expansion's narrower, small_narrower,
short_narrow, short_narrower; default normal): Normal's overrides live in
../pokemon-custom-emerald-font/data/glyph_overrides/, the others in data/<variant>/glyph_overrides/.
  GET  /api/overrides?variant=v          -> override files of that font with their specs
  POST /api/save     {variant, name, spec} -> writes the override (a ported glyph is then marked "hand",
                                             so re-running the porting script never replaces it)
  POST /api/delete   {variant, name}
  POST /api/rebuild  {variant, chars}    -> runs preview.sh (smooth + Rounded Game build + previews), syncs fonts here
  POST /api/port     {variant, char}     -> re-ports one glyph from Normal (scripts/port_overrides.py --replace)
usage: python3 edit_server.py [port]   (default 8768)
"""
import http.server, json, os, sys, subprocess, urllib.parse, re
HERE = os.path.dirname(os.path.abspath(__file__))
FP = os.path.abspath(os.path.join(HERE, '..', 'pokemon-custom-emerald-font'))
VARIANTS = ('normal', 'narrow', 'small', 'short', 'small_narrow', 'narrower', 'small_narrower', 'short_narrow', 'short_narrower')

def data_dir(variant):
    return os.path.join(FP, 'data') if variant == 'normal' else os.path.join(FP, 'data', variant)

def ovr_dir(variant):
    return os.path.join(data_dir(variant), 'glyph_overrides')

def mark_hand(variant, name, spec):
    """Record a saved glyph as hand-edited in the font's port report (only ported fonts have one)."""
    p = os.path.join(data_dir(variant), 'port_report.json')
    if variant == 'normal' or not os.path.exists(p):
        return
    rep = json.load(open(p, encoding='utf-8'))
    rep.setdefault(name, {}).update({'char': spec.get('char'), 'method': 'hand', 'from': None, 'note': 'edited in the glyph editor'})
    json.dump(rep, open(p, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)
    def translate_path(self, path):
        p = urllib.parse.urlparse(path).path
        if p.startswith('/fp/'):
            rel = os.path.normpath(urllib.parse.unquote(p[4:]))
            if rel.startswith('..'):
                return os.path.join(FP, 'nonexistent')
            return os.path.join(FP, rel)
        return super().translate_path(path)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')   # fonts/metrics change after every rebuild
        super().end_headers()
    def send_json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/api/overrides':
            v = urllib.parse.parse_qs(u.query).get('variant', ['normal'])[0]
            if v not in VARIANTS:
                return self.send_json({'error': 'unknown variant'}, 400)
            out, d = {}, ovr_dir(v)
            for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
                if fn.endswith('.json'):
                    out[fn[:-5]] = json.load(open(os.path.join(d, fn), encoding='utf-8'))
            return self.send_json(out)
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n) or b'{}')
        v = body.get('variant', 'normal')
        if v not in VARIANTS:
            return self.send_json({'error': 'unknown variant'}, 400)
        env = dict(os.environ, EMERALD_VARIANT=v)
        if self.path == '/api/save':
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', body['name'])[:40] or 'glyph'
            os.makedirs(ovr_dir(v), exist_ok=True)
            with open(os.path.join(ovr_dir(v), name + '.json'), 'w', encoding='utf-8') as f:
                json.dump(body['spec'], f, indent=1, ensure_ascii=False)
            mark_hand(v, name, body['spec'])
            return self.send_json({'ok': True, 'file': name + '.json'})
        if self.path == '/api/delete':
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', body['name'])[:40]
            p = os.path.join(ovr_dir(v), name + '.json')
            if os.path.exists(p): os.remove(p)
            return self.send_json({'ok': True})
        if self.path == '/api/rebuild':
            chars = body.get('chars', '')
            r = subprocess.run([os.path.join(FP, 'preview.sh')] + ([chars] if chars else []), capture_output=True, text=True, cwd=FP, env=env)
            subprocess.run([os.path.join(HERE, 'sync-fonts.sh')], capture_output=True, text=True)
            return self.send_json({'ok': r.returncode == 0, 'log': (r.stdout + r.stderr)[-4000:]})
        if self.path == '/api/port':
            if v == 'normal':
                return self.send_json({'ok': False, 'log': 'Normal is the source font; nothing to port from.'})
            if not body.get('char'):
                return self.send_json({'ok': False, 'log': 'No character given.'})
            r = subprocess.run(['python3', os.path.join(FP, 'scripts', 'port_overrides.py'), v, '--replace', body['char']],
                               capture_output=True, text=True, cwd=FP, env=dict(env, PYTHONPATH=os.path.join(FP, 'pylib')))
            return self.send_json({'ok': r.returncode == 0, 'log': (r.stdout + r.stderr)[-4000:]})
        return self.send_json({'error': 'unknown endpoint'}, 404)
    def log_message(self, *a):
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8768
    print(f'Compare app: http://localhost:{port}/   Glyph editor: http://localhost:{port}/editor.html')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
