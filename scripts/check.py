from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
projects = [p for p in json.loads((root / 'data/projects.json').read_text()) if p.get('visible') is True]
errors = []

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.h1s = 0
        self.cards = 0
        self.lang = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag == 'html': self.lang = a.get('lang')
        if tag == 'h1': self.h1s += 1
        if 'project-card' in a.get('class', '').split(): self.cards += 1
        for key in ['href', 'src', 'poster']:
            if key in a: self.links.append(a[key])
        if tag == 'img' and not a.get('alt'): errors.append('Image without alt text')

pages = {}
for f in dist.rglob('*.html'):
    p = Page()
    p.feed(f.read_text())
    pages[f.resolve()] = p
    if p.h1s != 1: errors.append(f'{f}: expected one h1')
    if p.lang != 'zh-CN': errors.append(f'{f}: missing Chinese language')
for f, p in pages.items():
    for link in p.links:
        u = urlsplit(link)
        if u.scheme or u.netloc: continue
        if u.path.startswith('/'): errors.append(f'{f}: absolute path breaks repository hosting: {link}')
        target = (f.parent / unquote(u.path)).resolve() if u.path else f
        if target.is_dir(): target = target / 'index.html'
        if not target.is_relative_to(dist.resolve()): errors.append(f'{f}: link escapes public directory')
        elif not target.exists(): errors.append(f'{f}: missing asset or page: {link}')
        elif u.fragment and target in pages and u.fragment not in pages[target].ids:
            errors.append(f'{f}: missing anchor: {link}')
assert pages[(dist/'portfolio.html').resolve()].cards == len(projects), 'Portfolio count does not match visible records'
assert len(list((dist/'projects').glob('*/index.html'))) == len(projects), 'Detail pages do not match visible records'
for p in projects:
    f = dist/'projects'/p['slug']/'index.html'
    assert f.exists(), f'Missing detail page for {p["title"]}'
    assert p['title'] in f.read_text(), f'Wrong detail page for {p["title"]}'
for f in dist.rglob('*'):
    if f.is_file() and f.suffix in ['.html','.css','.js','.json']:
        text=f.read_text()
        for private in ['app_secret','access_token','refresh_token','file_token']:
            if private in text: errors.append(f'{f}: unexpected private source data')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(pages)} pages, {len(projects)} visible records, all local links, anchors and assets. Root and repository-relative paths are valid.')
