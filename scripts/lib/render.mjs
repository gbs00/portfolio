const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const arrow = '<span class="arrow" aria-hidden="true">↗</span>';
const fonts = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#222522"/><text x="14" y="47" font-family="Arial,sans-serif" font-size="44" font-weight="bold" fill="#fbfcf9">t</text><circle cx="48" cy="46" r="6" fill="#d54822"/></svg>');
const personalLinks = [
  {profile: 'blog', label: '个人博客', url: 'https://www.gbs00.cc/'},
  {profile: 'github', label: 'GitHub 仓库', url: 'https://github.com/gbs00?tab=repositories'},
];

function tracking(event, placement, project, position) {
  const attributes = {'analytics-event': event, placement};
  if (project) Object.assign(attributes, {'project-id': project.slug, 'project-name': project.title});
  if (position != null) attributes.position = position;
  return Object.entries(attributes).map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`).join('');
}

function profileLinks(placement) {
  return personalLinks.map(link => `<a${placement === 'header' ? ' class="personal-link"' : ''}${tracking('profile_click', placement)} data-profile="${link.profile}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${link.label} ↗</a>`).join('');
}

function shell(title, description, body, config, project = null) {
  const base = project ? '../../' : './';
  const analytics = config.measurementId
    ? `<script defer src="${base}analytics.js" data-measurement-id="${escapeHtml(config.measurementId)}" data-site-url="${escapeHtml(config.siteUrl)}"></script>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#fbfcf9">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${escapeHtml(fonts)}">
  <link rel="stylesheet" href="${base}styles.css">
  ${analytics}
</head>
<body data-page-type="${project ? 'project' : 'portfolio'}"${project ? ` data-project-id="${escapeHtml(project.slug)}" data-project-name="${escapeHtml(project.title)}"` : ''}>
  <a class="skip" href="#main">跳转到内容</a>
  <div class="wrap">
    <header class="header">
      <a class="logo" href="${base}index.html" aria-label="Tim 的主页">tim<span class="logo-mark"></span></a>
      <nav class="nav" aria-label="主导航"><a href="${base}index.html" aria-current="page">作品集</a>${profileLinks('header')}</nav>
    </header>
    <main id="main">${body}</main>
    <footer class="footer"><span>© ${config.year} Tim</span><div class="footer-links">${profileLinks('footer')}<a href="#main">回到顶部 ↑</a></div></footer>
  </div>
</body>
</html>`;
}

