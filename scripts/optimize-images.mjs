import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareImage} from './lib/media.mjs';
import {normalizeProjects} from './lib/projects.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = path.join(root, 'data/projects.json');
const assets = path.join(root, 'public/assets');
const records = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
let originalBytes = 0;
let displayBytes = 0;
let previews = 0;

for (const project of normalizeProjects(records)) {
  if (!project.image) continue;
  const original = path.join(assets, project.image);
  const preview = path.join(assets, `${project.slug}-preview.jpg`);
  const media = prepareImage(original, preview);
  for (const field of ['thumbnail', 'thumbnailWidth', 'thumbnailHeight']) delete project[field];
  Object.assign(project, media);
  originalBytes += fs.statSync(original).size;
  displayBytes += fs.statSync(path.join(assets, media.thumbnail ?? project.image)).size;
  if (media.thumbnail) previews += 1;
}

fs.writeFileSync(projectsPath, JSON.stringify(records, null, 2) + '\n');
console.log(`Prepared ${previews} smaller image previews. Cover bytes: ${originalBytes} → ${displayBytes}. Original images preserved.`);
