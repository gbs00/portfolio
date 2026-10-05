import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildSite, projectRoot} from './build.mjs';
import {normalizeProjects} from './lib/projects.mjs';
import {prepareImage} from './lib/media.mjs';
import {readJson, writeJson, createStage, replacePaths} from './lib/files.mjs';

const fields = ['名称', '显示', '显示排序', '简述', '链接', '标签', '附件'];
const plain = value => String(value ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const single = value => Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
const urlOf = value => String(value ?? '').match(/\]\((https?:\/\/[^)]+)\)$/)?.[1] || String(value ?? '');
const hashFile = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const matches = (filename, hash) => Boolean(hash && fs.existsSync(filename) && hashFile(filename) === hash);

function readSource(root) {
  const filename = path.join(root, '.local/source.json');
  const config = fs.existsSync(filename) ? readJson(filename) : {};
  return {
    baseToken: process.env.FEISHU_BASE_TOKEN || config.baseToken,
    tableId: process.env.FEISHU_TABLE_ID || config.tableId,
    viewId: process.env.FEISHU_VIEW_ID || config.viewId,
  };
}

function larkRunner(root) {
  return args => {
    const response = JSON.parse(execFileSync('lark-cli', [...args, '--as', 'user', '--format', 'json'], {
      cwd: root, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024,
    }));
    if (!response.ok) throw new Error('Feishu request failed. Check lark-cli authorization.');
    return response.data;
  };
}

function readRecords(config, run) {
  const rows = [];
  let offset = 0;
  let revision;
  for (;;) {
    const page = run([
      'base', '+record-list', '--base-token', config.baseToken, '--table-id', config.tableId,
      ...(config.viewId ? ['--view-id', config.viewId] : []),
      ...fields.flatMap(field => ['--field-id', field]), '--limit', '200', '--offset', String(offset),
    ]);
    if (!Array.isArray(page.fields) || fields.some(field => !page.fields.includes(field)) || !Array.isArray(page.data)
      || !Array.isArray(page.record_id_list) || page.record_id_list.length !== page.data.length || typeof page.has_more !== 'boolean') {
      throw new Error('Incomplete Feishu record response. The current snapshot was preserved.');
    }
    if (offset === 0) revision = page.rev;
    if (page.rev !== revision) throw new Error('Feishu changed during pagination. Retry the sync.');
    page.data.forEach((values, index) => {
      if (!Array.isArray(values) || values.length !== page.fields.length) throw new Error('Incomplete Feishu row.');
      rows.push({record_id: page.record_id_list[index], ...Object.fromEntries(page.fields.map((name, column) => [name, values[column]]))});
    });
    if (!page.has_more) return rows;
    if (!page.data.length) throw new Error('Feishu returned an empty incomplete page.');
    offset += page.data.length;
  }
}

