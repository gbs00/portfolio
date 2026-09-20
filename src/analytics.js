(() => {
  'use strict';

  const script = document.currentScript;
  const measurementId = script?.dataset.measurementId;
  if (!/^G-[A-Z0-9]+$/.test(measurementId || '')) return;

  const site = new URL(script.dataset.siteUrl);
  const current = new URL(window.location.href);
  // Only the published site sends data. Local previews and copied sites stay quiet.
  if (current.origin !== site.origin || !current.pathname.startsWith(site.pathname)) return;

  const preferences = current.searchParams;
  let disabled = preferences.get('analytics') === 'off';
  let debug = preferences.get('ga_debug') === '1';
  try {
    if (preferences.get('analytics') === 'off') localStorage.setItem('portfolio.analytics.disabled', '1');
    if (preferences.get('analytics') === 'on') localStorage.removeItem('portfolio.analytics.disabled');
    if (preferences.has('ga_debug')) {
      if (debug) sessionStorage.setItem('portfolio.analytics.debug', '1');
      else sessionStorage.removeItem('portfolio.analytics.debug');
    }
    disabled = disabled || localStorage.getItem('portfolio.analytics.disabled') === '1';
    debug = debug || sessionStorage.getItem('portfolio.analytics.debug') === '1';
  } catch {
    // Storage may be unavailable; query-string preferences still work for this page.
  }
  if (disabled) return;

  function cleanUrl(value, keepCampaign = false) {
    if (!value) return '';
    try {
      const url = new URL(value, current);
      const campaign = new URLSearchParams();
      if (keepCampaign) {
        for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id']) {
          if (url.searchParams.has(key)) campaign.set(key, url.searchParams.get(key).slice(0, 100));
        }
      }
      if (url.origin === site.origin && url.pathname.startsWith(site.pathname)) {
        if (url.pathname === site.pathname + 'portfolio.html') url.pathname = site.pathname;
        url.pathname = url.pathname.replace(/\/index\.html$/, '/');
      }
      url.search = campaign.toString();
      url.hash = '';
      return url.href;
    } catch {
      return '';
    }
  }

  function projectData(element) {
    const result = {};
    if (element.dataset.projectId) result.project_id = element.dataset.projectId;
    if (element.dataset.projectName) result.project_name = element.dataset.projectName;
    return result;
  }

  const page = {
    page_type: document.body.dataset.pageType,
    ...projectData(document.body),
  };
  const config = {
    ...page,
    page_location: cleanUrl(current.href, true),
    page_referrer: cleanUrl(document.referrer),
    cookie_path: site.pathname,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(debug ? { debug_mode: true } : {}),
  };
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // The config command sends exactly one page_view; do not send another manually.
  window.gtag('config', measurementId, config);
  if (debug) console.info('[Portfolio GA4] page_view', config);

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(tag);

  function track(name, parameters, callback) {
    const payload = { ...page, ...parameters, send_to: measurementId };
    if (callback) {
      payload.event_callback = callback;
      payload.event_timeout = 200;
    }
    window.gtag('event', name, payload);
    if (debug) console.info('[Portfolio GA4] ' + name, parameters);
  }

  function onClick(event) {
    if (event.defaultPrevented || (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0)) return;
    const link = event.target instanceof Element ? event.target.closest('a[data-analytics-event]') : null;
    if (!link) return;
    const destination = new URL(link.href, current);
    const parameters = {
      ...projectData(link),
      placement: link.dataset.placement,
      link_url: cleanUrl(destination.href),
      link_domain: destination.hostname,
    };
    if (link.dataset.position) parameters.position = Number(link.dataset.position);
    if (link.dataset.profile) parameters.profile = link.dataset.profile;

    const sameTab = event.type === 'click' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      && (!link.target || link.target === '_self') && !link.hasAttribute('download');
    if (sameTab) {
      // A short bounded wait gives gtag time to flush without breaking blocked-tag navigation.
      event.preventDefault();
      let navigated = false;
      const navigate = () => {
        if (navigated) return;
        navigated = true;
        window.location.assign(destination.href);
      };
      setTimeout(navigate, 200);
      track(link.dataset.analyticsEvent, parameters, navigate);
    } else {
      track(link.dataset.analyticsEvent, parameters);
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('auxclick', onClick);

  document.querySelectorAll('video[data-analytics-video]').forEach(video => {
    let started = false;
    let completed = false;
    const milestones = new Set();
    const parameters = percent => ({
      video_provider: 'html5',
      video_title: video.getAttribute('aria-label') || document.title,
      video_url: cleanUrl(video.currentSrc || video.querySelector('source')?.src),
      video_duration: Math.round(video.duration || 0),
      video_current_time: Math.round(video.currentTime || 0),
      video_percent: percent,
    });
    video.addEventListener('play', () => {
      if (started) return;
      started = true;
      track('video_start', parameters(0));
    });
    video.addEventListener('timeupdate', () => {
      if (!started || video.seeking || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const percent = video.currentTime / video.duration * 100;
      for (const milestone of [25, 50, 75]) {
        if (percent >= milestone && !milestones.has(milestone)) {
          milestones.add(milestone);
          track('video_progress', parameters(milestone));
        }
      }
    });
    video.addEventListener('ended', () => {
      if (completed) return;
      completed = true;
      track('video_complete', parameters(100));
    });
  });
})();
