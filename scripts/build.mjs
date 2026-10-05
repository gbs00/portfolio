import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {normalizeProjects, normalizeAnalytics} from './lib/projects.mjs';
import {renderSite} from './lib/render.mjs';
import {readJson, writeJson, createStage, replacePaths} from './lib/files.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildSite({root = projectRoot, outputDir = path.join(root, 'dist'), assetsDir = path.join(root, 'public/assets'), projects = readJson(path.join(root, 'data/projects.json'))} = {}) {
  const visible = normalizeProjects(projects);
  const analyticsFile = path.join(root, 'data/analytics.json');
  const config = normalizeAnalytics(readJson(analyticsFile), process.env.GA4_MEASUREMENT_ID);
  const date = process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid SOURCE_DATE_EPOCH.');
  const pages = renderSite(visible, readJson(path.join(root, 'data/editorial.json')), {...config, year: date.getUTCFullYear()});
  const stage = createStage(root, 'build-');
  const site = path.join(stage, 'site');
  try {
    fs.mkdirSync(path.join(site, 'assets'), {recursive: true});
    for (const filename of ['styles.css', 'analytics.js']) {
      fs.copyFileSync(path.join(root, 'src', filename), path.join(site, filename));
    }
    const assets = new Set(visible.flatMap(project => [project.image, project.video, project.thumbnail]).filter(Boolean));
    for (const filename of assets) fs.copyFileSync(path.join(assetsDir, filename), path.join(site, 'assets', filename));
    for (const [filename, html] of pages) {
      fs.mkdirSync(path.dirname(path.join(site, filename)), {recursive: true});
      fs.writeFileSync(path.join(site, filename), html);
    }
    fs.writeFileSync(path.join(site, '.nojekyll'), '');
    const snapshot = path.join(stage, 'projects.json');
    writeJson(snapshot, visible);
    const checkedAnalytics = path.join(stage, 'analytics.json');
    writeJson(checkedAnalytics, config);
    const validation = execFileSync('python3', [
      path.join(projectRoot, 'scripts/check.py'), '--site-dir', site,
      '--projects-file', snapshot, '--analytics-file', checkedAnalytics,
    ], {encoding: 'utf8'}).trim();
    replacePaths([{source: site, target: outputDir}]);
    return {pages: pages.size, projects: visible.length, validation};
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = buildSite();
  console.log(`Built ${result.pages} pages from ${result.projects} visible projects. ${result.validation}`);
}
