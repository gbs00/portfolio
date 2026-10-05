import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const sips = '/usr/bin/sips';
const canUseSips = process.platform === 'darwin' && fs.existsSync(sips);
const minPreviewBytes = 150 * 1024;
const maxPreviewDimension = 1280;

function readDimensions(filename) {
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(filename, 'r');
  let length;
  try {
    length = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  let width, height;
  const isGif = /^GIF8[79]a$/.test(header.toString('ascii', 0, 6));
  if (length >= 24 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = header.readUInt32BE(16);
    height = header.readUInt32BE(20);
  } else if (length >= 10 && isGif) {
    width = header.readUInt16LE(6);
    height = header.readUInt16LE(8);
  } else {
    if (!canUseSips) throw new Error(`Cannot read dimensions for ${path.basename(filename)}: this image format requires macOS sips.`);
    const output = execFileSync(sips, ['-g', 'pixelWidth', '-g', 'pixelHeight', filename], {encoding: 'utf8'});
    width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
    height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Cannot read valid image dimensions for ${path.basename(filename)}.`);
  }
  return {width, height, isGif};
}

export function prepareImage(sourcePath, previewPath) {
  if (path.resolve(sourcePath) === path.resolve(previewPath)) throw new Error('Image preview must not overwrite the original.');
  const {width, height, isGif} = readDimensions(sourcePath);
  const dimensions = {width, height};
  const sourceBytes = fs.statSync(sourcePath).size;
  if (!canUseSips || isGif || sourceBytes <= minPreviewBytes) {
    fs.rmSync(previewPath, {force: true});
    return dimensions;
  }

  fs.mkdirSync(path.dirname(previewPath), {recursive: true});
  const stage = fs.mkdtempSync(path.join(path.dirname(previewPath), '.preview-'));
  const candidate = path.join(stage, 'preview.jpg');
  try {
    execFileSync(sips, [
      '-s', 'format', 'jpeg', '-s', 'formatOptions', '85',
      ...(Math.max(width, height) > maxPreviewDimension ? ['-Z', String(maxPreviewDimension)] : []),
      sourcePath, '--out', candidate,
    ], {stdio: 'pipe'});
    if (fs.statSync(candidate).size >= sourceBytes) {
      fs.rmSync(previewPath, {force: true});
      return dimensions;
    }
    const preview = readDimensions(candidate);
    fs.renameSync(candidate, previewPath);
    return {
      ...dimensions,
      thumbnail: path.basename(previewPath),
      thumbnailWidth: preview.width,
      thumbnailHeight: preview.height,
    };
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}
