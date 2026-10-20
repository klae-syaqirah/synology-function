/*
 * Synology Package Guide - page rendering and routing.
 * Pages use hash URLs so every view can be shared as a link:
 *   #/                     overview
 *   #/apps?dept=sales&q=   all packages, with filters
 *   #/app/<id>             one package
 *   #/departments          department list
 *   #/dept/<id>            packages for one department
 *   #/guide?s=<section>    guide, policy, FAQ, glossary
 */
(function () {
  'use strict';

  const main = document.getElementById('main');

  let DATA = null;
  const appsById = new Map();
  const deptsById = new Map();

  // Install status, installed versions and "do not uninstall" warnings describe our own NAS.
  // They are hidden unless settings > show_nas_status is "yes" (keep it "no" on the public site).
  let SHOW_NAS = false;

  const NAS_LONG = {
    installed: 'Installed on our NAS',
    update: 'Installed · update available',
    'not-installed': 'Not installed on our NAS',
  };
  const NAS_SHORT = { installed: 'Installed', update: 'Update available', 'not-installed': 'Not installed' };
  const APPROVAL = { approved: 'Approved', review: 'IT approval needed', avoid: 'Not recommended' };
  const APPROVAL_CLASS = { approved: 'badge-brand', review: 'badge-warn', avoid: 'badge-bad' };
  const USER_TYPE = { 'end-user': 'Staff use it directly', 'it-admin': 'Managed by IT', developer: 'Developer tool' };
  const USER_TYPE_SHORT = { 'end-user': 'End user', 'it-admin': 'IT admin', developer: 'Developer' };
  const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'i', 'my', 'our', 'how', 'do', 'of', 'for', 'and', 'with', 'want', 'can', 'in', 'on', 'is']);

  const DEFAULT_SETTINGS = {
    company_name: 'KLAE Group',
    site_title: 'Synology Package Guide',
    intro: 'What each package on our Synology NAS does, which department it is for, and how to start using it.',
    it_contact_name: 'IT Department',
  };

  // ---------- small helpers ----------

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Escape text and turn plain URLs into links.
  function inline(value) {
    return esc(value).replace(/https?:\/\/[^\s<]+[^\s<.,;:)'"]/g, (url) => '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>');
  }

  function paragraphs(value) {
    return String(value || '')
      .split(/\r?\n\s*\r?\n|\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => '<p>' + inline(p) + '</p>')
      .join('');
  }

  function setting(key) {
    const v = DATA && DATA.settings[key];
    return v != null && v !== '' ? v : DEFAULT_SETTINGS[key] || '';
  }

  function settingLines(key) {
    return String(setting(key))
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim())
      .filter(Boolean);
  }

  function deptName(id) {
    if (id === 'all') return 'All staff';
    const d = deptsById.get(id);
    return d ? d.name : id;
  }

  function initials(name) {
    return name
      .replace(/^Synology\s+/i, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function setTitle(title) {
    const base = setting('site_title') + ' · ' + setting('company_name');
    document.title = title ? title + ' · ' + base : base;
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  const NAS_ORDER = { installed: 0, update: 0, 'not-installed': 1 };
  const APPROVAL_ORDER = { approved: 0, review: 1, avoid: 2 };

  function byUsefulness(a, b) {
    return NAS_ORDER[a.nas] - NAS_ORDER[b.nas] || APPROVAL_ORDER[a.approval] - APPROVAL_ORDER[b.approval] || byName(a, b);
  }

  // Tagged for the department, for everyone, or has a use case written for that department.
  function relevantTo(app, deptId) {
    return app.departments.includes(deptId) || app.departments.includes('all') || Boolean(app.useCaseByDept[deptId]);
  }

  // ---------- building blocks ----------

  function icon(app, extraClass) {
    return (
      '<img class="app-icon' + (extraClass ? ' ' + extraClass : '') + '" src="' + esc(app.icon) +
      '" alt="" loading="lazy" data-initials="' + esc(initials(app.name)) + '">'
    );
  }

  function nasBadge(app, long) {
    const cls = app.nas === 'installed' ? ' badge-ok' : app.nas === 'update' ? ' badge-warn' : '';
    return '<span class="badge badge-dot' + cls + '">' + esc(long ? NAS_LONG[app.nas] : NAS_SHORT[app.nas]) + '</span>';
  }

  function approvalBadge(app) {
    return '<span class="badge ' + APPROVAL_CLASS[app.approval] + '">' + esc(APPROVAL[app.approval]) + '</span>';
  }

  function sourceBadge(app) {
    return app.section.toLowerCase() === 'synology' ? '' : '<span class="badge">' + esc(app.section) + '</span>';
  }

  // opts.hideSource: leave out the "Open Source" badge (list is already grouped by source)
  // opts.useCase: show this department-specific use case instead of the general summary
  function appCard(app, opts) {
    opts = opts || {};
    const foot = [SHOW_NAS ? nasBadge(app) : '<span class="badge">' + esc(USER_TYPE_SHORT[app.userType]) + '</span>'];
    if (app.approval !== 'approved') foot.push(approvalBadge(app));
    if (!opts.hideSource) foot.push(sourceBadge(app));
    return (
      '<a class="app-card" href="#/app/' + esc(app.id) + '">' +
      '<div class="app-card-head">' + icon(app) +
      '<div><div class="app-card-name">' + esc(app.name) + '</div>' +
      '<div class="app-card-cat">' + esc(app.categories.join(', ')) + '</div></div></div>' +
      (opts.useCase
        ? '<p class="app-card-summary is-use-case">' + esc(opts.useCase) + '</p>'
        : '<p class="app-card-summary">' + esc(app.summary) + '</p>') +
      '<div class="app-card-foot">' + foot.join('') + '</div>' +
      '</a>'
    );
  }

  function miniApp(app) {
    return '<a class="mini-app" href="#/app/' + esc(app.id) + '">' + icon(app) + esc(app.name) + '</a>';
  }

  function copyButton(label) {
    return (
      '<button type="button" class="btn" data-copy>' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 01-3.5-3.5L5.5 8"/></svg>' +
      esc(label || 'Copy link') + '</button>'
    );
  }

  function contactLine() {
    const parts = [];
    const name = setting('it_contact_name');
    const email = setting('it_contact_email');
    const phone = setting('it_contact_phone');
    if (email) parts.push('<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>');
    if (phone) parts.push(esc(phone));
    return esc(name) + (parts.length ? ' · ' + parts.join(' · ') : '');
  }

  // ---------- search & filters ----------

  function searchScore(app, query) {
    const q = query.trim().toLowerCase();
    if (!q) return 1;
    const terms = q.split(/\s+/).filter((t) => t && !STOP_WORDS.has(t));
    const name = app.name.toLowerCase();
    const keywords = app.keywords.join(' | ');
    const cats = app.categories.join(' ').toLowerCase();
    const summary = app.summary.toLowerCase();
    const body = [app.description].concat(app.useCases, app.howTo, app.tips).join(' ').toLowerCase();

    let total = 0;
    if (name.includes(q)) total += 20;
    if (app.keywords.includes(q)) total += 15;
    if (!terms.length) return total;

    for (const t of terms) {
      let s = 0;
      if (name.includes(t)) s += 10;
      if (keywords.includes(t)) s += 6;
      if (cats.includes(t)) s += 3;
      if (summary.includes(t)) s += 3;
      if (body.includes(t)) s += 1;
      if (!s) return 0;
      total += s;
    }
    return total;
  }

  function matchesFilters(app, f) {
    if (f.dept && !relevantTo(app, f.dept)) return false;
    if (SHOW_NAS && f.nas === 'installed' && app.nas === 'not-installed') return false;
    if (SHOW_NAS && f.nas && f.nas !== 'installed' && app.nas !== f.nas) return false;
    if (f.approval && app.approval !== f.approval) return false;
    if (f.type && app.userType !== f.type) return false;
    if (f.cat && !app.categories.some((c) => c.toLowerCase() === f.cat.toLowerCase())) return false;
    if (f.source && app.section.toLowerCase() !== f.source.toLowerCase()) return false;
    return true;
  }

  // ---------- pages ----------

  function renderHome() {
    setTitle('');
    const apps = DATA.apps;
    const installed = apps.filter((a) => a.nas !== 'not-installed').length;
    const updates = apps.filter((a) => a.nas === 'update').length;
    const approved = apps.filter((a) => a.approval === 'approved').length;
    const everyday = apps.filter((a) => a.userType === 'end-user' && a.approval !== 'avoid');
    const ready = (SHOW_NAS ? everyday.filter((a) => a.nas !== 'not-installed') : everyday.filter((a) => a.approval === 'approved')).sort(byName);

    const stat = (href, value, label) =>
      '<a class="stat" href="' + href + '"><span class="stat-value">' + value + '</span><span class="stat-label">' + label + '</span></a>';
    const stats = SHOW_NAS
      ? stat('#/apps', apps.length, 'Packages in this guide') + stat('#/apps?nas=installed', installed, 'Installed on our NAS') +
        stat('#/apps?nas=update', updates, 'Updates waiting') + stat('#/apps?approval=approved', approved, 'Approved for use')
      : stat('#/apps', apps.length, 'Packages in this guide') + stat('#/apps?approval=approved', approved, 'Approved for use') +
        stat('#/apps?type=end-user', apps.filter((a) => a.userType === 'end-user').length, 'Apps staff use directly') +
        stat('#/departments', DATA.departments.length, 'Departments covered');

    const groups = [];
    DATA.tasks.forEach((t) => {
      let g = groups.find((x) => x.name === t.group);
      if (!g) groups.push((g = { name: t.group, tasks: [] }));
      g.tasks.push(t);
    });

    const taskHtml = groups
      .map(
        (g) =>
          '<div class="task-group"><h3>' + esc(g.name) + '</h3><ul class="task-list">' +
          g.tasks
            .map(
              (t) =>
                '<li class="task"><div class="task-title">' + esc(t.task) + '</div>' +
                (t.description ? '<div class="task-desc">' + esc(t.description) + '</div>' : '') +
                '<div class="mini-apps">' + t.apps.map((id) => miniApp(appsById.get(id))).join('') + '</div></li>'
            )
            .join('') +
          '</ul></div>'
      )
      .join('');

    main.innerHTML =
      '<div class="page-head">' +
      '<div class="eyebrow">' + esc(setting('company_name')) + ' · Staff reference</div>' +
      '<h1>' + esc(setting('site_title')) + '</h1>' +
      '<p>' + inline(setting('intro')) + '</p>' +
      '<form class="search-form" id="home-search" role="search">' +
      '<label class="visually-hidden" for="home-q">Search packages</label>' +
      '<input type="search" id="home-q" placeholder="Search, e.g. backup laptop, CCTV, share files with customer" autocomplete="off">' +
      '<button class="btn btn-primary" type="submit">Search</button>' +
      '</form>' +
      '<div class="stats">' + stats + '</div></div>' +
      (setting('policy_short')
        ? '<div class="notice notice-info"><strong>Package policy</strong><p>' + inline(setting('policy_short')) +
          ' <a href="#/guide?s=policy">Read the full policy</a></p></div>'
        : '') +
      (taskHtml
        ? '<section class="section"><div class="section-head"><h2>What do you want to do?</h2><p>Start from the task, not the app name.</p></div>' +
          '<div class="task-groups">' + taskHtml + '</div></section>'
        : '') +
      '<section class="section"><div class="section-head"><h2>Browse by department</h2><a href="#/departments">All departments</a></div>' +
      '<div class="dept-grid">' + DATA.departments.map(deptCard).join('') + '</div></section>' +
      (ready.length
        ? '<section class="section"><div class="section-head">' +
          (SHOW_NAS ? '<h2>Ready to use today</h2><p>Installed on our NAS and open to staff.</p>' : '<h2>Everyday apps for staff</h2><p>Approved apps you open and use yourself.</p>') +
          '</div>' +
          '<div class="tile-grid">' +
          ready.map((a) => '<a class="tile" href="#/app/' + esc(a.id) + '">' + icon(a) + '<span>' + esc(a.name) + '</span></a>').join('') +
          '</div></section>'
        : '');

    document.getElementById('home-search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = document.getElementById('home-q').value.trim();
      location.hash = '#/apps' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }

  // What a department page lists: relevant, not "Not recommended", and dev tools only for SWE/IT.
  function deptApps(deptId) {
    const devOk = deptId === 'swe' || deptId === 'it';
    return DATA.apps.filter((a) => relevantTo(a, deptId) && a.approval !== 'avoid' && (a.userType !== 'developer' || devOk));
  }

  function deptCard(d) {
    const count = deptApps(d.id).length;
    return (
      '<a class="dept-card" href="#/dept/' + esc(d.id) + '"><h3>' + esc(d.name) + '</h3>' +
      (d.description ? '<p>' + esc(d.description) + '</p>' : '') +
      '<span class="count">' + count + ' packages</span></a>'
    );
  }

  function renderApps(params) {
    setTitle('All packages');
    const f = {
      q: params.get('q') || '',
      dept: params.get('dept') || '',
      nas: (SHOW_NAS && params.get('nas')) || '',
      approval: params.get('approval') || '',
      type: params.get('type') || '',
      cat: params.get('cat') || '',
      source: params.get('source') || '',
      sort: (params.get('sort') === 'installed' && !SHOW_NAS ? '' : params.get('sort')) || '',
    };

    const categories = Array.from(new Set(DATA.apps.flatMap((a) => a.categories))).sort();
    const sources = Array.from(new Set(DATA.apps.map((a) => a.section)));

    const options = (pairs, current) =>
      pairs.map(([v, label]) => '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(label) + '</option>').join('');

    const field = (id, label, control) => '<div class="field"><label for="' + id + '">' + label + '</label>' + control + '</div>';
    const select = (id, pairs) => '<select id="f-' + id + '" data-filter="' + id + '">' + options(pairs, f[id]) + '</select>';

    main.innerHTML =
      '<div class="page-head"><h1>All packages</h1>' +
      '<p>Every package in our Synology Package Center: what it does and who it is for. Filter by your department, or search for what you want to do.</p></div>' +
      '<div class="catalogue">' +
      '<div>' +
      '<button type="button" class="btn filters-toggle" aria-expanded="false" aria-controls="filters">Show filters</button>' +
      '<form class="filters" id="filters" role="search" onsubmit="return false">' +
      field('f-q', 'Search', '<input type="search" id="f-q" data-filter="q" value="' + esc(f.q) + '" placeholder="Name or task…" autocomplete="off">') +
      field('f-dept', 'Department', select('dept', [['', 'All departments']].concat(DATA.departments.map((d) => [d.id, d.name])))) +
      (SHOW_NAS ? field('f-nas', 'On our NAS', select('nas', [['', 'Any'], ['installed', 'Installed'], ['update', 'Update available'], ['not-installed', 'Not installed']])) : '') +
      field('f-approval', 'Company stance', select('approval', [['', 'Any'], ['approved', 'Approved'], ['review', 'IT approval needed'], ['avoid', 'Not recommended']])) +
      field('f-type', 'Who uses it', select('type', [['', 'Anyone'], ['end-user', 'Staff (end user)'], ['it-admin', 'IT admin'], ['developer', 'Developer']])) +
      field('f-cat', 'Category', select('cat', [['', 'All categories']].concat(categories.map((c) => [c, c])))) +
      field('f-source', 'Source', select('source', [['', 'Any']].concat(sources.map((s) => [s, s])))) +
      '<button type="button" class="btn-link" id="reset-filters">Reset filters</button>' +
      '</form></div>' +
      '<section>' +
      '<div class="results-head"><div class="results-count" id="results-count" aria-live="polite"></div>' +
      '<div class="results-tools"><label class="visually-hidden" for="f-sort">Sort by</label>' +
      select('sort', [['', 'Sort: Name A–Z']].concat(SHOW_NAS ? [['installed', 'Sort: Installed first']] : [], [['stance', 'Sort: Company stance']])) +
      copyButton('Copy link to this view') + '</div></div>' +
      '<div class="legend">' +
      (SHOW_NAS ? '<span>' + nasBadge({ nas: 'installed' }) + '</span><span>' + nasBadge({ nas: 'update' }) + '</span>' : '') +
      '<span>Cards without a stance badge are approved for use.</span></div>' +
      '<div id="results"></div></section></div>';

    const controls = Array.from(main.querySelectorAll('[data-filter]'));
    const toggle = main.querySelector('.filters-toggle');
    const panel = document.getElementById('filters');

    toggle.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide filters' : 'Show filters';
    });

    let timer = null;
    const update = () => {
      controls.forEach((c) => (f[c.dataset.filter] = c.value.trim()));
      const qs = new URLSearchParams();
      Object.keys(f).forEach((k) => f[k] && qs.set(k, f[k]));
      const str = qs.toString();
      history.replaceState(null, '', '#/apps' + (str ? '?' + str : ''));
      renderResults(f);
    };

    controls.forEach((c) => {
      c.addEventListener(c.tagName === 'INPUT' ? 'input' : 'change', () => {
        clearTimeout(timer);
        timer = setTimeout(update, c.tagName === 'INPUT' ? 150 : 0);
      });
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
      controls.forEach((c) => (c.value = ''));
      update();
    });

    const activeFilters = ['dept', 'nas', 'approval', 'type', 'cat', 'source'].filter((k) => f[k]).length;
    if (activeFilters) toggle.textContent = 'Show filters (' + activeFilters + ')';

    renderResults(f);
  }

  function renderResults(f) {
    let list = DATA.apps.filter((a) => matchesFilters(a, f));
    const results = document.getElementById('results');
    const count = document.getElementById('results-count');

    if (f.q) {
      list = list
        .map((a) => ({ a: a, s: searchScore(a, f.q) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s || byName(x.a, y.a))
        .map((x) => x.a);
    } else if (f.sort === 'installed') {
      list.sort((a, b) => NAS_ORDER[a.nas] - NAS_ORDER[b.nas] || byName(a, b));
    } else if (f.sort === 'stance') {
      list.sort((a, b) => APPROVAL_ORDER[a.approval] - APPROVAL_ORDER[b.approval] || byName(a, b));
    } else {
      list.sort(byName);
    }

    const forDept = f.dept ? ' for ' + deptName(f.dept) : '';
    count.textContent = list.length + (list.length === 1 ? ' package' : ' packages') + forDept;

    if (!list.length) {
      results.innerHTML =
        '<div class="panel empty">No packages match these filters. Try fewer words, or <button type="button" class="btn-link" id="empty-reset">reset the filters</button>.</div>';
      document.getElementById('empty-reset').addEventListener('click', () => document.getElementById('reset-filters').click());
      return;
    }

    // With no search or sort, group by Package Center section (Synology / Open Source) like DSM does.
    if (!f.q && !f.sort) {
      const sections = Array.from(new Set(list.map((a) => a.section)));
      if (sections.length > 1) {
        results.innerHTML = sections
          .map((s) => '<h2 class="section-label">' + esc(s) + '</h2><div class="app-grid">' + list.filter((a) => a.section === s).map((a) => appCard(a, { hideSource: true })).join('') + '</div>')
          .join('');
        return;
      }
    }
    results.innerHTML = '<div class="app-grid">' + list.map((a) => appCard(a)).join('') + '</div>';
  }

  function renderApp(id) {
    const app = appsById.get(id);
    if (!app) return renderNotFound('There is no package with the ID “' + id + '” in this guide.');
    setTitle(app.name);

    const kb = app.learnMore || 'https://kb.synology.com/en-global/search?query=' + encodeURIComponent(app.name);

    let notice = '';
    if (app.approval !== 'approved') {
      const cls = app.approval === 'avoid' ? 'notice-bad' : 'notice-warn';
      const title = app.approval === 'avoid' ? 'Not recommended at ' + setting('company_name') : 'Talk to IT before using this package';
      notice = '<div class="notice ' + cls + '"><strong>' + esc(title) + '</strong>' + (app.approvalNote ? '<p>' + inline(app.approvalNote) + '</p>' : '') + '</div>';
    }

    const useCases = app.useCases
      .map((u) => {
        const m = u.match(/^([^:]{2,40}):\s*([\s\S]+)$/);
        return m
          ? '<li><span class="use-case-dept">' + esc(m[1]) + '</span>' + inline(m[2].charAt(0).toUpperCase() + m[2].slice(1)) + '</li>'
          : '<li>' + inline(u) + '</li>';
      })
      .join('');

    const panel = (title, body) => (body ? '<div class="panel"><h2>' + title + '</h2>' + body + '</div>' : '');

    const facts = [
      ['On our NAS', SHOW_NAS ? nasBadge(app, true) : ''],
      ['Company stance', approvalBadge(app)],
      ['Who uses it', esc(USER_TYPE[app.userType])],
      ['Access', esc(app.access.join(', '))],
      ['Category', esc(app.categories.join(', '))],
      ['Source', esc(app.section)],
      ['Developer', esc(app.developer)],
      ['Published by', esc(app.publisher)],
      ['Installed version', SHOW_NAS ? esc(app.installedVersion) : ''],
      ['Latest version', esc(app.version) + (SHOW_NAS && app.installedVersion && app.version && app.installedVersion !== app.version ? ' <span class="muted small">(update waiting)</span>' : '')],
    ]
      .filter((x) => x[1] && x[1] !== '')
      .map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>')
      .join('');

    const depts = app.departments
      .map((d) => '<a class="chip" href="' + (d === 'all' ? '#/departments' : '#/dept/' + esc(d)) + '">' + esc(deptName(d)) + '</a>')
      .join('');

    const appLinks = (ids, withState) =>
      ids
        .map((rid) => appsById.get(rid))
        .filter(Boolean)
        .map(
          (r) =>
            '<li><a href="#/app/' + esc(r.id) + '">' + icon(r) + '<span>' + esc(r.name) + '</span></a>' +
            (withState ? '<span class="dep-state' + (r.nas !== 'not-installed' ? ' is-on' : '') + '">' + (r.nas !== 'not-installed' ? 'Installed' : 'Not installed') + '</span>' : '') +
            '</li>'
        )
        .join('');

    const needs = appLinks(app.dependsOn, SHOW_NAS);
    const requiredBy = appLinks(app.requiredBy, SHOW_NAS);
    const shownAsDependency = new Set(app.dependsOn.concat(app.requiredBy));
    const related = appLinks(app.related.filter((rid) => !shownAsDependency.has(rid)), false);

    // Warn IT before removing something an installed package still needs.
    const installedDependents = app.requiredBy.map((rid) => appsById.get(rid)).filter((r) => r && r.nas !== 'not-installed');
    if (SHOW_NAS && app.nas !== 'not-installed' && installedDependents.length) {
      notice +=
        '<div class="notice notice-info"><strong>Do not uninstall</strong><p>' +
        installedDependents.map((r) => esc(r.name)).join(', ') +
        (installedDependents.length === 1 ? ' is' : ' are') + ' installed on our NAS and ' +
        (installedDependents.length === 1 ? 'needs' : 'need') + ' this package to work.</p></div>';
    }

    const requestForm = setting('request_form_url');

    main.innerHTML =
      '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/apps">All packages</a> / ' + esc(app.name) + '</nav>' +
      '<div class="app-header">' + icon(app) +
      '<div class="app-header-main"><h1>' + esc(app.name) + '</h1>' +
      '<div class="app-sub">' + esc(app.section) + ' · ' + esc(app.categories.join(', ')) + '</div>' +
      '<p class="app-summary">' + esc(app.summary) + '</p>' +
      '<div class="chips">' + (SHOW_NAS ? nasBadge(app, true) : '') + approvalBadge(app) + '<span class="badge">' + esc(USER_TYPE_SHORT[app.userType]) + '</span></div></div>' +
      '<div class="app-actions">' + copyButton() +
      '<a class="btn" href="' + esc(kb) + '" target="_blank" rel="noopener">Synology Knowledge Center</a>' +
      '<button type="button" class="btn" data-print>Print</button></div>' +
      '</div>' +
      notice +
      '<div class="detail"><div class="detail-main">' +
      panel('What it does', paragraphs(app.description)) +
      panel('How ' + esc(setting('company_name')) + ' can use it', useCases ? '<ul class="use-cases">' + useCases + '</ul>' : '') +
      panel('How to use it', app.howTo.length ? '<ol class="steps">' + app.howTo.map((s) => '<li>' + inline(s) + '</li>').join('') + '</ol>' : '') +
      panel('Tips and notes', app.tips.length ? '<ul class="tips">' + app.tips.map((s) => '<li>' + inline(s) + '</li>').join('') + '</ul>' : '') +
      '</div><aside class="detail-aside">' +
      '<div class="panel"><h2 class="aside-title">At a glance</h2><dl class="facts">' + facts + '</dl></div>' +
      (depts ? '<div class="panel"><h2 class="aside-title">Useful for</h2><div class="chips">' + depts + '</div></div>' : '') +
      (needs || requiredBy
        ? '<div class="panel"><h2 class="aside-title">Dependencies</h2>' +
          (needs ? '<h3 class="dep-head">Needs these packages</h3><ul class="related-list">' + needs + '</ul>' : '') +
          (requiredBy ? '<h3 class="dep-head">Required by</h3><ul class="related-list">' + requiredBy + '</ul>' : '') +
          '</div>'
        : '') +
      (related ? '<div class="panel"><h2 class="aside-title">Related packages</h2><ul class="related-list">' + related + '</ul></div>' : '') +
      '<div class="panel"><h2 class="aside-title">Need access or help?</h2><p class="small">Packages are installed and configured by IT. Ask before installing anything yourself.</p>' +
      '<p class="small" style="margin-bottom:' + (requestForm ? '10px' : '0') + '">' + contactLine() + '</p>' +
      (requestForm ? '<a class="btn btn-primary" href="' + esc(requestForm) + '" target="_blank" rel="noopener">Send a request</a>' : '') +
      '</div></aside></div>';
  }

  function renderDepartments() {
    setTitle('Departments');
    main.innerHTML =
      '<div class="page-head"><h1>Departments</h1>' +
      '<p>Pick your department to see the packages that help your work, split into apps you use yourself and services IT runs for you.</p></div>' +
      '<div class="dept-grid">' + DATA.departments.map(deptCard).join('') + '</div>';
  }

  function renderDept(id) {
    const dept = deptsById.get(id);
    if (!dept) return renderNotFound('There is no department with the ID “' + id + '”.');
    setTitle(dept.name);

    const hidden = DATA.apps.filter((a) => relevantTo(a, id) && a.approval === 'avoid');
    const shown = deptApps(id).sort(byUsefulness);

    const groups = [
      ['end-user', 'Apps you use yourself', 'Open these from DSM, the web portal, or the desktop and mobile apps.'],
      ['it-admin', 'Set up and run by IT', 'You do not open these, but they keep your files safe and your access working.'],
      ['developer', 'Developer tools', 'For building and running internal software.'],
    ];

    const body = groups
      .map(([type, title, desc]) => {
        const list = shown.filter((a) => a.userType === type);
        if (!list.length) return '';
        return (
          '<section class="section"><div class="section-head"><h2>' + title + ' <span class="muted">(' + list.length + ')</span></h2><p>' + desc + '</p></div>' +
          '<div class="app-grid">' + list.map((a) => appCard(a, { useCase: a.useCaseByDept[id] })).join('') + '</div></section>'
        );
      })
      .join('');

    main.innerHTML =
      '<nav class="dept-nav" aria-label="Departments">' +
      DATA.departments
        .map((d) => '<a href="#/dept/' + esc(d.id) + '"' + (d.id === id ? ' aria-current="page"' : '') + '>' + esc(d.name) + '</a>')
        .join('') +
      '</nav>' +
      '<div class="page-head"><div class="eyebrow">Department</div><h1>' + esc(dept.name) + '</h1>' +
      (dept.description ? '<p>' + inline(dept.description) + '</p>' : '') +
      '<div class="chips">' + copyButton('Copy link for your team') +
      '<a class="btn" href="#/apps?dept=' + esc(id) + '">Open in the full list</a></div></div>' +
      (body || '<p class="empty">No packages are tagged for this department yet.</p>') +
      (hidden.length
        ? '<p class="small muted" style="margin-top:24px">' + hidden.length + ' more ' + (hidden.length === 1 ? 'package is' : 'packages are') +
          ' tagged for this department but not recommended. <a href="#/apps?dept=' + esc(id) + '&approval=avoid">Show them</a></p>'
        : '');
  }

  function renderGuide(params) {
    setTitle('Guide & policy');
    const meta = DATA.meta;
    const nasUrl = setting('nas_url');
    const driveUrl = setting('drive_url');
    const steps = settingLines('getting_started');
    const sheetId = (window.SITE_CONFIG || {}).googleSheetId;

    const sections = [
      ['start', 'Getting started'],
      ['policy', 'Package policy'],
      ['reading', 'Reading this guide'],
      ['faq', 'Questions'],
      ['glossary', 'Glossary'],
      ['contact', 'Contact IT'],
      ['update', 'Updating this guide'],
    ];

    const links = [];
    if (nasUrl) links.push('<li>NAS (DSM) sign-in: <a href="' + esc(nasUrl) + '" target="_blank" rel="noopener">' + esc(nasUrl) + '</a></li>');
    if (driveUrl) links.push('<li>Synology Drive on the web: <a href="' + esc(driveUrl) + '" target="_blank" rel="noopener">' + esc(driveUrl) + '</a></li>');

    const stanceRows = [
      ['approved', 'Fine to use at ' + esc(setting('company_name')) + '. Ask IT for access if you do not see it.'],
      ['review', 'Only after IT has reviewed it: open-source packages, anything with licence or subscription costs, beta software, or anything that changes the office network.'],
      ['avoid', 'No business need, outdated or end-of-life, or maintained by the community instead of Synology. Do not install.'],
    ]
      .map(([k, text]) => '<tr><th>' + approvalBadge({ approval: k }) + '</th><td>' + text + '</td></tr>')
      .join('');

    const nasRows = ['installed', 'update', 'not-installed']
      .map((k) => '<tr><th>' + nasBadge({ nas: k }, true) + '</th><td>' +
        { installed: 'Already running on our NAS.', update: 'Running, but Package Center shows a newer version. IT will schedule the update.', 'not-installed': 'Available in Package Center but not set up. Ask IT if your team needs it.' }[k] +
        '</td></tr>')
      .join('');

    const typeRows = ['end-user', 'it-admin', 'developer']
      .map((k) => '<tr><th><span class="badge">' + USER_TYPE_SHORT[k] + '</span></th><td>' +
        { 'end-user': 'Staff open and use it themselves.', 'it-admin': 'IT installs and manages it. Staff benefit without opening it.', developer: 'Used by the software team to build and run internal systems.' }[k] +
        '</td></tr>')
      .join('');

    const sourceLabel = {
      sheet: 'Live from the Google Sheet.',
      partial: 'Google Sheet, with some tabs from the offline copy (check the tab names). Problems: ' + meta.errors.join('; '),
      cache: 'A saved copy of the Google Sheet from ' + (meta.cachedAt ? new Date(meta.cachedAt).toLocaleString() : 'earlier') + ', because the sheet could not be reached. ' + meta.errors.join('; '),
      offline: 'The offline copy shipped with the site, because the Google Sheet could not be reached. ' + meta.errors.join('; '),
      local: 'The offline copy shipped with the site. No Google Sheet is connected yet (see config.js).',
    }[meta.source];

    main.innerHTML =
      '<div class="page-head"><h1>Guide &amp; policy</h1><p>How to get access, what you may install, and what the labels in this guide mean.</p></div>' +
      '<div class="guide"><nav class="toc" aria-label="On this page"><ol>' +
      sections.map(([sid, label]) => '<li><a href="#/guide?s=' + sid + '">' + label + '</a></li>').join('') +
      '</ol></nav><div>' +
      '<div class="panel prose" id="start"><h2>Getting started</h2>' +
      (steps.length ? '<ol>' + steps.map((s) => '<li>' + inline(s) + '</li>').join('') + '</ol>' : '') +
      (links.length ? '<ul>' + links.join('') + '</ul>' : '') +
      '</div>' +
      '<div class="panel prose" id="policy"><h2>Package policy</h2>' + paragraphs(setting('policy')) + '</div>' +
      '<div class="panel" id="reading"><h2>Reading this guide</h2>' +
      '<h3>Company stance</h3><table class="legend-table">' + stanceRows + '</table>' +
      (SHOW_NAS ? '<h3 style="margin-top:18px">On our NAS</h3><table class="legend-table">' + nasRows + '</table>' : '') +
      '<h3 style="margin-top:18px">Who uses it</h3><table class="legend-table">' + typeRows + '</table>' +
      '<h3 style="margin-top:18px">Source</h3><table class="legend-table">' +
      '<tr><th><span class="badge">Synology</span></th><td>Developed and published by Synology Inc.</td></tr>' +
      '<tr><th><span class="badge">Open Source</span></th><td>Developed by an outside open-source project (for example php.net or Docker Inc.), then packaged, signed and published by Synology Inc. in the official Package Center. For IT and Software Engineering only.</td></tr>' +
      '</table></div>' +
      (DATA.faq.length
        ? '<div class="panel faq" id="faq"><h2>Questions</h2>' +
          DATA.faq.map((q) => '<details><summary>' + esc(q.question) + '</summary><div>' + paragraphs(q.answer) + '</div></details>').join('') +
          '</div>'
        : '') +
      (DATA.glossary.length
        ? '<div class="panel" id="glossary"><h2>Glossary</h2><dl class="glossary">' +
          DATA.glossary.map((g) => '<dt>' + esc(g.term) + '</dt><dd>' + inline(g.meaning) + '</dd>').join('') +
          '</dl></div>'
        : '') +
      '<div class="panel" id="contact"><h2>Contact IT</h2><p>' + contactLine() + '</p>' +
      (setting('request_form_url')
        ? '<a class="btn btn-primary" href="' + esc(setting('request_form_url')) + '" target="_blank" rel="noopener">Send a request</a>'
        : '') +
      '</div>' +
      '<div class="panel prose" id="update"><h2>Updating this guide</h2>' +
      '<p><strong>Content source:</strong> ' + inline(sourceLabel) + '</p>' +
      '<p>All text in this guide comes from a Google Sheet with six tabs: <code>settings</code>, <code>apps</code>, <code>departments</code>, <code>tasks</code>, <code>glossary</code> and <code>faq</code>. ' +
      'Edit a cell, then refresh this page. In multi-line cells (steps, use cases, tips) put each item on its own line with Alt+Enter.</p>' +
      (sheetId ? '<p><a href="https://docs.google.com/spreadsheets/d/' + esc(sheetId) + '/edit" target="_blank" rel="noopener">Open the Google Sheet</a> (edit access needed).</p>' : '') +
      '<p class="muted small">Set-up details are in README.md in the project folder.</p></div>' +
      '</div></div>';

    const target = params.get('s');
    if (target) {
      const el = document.getElementById(target);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
    }
  }

  function renderNotFound(message) {
    setTitle('Not found');
    main.innerHTML =
      '<div class="page-head"><h1>Page not found</h1><p>' + esc(message || 'This link does not match any page in the guide.') + '</p>' +
      '<a class="btn" href="#/apps">Browse all packages</a></div>';
  }

  function renderShell() {
    document.getElementById('brand-company').textContent = setting('company_name');
    document.getElementById('brand-title').textContent = setting('site_title');
    const logo = setting('logo_url');
    const mark = document.getElementById('brand-mark');
    if (logo) {
      mark.classList.add('has-logo');
      mark.innerHTML = '<img src="' + esc(logo) + '" alt="">';
    }

    const meta = DATA.meta;
    const status = {
      sheet: ['is-live', 'Content: live from Google Sheet'],
      partial: ['is-fallback', 'Content: Google Sheet (partly offline copy)'],
      cache: ['is-fallback', 'Content: saved copy (Google Sheet unreachable)'],
      offline: ['is-fallback', 'Content: offline copy (Google Sheet unreachable)'],
      local: ['', 'Content: offline copy'],
    }[meta.source];

    const reviewed = setting('last_reviewed');
    document.getElementById('footer').innerHTML =
      '<span>' + esc(setting('company_name')) + ' · Internal use only</span>' +
      '<a class="data-status ' + status[0] + '" href="#/guide?s=update">' + esc(status[1]) + '</a>' +
      '<span>' + (reviewed ? 'Last reviewed ' + esc(reviewed) + ' · ' : '') + '<a href="#/guide?s=contact">Contact IT</a></span>';
  }

  // ---------- routing ----------

  let lastPath = null;

  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const qIndex = hash.indexOf('?');
    const path = qIndex === -1 ? hash : hash.slice(0, qIndex);
    const params = new URLSearchParams(qIndex === -1 ? '' : hash.slice(qIndex + 1));
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const page = parts[0] || '';
    let nav = page || 'home';

    if (!page) renderHome();
    else if (page === 'apps') renderApps(params);
    else if (page === 'app' && parts[1]) {
      renderApp(parts[1]);
      nav = 'apps';
    } else if (page === 'departments') renderDepartments();
    else if (page === 'dept' && parts[1]) {
      renderDept(parts[1]);
      nav = 'departments';
    } else if (page === 'guide') renderGuide(params);
    else renderNotFound();

    document.querySelectorAll('.main-nav a').forEach((a) => {
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const scrollTarget = page === 'guide' && params.get('s');
    if (path !== lastPath && !scrollTarget) window.scrollTo(0, 0);
    if (path !== lastPath) main.focus({ preventScroll: true });
    lastPath = path;
  }

  // ---------- global events ----------

  let toastTimer = null;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Plain-http intranet pages cannot use the clipboard API.
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  document.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      copyText(location.href).then(
        () => toast('Link copied - paste it in chat or email'),
        () => window.prompt('Copy this link:', location.href)
      );
    }
    if (e.target.closest('[data-print]')) window.print();
  });

  // Missing icon: show the app's initials instead of a broken image.
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('app-icon')) return;
      const span = document.createElement('span');
      span.className = img.className + ' app-icon-fallback';
      span.textContent = img.dataset.initials || '?';
      span.setAttribute('aria-hidden', 'true');
      img.replaceWith(span);
    },
    true
  );

  // Press "/" to jump to the search box.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const box = document.getElementById('f-q') || document.getElementById('home-q');
    if (box) {
      e.preventDefault();
      box.focus();
    }
  });

  window.addEventListener('hashchange', route);

  window.GuideData.load()
    .then((data) => {
      DATA = data;
      data.apps.forEach((a) => appsById.set(a.id, a));
      data.departments.forEach((d) => deptsById.set(d.id, d));
      SHOW_NAS = /^(yes|true|1)$/i.test(String(data.settings.show_nas_status || '').trim());
      renderShell();
      route();
    })
    .catch((err) => {
      main.innerHTML =
        '<div class="panel"><h1>The guide could not load</h1><p>' + esc(err && err.message) +
        '</p><p class="muted">Check that data/local-data.js exists, or contact IT.</p></div>';
    });
})();