function tags(project) {
  return `<div class="tags">${project.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function image(project, base, priority = false) {
  const filename = project.thumbnail || project.image;
  const width = project.thumbnail ? project.thumbnailWidth : project.width;
  const height = project.thumbnail ? project.thumbnailHeight : project.height;
  return `<img src="${base}assets/${filename}" alt="${escapeHtml(project.imageAlt || project.title + '预览')}" width="${width}" height="${height}" loading="${priority ? 'eager' : 'lazy'}" decoding="async"${priority ? ' fetchpriority="high"' : ''}>`;
}

function card(project, index) {
  const preview = project.image
    ? `<div class="project-visual visual-${project.slug}">${image(project, './', index === 0)}${project.slug === 'blog' ? '<div class="blog-wordmark">gbs00.cc<small>我与世界的交互艺术</small></div>' : ''}<span class="card-arrow" aria-hidden="true">↗</span></div>`
    : `<div class="project-visual project-placeholder"><span>${escapeHtml(project.title)}</span><span class="card-arrow" aria-hidden="true">↗</span></div>`;
  return `<a class="project-card"${tracking('project_open', 'grid', project, index + 1)} href="./projects/${project.slug}/index.html" aria-label="查看${escapeHtml(project.title)}作品详情">
    ${preview}
    <div class="card-info"><div class="card-title-line"><h3>${escapeHtml(project.title)}</h3><span class="card-index">${String(index + 1).padStart(2, '0')}</span></div><p class="card-description">${escapeHtml(project.summary)}</p>${tags(project)}</div>
  </a>`;
}

function portfolioPage(projects, config) {
  const count = String(projects.length).padStart(2, '0');
  const body = `<section class="work-hero">
    <div><div class="eyebrow">Selected projects</div><h1>一点想法，<br>一些<em class="accent" style="font-style:normal">作品。</em></h1><p>从一个日常问题出发，做出可以使用的答案。<br>这里收录我的工具、实验与持续写作。</p></div>
    <div class="work-count">${count}<small>PROJECTS & IDEAS</small></div>
  </section>
  <div class="work-toolbar"><strong>全部作品 / ${count}</strong><span>工具 · 数据 · 文字</span></div>
  <section class="all-projects" aria-label="全部作品"><div class="project-grid">${projects.map(card).join('')}</div></section>`;
  return shell('Tim · 作品集', `浏览 Tim 的作品：${projects.map(project => project.title).join('、')}。`, body, config);
}

function projectDetails(project, editorial) {
  const details = {
    kicker: 'PROJECT NOTES', headline: project.title, format: '个人作品',
    destination: new URL(project.url).hostname, action: '访问作品', overview: project.summary, features: [],
    ...editorial[project.slug],
  };
  for (const field of ['kicker', 'headline', 'format', 'destination', 'action', 'overview']) {
    if (typeof details[field] !== 'string') throw new Error(`${project.title}: invalid editorial ${field}.`);
  }
  if (!Array.isArray(details.features) || details.features.some(feature => !Array.isArray(feature) || feature.length !== 2 || feature.some(value => typeof value !== 'string'))) {
    throw new Error(`${project.title}: editorial features must contain title/text pairs.`);
  }
  return details;
}

function visitButton(project, details, placement) {
  return `<a class="button"${tracking('project_outbound', placement, project)} href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(details.action)} ${arrow}</a>`;
}

function projectPage(project, next, nextPosition, editorial, config) {
  const details = projectDetails(project, editorial);
  const title = escapeHtml(project.title);
  const figure = project.image ? `<figure class="detail-figure">
    <a class="detail-image-link detail-image-${project.slug}" href="../../assets/${project.image}" target="_blank" rel="noopener noreferrer" aria-label="打开${title}预览原图">${image(project, '../../', true)}</a>
    <figcaption>${escapeHtml(project.imageAlt || project.title + '预览')}<span>点击图片查看原图 ↗</span></figcaption>
  </figure>` : '';
  const features = details.features.length ? `<section class="detail-features">
    <div class="section-heading"><div><div class="eyebrow">A closer look</div><h2>体验要点</h2></div></div>
    <div class="feature-grid">${details.features.map(([heading, text], index) => `<article class="feature"><span class="feature-no">${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(text)}</p></article>`).join('')}</div>
  </section>` : '';
  const video = project.video ? `<section class="video-section">
    <div class="section-heading"><div><div class="eyebrow">In motion</div><h2>看看它如何使用</h2></div></div>
    <video data-analytics-video controls playsinline preload="none"${project.image ? ` poster="../../assets/${project.thumbnail || project.image}"` : ''} aria-label="${title}产品演示视频"><source src="../../assets/${project.video}" type="video/mp4">你的浏览器不支持视频播放，请<a href="../../assets/${project.video}">下载演示视频</a>。</video>
  </section>` : '';
  const body = `<nav class="breadcrumb" aria-label="面包屑"><a href="../../portfolio.html">← 全部作品</a><span>/</span><span>${title}</span></nav>
  <section class="detail-hero"><div><div class="eyebrow">${escapeHtml(details.kicker)}</div><h1>${title}</h1><p class="detail-headline">${escapeHtml(details.headline)}</p>${tags(project)}</div>${visitButton(project, details, 'hero')}</section>
  <div class="detail-meta"><div><span>作品形式</span><strong>${escapeHtml(details.format)}</strong></div><div><span>关注领域</span><strong>${escapeHtml(project.tags.join(' / '))}</strong></div><div><span>访问入口</span><strong>${escapeHtml(details.destination)}</strong></div></div>
  ${figure}
  <section class="detail-story"><div><div class="eyebrow">Overview</div><h2>关于这件作品</h2></div><div><p class="story-lead">${escapeHtml(details.overview)}</p><blockquote>${escapeHtml(project.sourceSummary).replace(/\n/g, '<br>')}</blockquote></div></section>
  ${features}${video}
  <section class="visit-section"><div><span class="eyebrow">Explore the project</span><h2>到作品里看看。</h2></div>${visitButton(project, details, 'bottom')}</section>
  <nav class="project-pagination" aria-label="作品导航"><a class="text-link" href="../../portfolio.html">← 返回作品集</a><a class="next-project"${tracking('project_open', 'next_project', next, nextPosition)} href="../${next.slug}/index.html"><small>下一个作品</small><span>${escapeHtml(next.title)} →</span></a></nav>`;
  return shell(`${project.title} · Tim 的作品集`, project.summary, body, config, project);
}

export function renderSite(projects, editorial, config) {
  const homepage = portfolioPage(projects, config);
  const pages = new Map([['index.html', homepage], ['portfolio.html', homepage]]);
  projects.forEach((project, index) => {
    const nextIndex = (index + 1) % projects.length;
    pages.set(`projects/${project.slug}/index.html`, projectPage(project, projects[nextIndex], nextIndex + 1, editorial, config));
  });
  return pages;
}
