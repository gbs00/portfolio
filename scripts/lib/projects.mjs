function requireText(value, field, project) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${project}: ${field} must be a non-empty string.`);
  }
}

function validateAsset(project, field) {
  const name = project[field];
  if (name == null) return;
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(name) || name.includes('..')) {
    throw new Error(`${project.title}: invalid ${field} filename.`);
  }
}

function requireDimensions(project, width, height) {
  for (const field of [width, height]) {
    if (!Number.isInteger(project[field]) || project[field] <= 0) {
      throw new Error(`${project.title}: ${field} must be a positive integer.`);
    }
  }
}

export function normalizeProjects(records) {
  if (!Array.isArray(records)) throw new Error('Projects must be an array.');
  const projects = records.filter(project => project?.visible === true);
  const ids = new Set();
  const slugs = new Set();
  const orders = new Set();

  for (const project of projects) {
    const label = project.title || project.id || 'Visible project';
    for (const field of ['id', 'slug', 'title']) requireText(project[field], field, label);
    if (!/^[a-z0-9-]+$/.test(project.slug)) throw new Error(`${label}: invalid project slug.`);
    if (!Number.isFinite(project.displayOrder)) throw new Error(`${label}: displayOrder must be a finite number.`);
    for (const [field, seen] of [['id', ids], ['slug', slugs], ['displayOrder', orders]]) {
      if (seen.has(project[field])) throw new Error(`Duplicate project ${field}: ${project[field]}.`);
      seen.add(project[field]);
    }

    let url;
    try {
      if (typeof project.url !== 'string') throw new Error();
      url = new URL(project.url);
    } catch {
      throw new Error(`${label}: invalid project URL.`);
    }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`${label}: project URL must use HTTP or HTTPS.`);
    for (const field of ['summary', 'sourceSummary']) {
      if (typeof project[field] !== 'string') throw new Error(`${label}: ${field} must be a string.`);
    }
    if (!Array.isArray(project.tags) || project.tags.some(tag => typeof tag !== 'string')) {
      throw new Error(`${label}: tags must be an array of strings.`);
    }
    for (const field of ['image', 'video', 'thumbnail']) validateAsset(project, field);
    if (project.image != null) requireDimensions(project, 'width', 'height');
    if (project.thumbnail != null) requireDimensions(project, 'thumbnailWidth', 'thumbnailHeight');
  }

  return projects.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function normalizeAnalytics(config, measurementIdOverride) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Analytics configuration must be an object.');
  }
  const configuredId = measurementIdOverride ?? config.measurementId;
  if (typeof configuredId !== 'string') throw new Error('GA4 measurement ID must be a string.');
  const measurementId = configuredId.trim();
  if (measurementId && !/^G-[A-Z0-9]+$/.test(measurementId)) throw new Error('Invalid GA4 measurement ID.');

  let siteUrl;
  try {
    if (typeof config.siteUrl !== 'string') throw new Error();
    siteUrl = new URL(config.siteUrl);
  } catch {
    throw new Error('Invalid analytics siteUrl.');
  }
  if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || /[?#]/.test(siteUrl.href) || !siteUrl.pathname.endsWith('/')) {
    throw new Error('Analytics siteUrl must use HTTPS, end with a slash, and have no credentials, query or fragment.');
  }
  return {measurementId, siteUrl: siteUrl.href};
}
