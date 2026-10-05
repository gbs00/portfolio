"""Validate generated pages against the published content snapshot."""

import argparse
import json
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.h1s = 0
        self.cards = []
        self.card_indexes = []
        self.lang = None
        self.body = {}
        self.analytics = []
        self.events = []
        self.images = []
        self.image_links = []
        self.videos = []
        self.sources = []
        self.title = ''
        self._in_title = False
        self._in_card_index = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = (attrs.get('class') or '').split()
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        if tag == 'html':
            self.lang = attrs.get('lang')
        elif tag == 'body':
            self.body = attrs
        elif tag == 'script' and (
            'data-measurement-id' in attrs
            or (attrs.get('src') or '').split('?', 1)[0].endswith('analytics.js')
        ):
            self.analytics.append(attrs)
        elif tag == 'h1':
            self.h1s += 1
        elif tag == 'title':
            self._in_title = True
        elif tag == 'img':
            self.images.append(attrs)
        elif tag == 'video':
            self.videos.append(attrs)
        elif tag == 'source':
            self.sources.append(attrs)
        if 'data-analytics-event' in attrs:
            self.events.append(attrs)
        if 'project-card' in classes:
            self.cards.append(attrs)
        if 'detail-image-link' in classes:
            self.image_links.append(attrs)
        if 'card-index' in classes:
            self.card_indexes.append('')
            self._in_card_index = True
        for key in ('href', 'src', 'poster'):
            if key in attrs:
                self.links.append(attrs[key])

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'span':
            self._in_card_index = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_card_index:
            self.card_indexes[-1] += data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-dir', type=Path, default=ROOT / 'dist')
    parser.add_argument('--projects-file', type=Path, default=ROOT / 'data/projects.json')
    parser.add_argument('--analytics-file', type=Path, default=ROOT / 'data/analytics.json')
    args = parser.parse_args()
    dist = args.site_dir.resolve()
    try:
        records = json.loads(args.projects_file.read_text(encoding='utf-8'))
        projects = sorted(
            (project for project in records if project.get('visible') is True),
            key=lambda project: project['displayOrder'],
        )
        analytics = json.loads(args.analytics_file.read_text(encoding='utf-8'))
        measurement_id = os.environ.get('GA4_MEASUREMENT_ID', analytics['measurementId']).strip()
        site_url = analytics['siteUrl']
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise SystemExit(f'Cannot read check inputs: {error}') from error

    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)
        return condition

    pages = {}
    contents = {}
    require(dist.is_dir(), f'Missing site directory: {dist}')
    for filename in sorted(dist.rglob('*.html')):
        try:
            content = filename.read_text(encoding='utf-8')
            page = Page()
            page.feed(content)
            page.close()
        except (OSError, ValueError) as error:
            errors.append(f'{filename}: cannot read page: {error}')
            continue
        pages[filename] = page
        contents[filename] = content
        require(page.h1s == 1, f'{filename}: expected one h1, found {page.h1s}')
        require(page.lang == 'zh-CN', f'{filename}: missing Chinese language')
        for image in page.images:
            require(bool(image.get('alt')), f'{filename}: image without alt text: {image.get("src")}')

    for filename, page in pages.items():
        for link in page.links:
            if not require(isinstance(link, str) and bool(link), f'{filename}: empty href, src or poster'):
                continue
            try:
                parsed = urlsplit(link)
            except ValueError as error:
                errors.append(f'{filename}: invalid URL {link!r}: {error}')
                continue
            if parsed.scheme or parsed.netloc:
                continue
            require(not parsed.path.startswith('/'), f'{filename}: absolute path breaks repository hosting: {link}')
            target = (filename.parent / unquote(parsed.path)).resolve() if parsed.path else filename
            if target.is_dir():
                target /= 'index.html'
            if not require(target.is_relative_to(dist), f'{filename}: link escapes public directory: {link}'):
                continue
            if not require(target.is_file(), f'{filename}: missing asset or page: {link}'):
                continue
            if parsed.fragment and target in pages:
                require(unquote(parsed.fragment) in pages[target].ids, f'{filename}: missing anchor: {link}')

        expected_scripts = 1 if measurement_id else 0
        require(len(page.analytics) == expected_scripts,
                f'{filename}: expected {expected_scripts} analytics script(s), found {len(page.analytics)}')
        for script in page.analytics:
            require(script.get('data-measurement-id') == measurement_id, f'{filename}: wrong GA4 measurement ID')
            require(script.get('data-site-url') == site_url, f'{filename}: wrong GA4 site URL')
            require('defer' in script, f'{filename}: analytics should not block rendering')
            expected_source = './analytics.js' if filename.parent == dist else '../../analytics.js'
            require(script.get('src') == expected_source, f'{filename}: wrong analytics loader path')
        profiles = [event for event in page.events if event.get('data-analytics-event') == 'profile_click']
        require(len(profiles) == 4, f'{filename}: expected four personal-link tracking elements')

    expected_slugs = [project['slug'] for project in projects]
    expected_positions = [str(index + 1) for index in range(len(projects))]
    for entry in ('index.html', 'portfolio.html'):
        filename = dist / entry
        page = pages.get(filename)
        if not require(page is not None, f'Missing homepage: {filename}'):
            continue
        require(page.body.get('data-page-type') == 'portfolio', f'{filename}: wrong page type')
        require(len(page.cards) == len(projects), f'{filename}: card count does not match visible records')
        require([card.get('data-project-id') for card in page.cards] == expected_slugs,
                f'{filename}: cards do not follow Feishu 显示排序')
        require([card.get('data-position') for card in page.cards] == expected_positions,
                f'{filename}: card tracking positions do not match display order')
        require(page.card_indexes == [f'{index + 1:02d}' for index in range(len(projects))],
                f'{filename}: displayed card numbers do not match display order')
        require([image.get('src') for image in page.images] == [
            f'./assets/{project.get("thumbnail") or project["image"]}' for project in projects if project.get('image')
        ], f'{filename}: card previews do not match visible records')
        for card, project in zip(page.cards, projects):
            require(card.get('href') == f'./projects/{project["slug"]}/index.html',
                    f'{filename}: wrong detail link for {project["title"]}')
            require(card.get('data-analytics-event') == 'project_open' and card.get('data-placement') == 'grid',
                    f'{filename}: wrong card tracking for {project["title"]}')
    if dist / 'index.html' in contents and dist / 'portfolio.html' in contents:
        require(contents[dist / 'index.html'] == contents[dist / 'portfolio.html'],
                'index.html and portfolio.html must contain the same homepage')

    expected_details = {dist / 'projects' / slug / 'index.html' for slug in expected_slugs}
    actual_details = set((dist / 'projects').glob('*/index.html'))
    require(actual_details == expected_details, 'Detail pages do not match visible records')
    for index, project in enumerate(projects):
        filename = dist / 'projects' / project['slug'] / 'index.html'
        page = pages.get(filename)
        if not require(page is not None, f'Missing detail page for {project["title"]}: {filename}'):
            continue
        require(page.title == f'{project["title"]} · Tim 的作品集', f'{filename}: wrong detail page title')
        require(page.body.get('data-page-type') == 'project', f'{filename}: wrong page type')
        require(page.body.get('data-project-id') == project['slug'], f'{filename}: wrong analytics project')
        next_index = (index + 1) % len(projects)
        next_project = projects[next_index]
        next_links = [event for event in page.events if event.get('data-placement') == 'next_project']
        if require(len(next_links) == 1, f'{filename}: expected one next-project link'):
            link = next_links[0]
            require(link.get('href') == f'../{next_project["slug"]}/index.html', f'{filename}: wrong next project')
            require(link.get('data-analytics-event') == 'project_open'
                    and link.get('data-project-id') == next_project['slug']
                    and link.get('data-position') == str(next_index + 1),
                    f'{filename}: wrong next-project tracking position')
        visits = [event for event in page.events if event.get('data-analytics-event') == 'project_outbound']
        require(len(visits) == 2 and {event.get('data-placement') for event in visits} == {'hero', 'bottom'},
                f'{filename}: expected hero and bottom outbound tracking')
        for visit in visits:
            require(visit.get('href') == project['url'] and visit.get('data-project-id') == project['slug'],
                    f'{filename}: outbound link does not match the project')

        preview = project.get('thumbnail') or project.get('image')
        require([image.get('src') for image in page.images] == ([f'../../assets/{preview}'] if project.get('image') else []),
                f'{filename}: wrong project preview')
        require([link.get('href') for link in page.image_links] == ([f'../../assets/{project["image"]}'] if project.get('image') else []),
                f'{filename}: original image link does not match the project')
        expected_video = project.get('video')
        require(len(page.videos) == (1 if expected_video else 0), f'{filename}: video count does not match the project')
        require([source.get('src') for source in page.sources] == ([f'../../assets/{expected_video}'] if expected_video else []),
                f'{filename}: wrong project video')
        for video in page.videos:
            require('data-analytics-video' in video, f'{filename}: missing video tracking')
            if project.get('image'):
                require(video.get('poster') == f'../../assets/{preview}', f'{filename}: wrong video poster')

    for filename in dist.rglob('*'):
        if filename.is_file() and filename.suffix in ('.html', '.css', '.js', '.json'):
            try:
                text = contents.get(filename)
                if text is None:
                    text = filename.read_text(encoding='utf-8')
            except (OSError, UnicodeError) as error:
                errors.append(f'{filename}: cannot read public file: {error}')
                continue
            for private in ('app_secret', 'access_token', 'refresh_token', 'file_token'):
                require(private not in text, f'{filename}: unexpected private source data: {private}')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Checked {len(pages)} pages, {len(projects)} visible records, links, assets, ordering and GA4 configuration.')


if __name__ == '__main__':
    main()
