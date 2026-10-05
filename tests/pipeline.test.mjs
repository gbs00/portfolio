import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSite, projectRoot} from '../scripts/build.mjs';
import {syncFeishu} from '../scripts/sync-feishu.mjs';
import {replacePaths} from '../scripts/lib/files.mjs';

const writeJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const sourceImage = path.join(projectRoot, 'public/assets/token-bi.png');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-pipeline-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const directory of ['data', 'src', 'public/assets']) fs.mkdirSync(path.join(root, directory), {recursive: true});
  for (const filename of ['styles.css', 'analytics.js']) fs.copyFileSync(path.join(projectRoot, 'src', filename), path.join(root, 'src', filename));
  fs.copyFileSync(sourceImage, path.join(root, 'public/assets/sample.png'));
  const project = {
    id: 'recSample', slug: 'sample', title: '示例作品', visible: true, displayOrder: 1,
    summary: '简介', sourceSummary: '原始简介', url: 'https://example.com/project', tags: ['工具'],
    image: 'sample.png', imageAlt: '示例预览', width: 918, height: 419, video: null,
  };
  writeJson(path.join(root, 'data/projects.json'), [project]);
  writeJson(path.join(root, 'data/editorial.json'), {});
  writeJson(path.join(root, 'data/analytics.json'), {measurementId: 'G-TEST123', siteUrl: 'https://example.com/portfolio/'});
  return {root, project, dist: path.join(root, 'dist')};
}

function fileHashes(directory) {
  const files = {};
  function visit(current) {
    for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else files[path.relative(directory, filename)] = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    }
  }
  visit(directory);
  return files;
}

test('builds a complete site from a clean output directory and reproduces its bytes', t => {
  const {root, dist} = fixture(t);
  assert.equal(fs.existsSync(dist), false);
  const result = buildSite({root});
  assert.equal(result.projects, 1);
  assert.equal(result.pages, 3);
  for (const filename of ['index.html', 'portfolio.html', 'projects/sample/index.html', 'styles.css', 'analytics.js', 'assets/sample.png', '.nojekyll']) {
    assert.equal(fs.existsSync(path.join(dist, filename)), true, filename);
  }
  const first = fileHashes(dist);
  buildSite({root});
  assert.deepEqual(fileHashes(dist), first);
});

test('invalid editorial or a missing source asset leaves the last successful site intact', t => {
  const {root, dist} = fixture(t);
  buildSite({root});
  const original = fileHashes(dist);
  writeJson(path.join(root, 'data/editorial.json'), {sample: {features: ['invalid pair']}});
  assert.throws(() => buildSite({root}), /editorial features/);
  assert.deepEqual(fileHashes(dist), original);

  writeJson(path.join(root, 'data/editorial.json'), {});
  fs.unlinkSync(path.join(root, 'public/assets/sample.png'));
  assert.throws(() => buildSite({root}), /ENOENT/);
  assert.deepEqual(fileHashes(dist), original);
});

test('video-only projects use their own accessible title and omit the poster', t => {
  const {root, project, dist} = fixture(t);
  project.image = null;
  project.video = 'demo.mp4';
  project.title = '另一个视频作品';
  // The build validates file references, not media playback or codecs.
  fs.writeFileSync(path.join(root, 'public/assets/demo.mp4'), 'video fixture');
  writeJson(path.join(root, 'data/projects.json'), [project]);
  buildSite({root});
  const html = fs.readFileSync(path.join(dist, 'projects/sample/index.html'), 'utf8');
  const video = html.match(/<video\b[^>]*>/)?.[0];
  assert.ok(video);
  assert.match(video, /aria-label="另一个视频作品产品演示视频"/);
  assert.doesNotMatch(video, /\bposter=/);
  assert.doesNotMatch(html, /assets\/null/);
});

test('escapes source text and link attributes while preserving the content', t => {
  const {root, project, dist} = fixture(t);
  project.title = 'A & B <精选> "作品"';
  project.summary = '<script>alert("hello")</script>';
  project.sourceSummary = '第一行 & 内容\n第二行 <文本>';
  project.tags = ['<工具>'];
  project.url = 'https://example.com/?a=1&b="quoted"';
  writeJson(path.join(root, 'data/projects.json'), [project]);
  buildSite({root});
  const html = fs.readFileSync(path.join(dist, 'projects/sample/index.html'), 'utf8');
  assert.match(html, /A &amp; B &lt;精选&gt; &quot;作品&quot;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;hello&quot;\)&lt;\/script&gt;/);
  assert.match(html, /第一行 &amp; 内容<br>第二行 &lt;文本&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=&quot;quoted&quot;"/);
  assert.doesNotMatch(html, /<script>alert/);
});

const sourceConfig = {baseToken: 'test-base', tableId: 'test-table', viewId: 'test-view'};
const sourceFields = ['名称', '显示', '显示排序', '简述', '链接', '标签', '附件'];
const remoteRecord = changes => ({
  id: 'recSample', 名称: '示例作品', 显示: ['是'], 显示排序: ['1'], 简述: '原始简介',
  链接: 'https://example.com/project', 标签: ['工具'],
  附件: [{name: 'cover.png', file_token: 'image-version-1'}],
  ...changes,
});

