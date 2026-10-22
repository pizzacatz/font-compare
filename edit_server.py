"""Local server for the compare app + glyph editor.
Serves this folder at /, the font project at /fp/, and two JSON endpoints:
  POST /api/save     {name, spec}  -> writes ../pokemon-custom-emerald-font/data/glyph_overrides/<name>.json
  POST /api/rebuild  {chars}       -> runs preview.sh (smooth + Rounded Game build + previews), syncs fonts here
  GET  /api/overrides              -> list of override files with their specs
usage: python3 edit_server.py [port]   (default 8768)
"""
import http.server, json, os, sys, subprocess, urllib.parse, re
HERE = os.path.dirname(os.path.abspath(__file__))
FP = os.path.abspath(os.path.join(HERE, '..', 'pokemon-custom-emerald-font'))
OVR = os.path.join(FP, 'data', 'glyph_overrides')

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
        if self.path == '/api/overrides':
            out = {}
            for fn in sorted(os.listdir(OVR)):
                if fn.endswith('.json'):
                    out[fn[:-5]] = json.load(open(os.path.join(OVR, fn), encoding='utf-8'))
            return self.send_json(out)
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n) or b'{}')
        if self.path == '/api/save':
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', body['name'])[:40] or 'glyph'
            with open(os.path.join(OVR, name + '.json'), 'w', encoding='utf-8') as f:
                json.dump(body['spec'], f, indent=1, ensure_ascii=False)
            return self.send_json({'ok': True, 'file': name + '.json'})
        if self.path == '/api/delete':
            name = re.sub(r'[^A-Za-z0-9_.-]', '_', body['name'])[:40]
            p = os.path.join(OVR, name + '.json')
            if os.path.exists(p): os.remove(p)
            return self.send_json({'ok': True})
        if self.path == '/api/rebuild':
            chars = body.get('chars', '')
            r = subprocess.run([os.path.join(FP, 'preview.sh')] + ([chars] if chars else []), capture_output=True, text=True, cwd=FP)
            subprocess.run([os.path.join(HERE, 'sync-fonts.sh')], capture_output=True, text=True)
            return self.send_json({'ok': r.returncode == 0, 'log': (r.stdout + r.stderr)[-4000:]})
        return self.send_json({'error': 'unknown endpoint'}, 404)
    def log_message(self, *a):
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8768
    print(f'Compare app: http://localhost:{port}/   Glyph editor: http://localhost:{port}/editor.html')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
