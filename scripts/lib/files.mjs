import fs from 'node:fs';
import path from 'node:path';

export const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
export const writeJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');

export function createStage(root, prefix) {
  const local = path.join(root, '.local');
  fs.mkdirSync(local, {recursive: true});
  return fs.mkdtempSync(path.join(local, prefix));
}

// Publish complete, validated files. A failed rename restores every prior target.
export function replacePaths(replacements) {
  for (const {source} of replacements) {
    if (!fs.existsSync(source)) throw new Error(`Missing staged path: ${source}`);
  }
  const backupParent = path.dirname(replacements[0].target);
  fs.mkdirSync(backupParent, {recursive: true});
  const backup = fs.mkdtempSync(path.join(backupParent, '.portfolio-backup-'));
  const changes = [];
  let preserveBackup = false;
  try {
    for (const [index, {source, target}] of replacements.entries()) {
      fs.mkdirSync(path.dirname(target), {recursive: true});
      const previous = path.join(backup, String(index));
      const change = {target, previous, installed: false, saved: false};
      changes.push(change);
      if (fs.existsSync(target)) {
        fs.renameSync(target, previous);
        change.saved = true;
      }
      fs.renameSync(source, target);
      change.installed = true;
    }
  } catch (error) {
    try {
      for (const change of changes.reverse()) {
        if (change.installed) fs.rmSync(change.target, {recursive: true, force: true});
        if (change.saved) fs.renameSync(change.previous, change.target);
      }
    } catch (rollbackError) {
      preserveBackup = true;
      throw new AggregateError([error, rollbackError], `Could not restore all files. Backup preserved at ${backup}`);
    }
    throw error;
  } finally {
    if (!preserveBackup) fs.rmSync(backup, {recursive: true, force: true});
  }
}