function remote(root, {pages = [{records: [remoteRecord()], rev: 7}], failToken} = {}) {
  let pageIndex = 0;
  let downloads = 0;
  return {
    get downloads() { return downloads; },
    run(args) {
      if (args[1] === '+record-list') {
        const page = pages[pageIndex++];
        assert.ok(page, 'unexpected additional record page');
        return {
          fields: sourceFields,
          data: page.records.map(record => sourceFields.map(field => record[field])),
          record_id_list: page.records.map(record => record.id),
          has_more: pageIndex < pages.length,
          rev: page.rev,
        };
      }
      if (args[1] === '+record-download-attachment') {
        downloads += 1;
        const token = args[args.indexOf('--file-token') + 1];
        if (token === failToken) throw new Error('Simulated download failure');
        const output = path.resolve(root, args[args.indexOf('--output') + 1]);
        assert.ok(output.startsWith(root + path.sep), 'download must remain in the fixture');
        fs.copyFileSync(sourceImage, output);
        return {};
      }
      throw new Error(`Unexpected mock command: ${args[1]}`);
    },
  };
}

function publishedState(root) {
  const cache = path.join(root, '.local/media-cache.json');
  return {
    projects: fs.readFileSync(path.join(root, 'data/projects.json'), 'utf8'),
    assets: fileHashes(path.join(root, 'public/assets')),
    dist: fileHashes(path.join(root, 'dist')),
    cache: fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : null,
  };
}

test('metadata-only sync reuses intact attachments and refetches a modified cached file', t => {
  const {root} = fixture(t);
  const first = remote(root);
  const initial = syncFeishu({root, config: sourceConfig, run: first.run});
  assert.equal(initial.downloaded, 1);
  assert.equal(first.downloads, 1);
  const originalAssets = fileHashes(path.join(root, 'public/assets'));

  const second = remote(root, {pages: [{records: [remoteRecord({名称: '更新后的作品', 显示排序: ['2']})], rev: 8}]});
  const updated = syncFeishu({root, config: sourceConfig, run: second.run});
  assert.equal(updated.downloaded, 0);
  assert.equal(updated.reused, 1);
  assert.equal(second.downloads, 0);
  const snapshot = readJson(path.join(root, 'data/projects.json'));
  assert.equal(snapshot[0].title, '更新后的作品');
  assert.equal(snapshot[0].displayOrder, 2);
  assert.equal(snapshot[0].slug, 'sample');
  assert.deepEqual(fileHashes(path.join(root, 'public/assets')), originalAssets);

  fs.appendFileSync(path.join(root, 'public/assets/sample.png'), 'unexpected local modification');
  const third = remote(root);
  const repaired = syncFeishu({root, config: sourceConfig, run: third.run});
  assert.equal(repaired.downloaded, 1);
  assert.equal(third.downloads, 1);
  assert.deepEqual(fileHashes(path.join(root, 'public/assets')), originalAssets);
});

test('bad ordering or a changed pagination revision aborts before changing published data', t => {
  const {root} = fixture(t);
  const first = remote(root);
  syncFeishu({root, config: sourceConfig, run: first.run});
  const original = publishedState(root);
  const invalid = remote(root, {pages: [{records: [remoteRecord({显示排序: ['invalid']})], rev: 8}]});
  assert.throws(() => syncFeishu({root, config: sourceConfig, run: invalid.run}), /displayOrder/);
  assert.equal(invalid.downloads, 0);
  assert.deepEqual(publishedState(root), original);

  const changed = remote(root, {pages: [
    {records: [remoteRecord()], rev: 8},
    {records: [remoteRecord({id: 'recAnother', 显示排序: ['2']})], rev: 9},
  ]});
  assert.throws(() => syncFeishu({root, config: sourceConfig, run: changed.run}), /pagination/);
  assert.equal(changed.downloads, 0);
  assert.deepEqual(publishedState(root), original);
});

test('a later attachment download failure preserves projects, assets, site and cache', t => {
  const {root} = fixture(t);
  buildSite({root});
  const original = publishedState(root);
  const failed = remote(root, {failToken: 'video-fails', pages: [{rev: 8, records: [remoteRecord({
    名称: '不应发布的更新', 附件: [
      {name: 'cover.png', file_token: 'new-image'},
      {name: 'demo.mp4', file_token: 'video-fails'},
    ],
  })]}]});
  assert.throws(() => syncFeishu({root, config: sourceConfig, run: failed.run}), /download failure/);
  assert.equal(failed.downloads, 2);
  assert.deepEqual(publishedState(root), original);
});

test('a build failure after downloading does not publish new data or replace cached media', t => {
  const {root} = fixture(t);
  const first = remote(root);
  syncFeishu({root, config: sourceConfig, run: first.run});
  const original = publishedState(root);
  writeJson(path.join(root, 'data/editorial.json'), {sample: {features: null}});
  const failed = remote(root, {pages: [{rev: 8, records: [remoteRecord({
    名称: '不应发布的更新', 附件: [{name: 'cover.png', file_token: 'new-image'}],
  })]}]});
  assert.throws(() => syncFeishu({root, config: sourceConfig, run: failed.run}), /editorial features/);
  assert.equal(failed.downloads, 1);
  assert.deepEqual(publishedState(root), original);
});

test('publishing multiple paths rolls back earlier replacements if a later target fails', t => {
  const {root} = fixture(t);
  const staged = path.join(root, 'staged');
  fs.mkdirSync(staged);
  fs.writeFileSync(path.join(staged, 'first'), 'new first');
  fs.writeFileSync(path.join(staged, 'second'), 'new second');
  const firstTarget = path.join(root, 'first');
  fs.writeFileSync(firstTarget, 'original first');
  const blockedDirectory = path.join(root, 'blocked');
  fs.writeFileSync(blockedDirectory, 'existing file');
  assert.throws(() => replacePaths([
    {source: path.join(staged, 'first'), target: firstTarget},
    {source: path.join(staged, 'second'), target: path.join(blockedDirectory, 'second')},
  ]));
  assert.equal(fs.readFileSync(firstTarget, 'utf8'), 'original first');
  assert.equal(fs.readFileSync(blockedDirectory, 'utf8'), 'existing file');
});
