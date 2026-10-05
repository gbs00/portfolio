import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProjects, normalizeAnalytics} from '../scripts/lib/projects.mjs';

const project = overrides => ({
  id: 'record-1', slug: 'sample', title: '示例作品', visible: true, displayOrder: 1,
  url: 'https://example.com/project', summary: '简介', sourceSummary: '原始简介',
  tags: ['工具'], image: 'sample.png', width: 1200, height: 750, video: null,
  ...overrides,
});

test('sorts visible projects numerically without mutating the source', () => {
  const records = [project({displayOrder: 10}), project({id: 'record-2', slug: 'second', displayOrder: 2})];
  records.forEach(Object.freeze);
  Object.freeze(records);
  const result = normalizeProjects(records);
  assert.deepEqual(result.map(p => p.displayOrder), [2, 10]);
  assert.deepEqual(records.map(p => p.displayOrder), [10, 2]);
  assert.notEqual(result, records);
});

test('ignores hidden records before validation and accepts an empty portfolio', () => {
  assert.deepEqual(normalizeProjects([null, {}, {visible: false}, {visible: '是'}]), []);
  assert.equal(normalizeProjects([{visible: false, id: 'record-1'}, project()]).length, 1);
  assert.throws(() => normalizeProjects({}), /array/);
});

test('rejects duplicate visible identities and sort values', () => {
  for (const field of ['id', 'slug', 'displayOrder']) {
    const second = project({id: 'record-2', slug: 'second', displayOrder: 2});
    second[field] = project()[field];
    assert.throws(() => normalizeProjects([project(), second]), new RegExp(`Duplicate project ${field}`));
  }
});

test('requires valid identity, content and finite numeric order', () => {
  for (const change of [
    {id: ''}, {title: ' '}, {slug: '../escape'}, {displayOrder: '1'}, {displayOrder: NaN},
    {displayOrder: Infinity}, {summary: null}, {sourceSummary: 1}, {tags: '工具'}, {tags: ['工具', null]},
  ]) assert.throws(() => normalizeProjects([project(change)]));
  assert.equal(normalizeProjects([project({displayOrder: 0, summary: '', sourceSummary: '', tags: []})]).length, 1);
});

test('rejects malformed and non-web project URLs', () => {
  for (const url of ['https://', 'https://bad host/', '/relative', 'javascript:alert(1)', 'file:///tmp/a', null]) {
    assert.throws(() => normalizeProjects([project({url})]), /URL/);
  }
  assert.equal(normalizeProjects([project({url: 'http://example.com/'})]).length, 1);
});

test('rejects asset traversal and unsafe HTML filenames', () => {
  for (const field of ['image', 'video', 'thumbnail']) {
    for (const name of ['../asset.png', '/asset.png', 'folder/asset.png', 'folder\\asset.png', 'a..png', 'a".png', 'a.png?x=1', 'a.png#part', '']) {
      assert.throws(() => normalizeProjects([project({[field]: name})]), /filename/);
    }
  }
  assert.equal(normalizeProjects([project({image: null, video: 'sample.mp4'})]).length, 1);
});

test('requires real dimensions for images and thumbnails', () => {
  for (const value of [0, -1, 1.5, '100', undefined]) {
    assert.throws(() => normalizeProjects([project({width: value})]), /width/);
    assert.throws(() => normalizeProjects([project({thumbnail: 'thumb.webp', thumbnailWidth: 400, thumbnailHeight: value})]), /thumbnailHeight/);
  }
  assert.equal(normalizeProjects([project({thumbnail: 'thumb.webp', thumbnailWidth: 400, thumbnailHeight: 250})]).length, 1);
});

const analytics = {measurementId: 'G-ABC123', siteUrl: 'https://example.com/portfolio/'};

test('normalizes analytics and supports an explicit empty measurement ID override', () => {
  assert.deepEqual(normalizeAnalytics(analytics), analytics);
  assert.deepEqual(normalizeAnalytics(analytics, ''), {...analytics, measurementId: ''});
  assert.equal(normalizeAnalytics(analytics, ' G-XYZ789 ').measurementId, 'G-XYZ789');
  assert.equal(normalizeAnalytics({...analytics, siteUrl: 'https://EXAMPLE.com/'}).siteUrl, 'https://example.com/');
});

test('rejects invalid analytics configuration', () => {
  for (const measurementId of [null, 123, 'G-', 'UA-123', 'G-abc']) {
    assert.throws(() => normalizeAnalytics({...analytics, measurementId}), /measurement ID/);
  }
  for (const siteUrl of ['http://example.com/', 'https://example.com/portfolio', 'https://user:pass@example.com/', 'https://example.com/?x=1', 'https://example.com/#fragment', 'https://example.com/?', 'https://example.com/#', 'https://', null]) {
    assert.throws(() => normalizeAnalytics({...analytics, siteUrl}), /siteUrl/);
  }
  assert.throws(() => normalizeAnalytics(null), /configuration/);
});