function projectFromRow(row, known) {
  const id = row.record_id;
  if (typeof id !== 'string' || !id) throw new Error('Feishu record is missing its ID.');
  const slug = known.get(id)?.slug || `project-${id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const rawOrder = single(row['显示排序']);
  const displayOrder = typeof rawOrder === 'number' || (typeof rawOrder === 'string' && rawOrder.trim()) ? Number(rawOrder) : NaN;
  const title = plain(row['名称']).trim();
  return {
    id, slug, title: slug === 'blog' ? '个人博客' : slug === 'sidenote' ? 'SideNote 边角记' : title,
    visible: true, displayOrder,
    summary: plain(row['简述']).replace(/\r?\n/g, '，'), sourceSummary: plain(row['简述']),
    url: urlOf(row['链接']), tags: row['标签'] ?? [], image: null,
    imageAlt: title + '预览', video: null,
  };
}

export function syncFeishu({root = projectRoot, config = readSource(root), run = larkRunner(root)} = {}) {
  if (!config.baseToken || !config.tableId) throw new Error('Configure FEISHU_BASE_TOKEN / FEISHU_TABLE_ID or .local/source.json.');
  const projectsFile = path.join(root, 'data/projects.json');
  const known = new Map(normalizeProjects(readJson(projectsFile)).map(project => [project.id, project]));
  const rows = readRecords(config, run).filter(row => single(row['显示']) === '是');
  const projects = normalizeProjects(rows.map(row => projectFromRow(row, known)));
  const attachments = new Map(rows.map(row => [row.record_id, row['附件'] ?? []]));
  const cacheFile = path.join(root, '.local/media-cache.json');
  const identity = `${config.baseToken}:${config.tableId}`;
  const savedCache = fs.existsSync(cacheFile) ? readJson(cacheFile) : {};
  const cache = savedCache.identity === identity ? savedCache.files ?? {} : {};
  const nextCache = {identity, files: {}};
  const stage = createStage(root, 'sync-');
  const stagedAssets = path.join(stage, 'assets');
  const assets = path.join(root, 'public/assets');
  let downloaded = 0;
  let reused = 0;
  try {
    fs.mkdirSync(stagedAssets);
    // The installed CLI returns JSON; keep its record projection as a private NDJSON artifact.
    fs.writeFileSync(path.join(stage, 'records.ndjson'), rows.map(row => JSON.stringify(row) + '\n').join(''));
    for (const project of projects) {
      const media = attachments.get(project.id);
      if (!Array.isArray(media)) throw new Error(`${project.title}: invalid attachments.`);
      for (const [kind, pattern] of [['image', /\.(png|jpe?g|webp|gif)$/i], ['video', /\.mp4$/i]]) {
        const attachment = media.find(item => pattern.test(item.name));
        if (!attachment) continue;
        if (!attachment.file_token) throw new Error(`${project.title}: attachment has no token.`);
        const filename = project.slug + path.extname(attachment.name).toLowerCase();
        const source = path.join(assets, filename);
        const target = path.join(stagedAssets, filename);
        const previous = cache[filename];
        const unchanged = previous?.token === attachment.file_token && matches(source, previous.hash);
        if (unchanged) {
          fs.copyFileSync(source, target);
          reused += 1;
        } else {
          run(['base', '+record-download-attachment', '--base-token', config.baseToken, '--table-id', config.tableId,
            '--record-id', project.id, '--file-token', attachment.file_token, '--output', path.relative(root, target)]);
          downloaded += 1;
        }
        if (!fs.existsSync(target) || !fs.statSync(target).size) throw new Error(`${project.title}: empty ${kind} download.`);
        project[kind] = filename;
        const entry = {token: attachment.file_token, hash: hashFile(target)};
        if (kind === 'image') {
          const previewName = `${project.slug}-preview.jpg`;
          const preview = path.join(stagedAssets, previewName);
          const reusablePreview = !previous?.media?.thumbnail || (previous.media.thumbnail === previewName && matches(path.join(assets, previewName), previous.previewHash));
          if (unchanged && previous.media && reusablePreview) {
            Object.assign(project, previous.media);
            if (previous.media.thumbnail) fs.copyFileSync(path.join(assets, previewName), preview);
            entry.media = previous.media;
          } else {
            entry.media = prepareImage(target, preview);
            Object.assign(project, entry.media);
          }
          if (project.thumbnail) entry.previewHash = hashFile(preview);
        }
        nextCache.files[filename] = entry;
      }
    }
    const snapshot = path.join(stage, 'projects.json');
    writeJson(snapshot, normalizeProjects(projects));
    const nextCacheFile = path.join(stage, 'media-cache.json');
    writeJson(nextCacheFile, nextCache);
    const stagedSite = path.join(stage, 'site');
    const built = buildSite({root, projects, assetsDir: stagedAssets, outputDir: stagedSite});
    replacePaths([
      {source: stagedAssets, target: assets},
      {source: snapshot, target: projectsFile},
      {source: stagedSite, target: path.join(root, 'dist')},
      {source: nextCacheFile, target: cacheFile},
    ]);
    return {...built, downloaded, reused};
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = syncFeishu();
  console.log(`Synced ${result.projects} visible projects: ${result.downloaded} attachments downloaded, ${result.reused} reused. ${result.validation}`);
}
