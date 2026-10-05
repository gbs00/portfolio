import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8');
const siteUrl = 'https://gbs00.github.io/portfolio/';
const measurementId = 'G-YRCZTGL1RM';

function storage(initial = {}, unavailable = false) {
  const values = new Map(Object.entries(initial));
  const access = () => { if (unavailable) throw new Error('Storage unavailable'); };
  return {
    getItem(key) { access(); return values.get(key) ?? null; },
    setItem(key, value) { access(); values.set(key, value); },
    removeItem(key) { access(); values.delete(key); },
  };
}

function video() {
  const listeners = new Map();
  return {
    duration: 100,
    currentTime: 0,
    seeking: false,
    currentSrc: siteUrl + 'assets/demo.mp4?private=value#frame',
    getAttribute: () => '演示视频',
    addEventListener(name, handler) { listeners.set(name, handler); },
    emit(name) { listeners.get(name)?.(); },
  };
}

function load({
  href = siteUrl,
  referrer = '',
  local = storage(),
  session = storage(),
  videos = [],
  body = { pageType: 'portfolio' },
} = {}) {
  const listeners = new Map();
  const timers = new Map();
  const tags = [];
  const navigations = [];
  let timerId = 0;
  class Element {
    constructor(link) { this.link = link; }
    closest() { return this.link; }
  }
  const window = {
    location: { href, assign: url => navigations.push(url) },
  };
  vm.runInNewContext(source, {
    URL, URLSearchParams, Element, window,
    localStorage: local,
    sessionStorage: session,
    console: { info() {} },
    setTimeout(handler, delay) { timers.set(++timerId, { handler, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      currentScript: { dataset: { measurementId, siteUrl } },
      body: { dataset: body },
      referrer,
      title: '作品集',
      createElement: () => ({}),
      head: { appendChild: tag => tags.push(tag) },
      addEventListener(name, handler) { listeners.set(name, handler); },
      querySelectorAll: () => videos,
    },
  });
  return {
    tags, timers, navigations,
    get commands() { return Array.from(window.dataLayer ?? [], command => Array.from(command)); },
    get config() { return this.commands.find(command => command[0] === 'config')?.[2]; },
    get events() { return this.commands.filter(command => command[0] === 'event'); },
    click(options = {}, linkOptions = {}) {
      const link = {
        href: siteUrl + 'projects/token-bi/index.html',
        target: '',
        hasAttribute: () => false,
        dataset: { analyticsEvent: 'project_open', projectId: 'token-bi', projectName: 'Token BI', placement: 'grid', position: '1' },
        ...linkOptions,
      };
      const event = {
        type: 'click', button: 0, defaultPrevented: false,
        target: new Element(link),
        preventDefault() { this.defaultPrevented = true; },
        ...options,
      };
      listeners.get(event.type)?.(event);
      return event;
    },
    expireTimer() {
      assert.equal(timers.size, 1);
      const [id, timer] = timers.entries().next().value;
      assert.equal(timer.delay, 200);
      timers.delete(id);
      timer.handler();
    },
  };
}

test('only the published origin and portfolio path initialize analytics', () => {
  for (const href of ['http://localhost:4173/', 'https://example.com/portfolio/', 'https://gbs00.github.io/portfolio-copy/']) {
    const app = load({ href });
    assert.equal(app.tags.length, 0);
    assert.equal(app.commands.length, 0);
  }
  assert.equal(load().tags.length, 1);
});

test('opt-out and opt-in preferences work with persisted and unavailable storage', () => {
  const local = storage();
  assert.equal(load({ href: siteUrl + '?analytics=off', local }).tags.length, 0);
  assert.equal(load({ local }).tags.length, 0);
  assert.equal(load({ href: siteUrl + '?analytics=on', local }).tags.length, 1);
  assert.equal(load({ href: siteUrl + '?analytics=off', local: storage({}, true) }).tags.length, 0);
});

test('local and session storage failures do not suppress the other preference', () => {
  const debug = load({ local: storage({}, true), session: storage({ 'portfolio.analytics.debug': '1' }) });
  assert.equal(debug.config.debug_mode, true);
  const disabled = load({
    href: siteUrl + '?ga_debug=1',
    local: storage({ 'portfolio.analytics.disabled': '1' }),
    session: storage({}, true),
  });
  assert.equal(disabled.tags.length, 0);
  assert.equal(load({ href: siteUrl + '?ga_debug=1', session: storage({}, true) }).config.debug_mode, true);
});

test('one config sends the page view with canonical URLs and only allowed campaign parameters', () => {
  for (const entry of ['', 'index.html', 'portfolio.html']) {
    const app = load({
      href: siteUrl + entry + '?utm_source=newsletter&utm_medium=email&email=private@example.com#section',
      referrer: 'https://example.com/article?email=private@example.com#section',
    });
    assert.deepEqual(app.commands.map(command => command[0]), ['js', 'config']);
    assert.equal(app.commands[1][1], measurementId);
    assert.equal(app.config.page_location, siteUrl + '?utm_source=newsletter&utm_medium=email');
    assert.equal(app.config.page_referrer, 'https://example.com/article');
    assert.equal(app.config.allow_google_signals, false);
    assert.equal(app.config.allow_ad_personalization_signals, false);
    assert.equal(app.config.cookie_path, '/portfolio/');
  }
  const detail = load({ href: siteUrl + 'projects/token-bi/index.html?ga_debug=1#main' });
  assert.equal(detail.config.page_location, siteUrl + 'projects/token-bi/');
});

test('pending or failed Google tags never intercept native navigation', () => {
  for (const failed of [false, true]) {
    const app = load();
    if (failed) app.tags[0].onerror();
    assert.equal(app.click().defaultPrevented, false);
    assert.equal(app.timers.size, 0);
    assert.equal(app.navigations.length, 0);
    assert.equal(app.events[0][1], 'project_open');
    assert.equal(app.events[0][2].project_id, 'token-bi');
    assert.equal(app.events[0][2].link_url, siteUrl + 'projects/token-bi/');
    assert.equal(app.events[0][2].event_callback, undefined);
  }
});

test('loaded tag callback navigates exactly once and clears the fallback timer', () => {
  const app = load();
  app.tags[0].onload();
  assert.equal(app.click().defaultPrevented, true);
  assert.equal(app.timers.size, 1);
  const callback = app.events[0][2].event_callback;
  const fallback = app.timers.values().next().value.handler;
  callback();
  assert.equal(app.timers.size, 0);
  callback();
  fallback();
  assert.deepEqual(app.navigations, [siteUrl + 'projects/token-bi/index.html']);
});

test('loaded tag times out after 200 ms and a late callback cannot repeat navigation', () => {
  const app = load();
  app.tags[0].onload();
  app.click();
  app.expireTimer();
  app.events[0][2].event_callback();
  assert.equal(app.navigations.length, 1);
  assert.equal(app.timers.size, 0);
});

test('modified clicks, new tabs and downloads retain native behavior', () => {
  for (const [event, link] of [
    [{ metaKey: true }, {}], [{ ctrlKey: true }, {}],
    [{ shiftKey: true }, {}], [{ altKey: true }, {}],
    [{ type: 'auxclick', button: 1 }, {}],
    [{}, { target: '_blank' }], [{}, { hasAttribute: name => name === 'download' }],
  ]) {
    const app = load();
    app.tags[0].onload();
    assert.equal(app.click(event, link).defaultPrevented, false);
    assert.equal(app.timers.size, 0);
    assert.equal(app.events.length, 1);
  }
  for (const event of [{ defaultPrevented: true }, { button: 2 }, { type: 'auxclick', button: 2 }]) {
    const app = load();
    app.tags[0].onload();
    app.click(event);
    assert.equal(app.events.length, 0);
  }
});

test('video milestones emit once per page across repeated updates and replays', () => {
  const media = video();
  const app = load({ videos: [media], body: { pageType: 'project', projectId: 'demo', projectName: 'Demo' } });
  media.currentTime = 25;
  media.emit('timeupdate');
  assert.equal(app.events.length, 0);
  media.currentTime = 0;
  media.emit('play');
  media.emit('play');
  media.seeking = true;
  media.currentTime = 80;
  media.emit('timeupdate');
  assert.equal(app.events.length, 1);
  media.seeking = false;
  for (const time of [25, 25, 50, 75, 100]) {
    media.currentTime = time;
    media.emit('timeupdate');
  }
  media.emit('ended');
  media.emit('play');
  media.emit('timeupdate');
  media.emit('ended');
  assert.deepEqual(app.events.map(command => [command[1], command[2].video_percent]), [
    ['video_start', 0], ['video_progress', 25], ['video_progress', 50], ['video_progress', 75], ['video_complete', 100],
  ]);
  for (const [, , payload] of app.events) {
    assert.equal(payload.project_id, 'demo');
    assert.equal(payload.video_title, '演示视频');
    assert.equal(payload.video_url, siteUrl + 'assets/demo.mp4');
  }
});
