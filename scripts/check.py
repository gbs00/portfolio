from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
projects = sorted([p for p in json.loads((root / 'data/projects.json').read_text()) if p.get('visible') is True], key=lambda p: p['displayOrder'])
errors = []

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.h1s = 0
        self.cards = 0
        self.lang = None
        self.body = {}
        self.analytics = []
        self.events = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag == 'html': self.lang = a.get('lang')
        if tag == 'body': self.body = a
        if tag == 'script' and a.get('src', '').endswith('analytics.js'): self.analytics.append(a)
        if 'data-analytics-event' in a: self.events.append(a)
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
analytics_ids = set()
for f, page in pages.items():
    assert len(page.analytics) <= 1, f'{f}: duplicate analytics script'
    for script in page.analytics:
        analytics_ids.add(script['data-measurement-id'])
        assert 'defer' in script, f'{f}: analytics should not block rendering'
    profiles = [e for e in page.events if e['data-analytics-event'] == 'profile_click']
    assert len(profiles) == 4, f'{f}: missing personal-link tracking'
assert len(analytics_ids) <= 1, 'Pages use inconsistent GA4 streams'
assert not analytics_ids or all(len(p.analytics) == 1 for p in pages.values()), 'GA4 is missing from some pages'
for entry in ['index.html', 'portfolio.html']:
    cards = [e for e in pages[(dist/entry).resolve()].events if e['data-analytics-event'] == 'project_open']
    assert [e['data-project-id'] for e in cards] == [p['slug'] for p in projects], 'Cards do not follow Feishu 显示排序'
    assert [e['data-position'] for e in cards] == [str(i + 1) for i in range(len(projects))], 'Card tracking positions do not match display order'
for i, p in enumerate(projects):
    f = dist/'projects'/p['slug']/'index.html'
    assert f.exists(), f'Missing detail page for {p["title"]}'
    assert p['title'] in f.read_text(), f'Wrong detail page for {p["title"]}'
    page = pages[f.resolve()]
    assert page.body.get('data-project-id') == p['slug'], f'{f}: wrong analytics project'
    next_project = projects[(i + 1) % len(projects)]
    next_links = [e for e in page.events if e.get('data-placement') == 'next_project']
    assert len(next_links) == 1 and next_links[0]['href'] == f'../{next_project["slug"]}/index.html', f'{f}: wrong next project'
    assert next_links[0]['data-project-id'] == next_project['slug'] and next_links[0]['data-position'] == str((i + 1) % len(projects) + 1), f'{f}: wrong next-project tracking position'
    visits = [e for e in page.events if e['data-analytics-event'] == 'project_outbound']
    assert {e['data-placement'] for e in visits} == {'hero', 'bottom'}, f'{f}: missing outbound tracking'
for f in dist.rglob('*'):
    if f.is_file() and f.suffix in ['.html','.css','.js','.json']:
        text=f.read_text()
        for private in ['app_secret','access_token','refresh_token','file_token']:
            if private in text: errors.append(f'{f}: unexpected private source data')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(pages)} pages, {len(projects)} visible records, all local links, anchors and assets. Root and repository-relative paths are valid.')
