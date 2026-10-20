/*
 * Loads the guide's content.
 *
 * Order of preference for each tab (settings, apps, departments, tasks, glossary, faq):
 *   1. Google Sheet (live) - when config.js has a sheet ID or published CSV links
 *   2. Last good copy of the sheet saved in this browser
 *   3. The offline copy shipped with the site (data/local-data.js)
 */
(function () {
  'use strict';

  const TABS = ['settings', 'apps', 'departments', 'tasks', 'glossary', 'faq'];

  // Columns a tab must have, so a wrong or renamed tab falls back instead of breaking the page.
  const REQUIRED = {
    settings: ['key', 'value'],
    apps: ['id', 'name'],
    departments: ['id', 'name'],
    tasks: ['task', 'apps'],
    glossary: ['term', 'meaning'],
    faq: ['question', 'answer'],
  };

  const CACHE_KEY = 'klae-synology-guide:sheet-cache:v1';

  function sheetUrl(cfg, tab) {
    const published = cfg.publishedCsv && cfg.publishedCsv[tab];
    if (published) return published;
    if (!cfg.googleSheetId) return null;
    const name = (cfg.tabs && cfg.tabs[tab]) || tab;
    return (
      'https://docs.google.com/spreadsheets/d/' +
      encodeURIComponent(cfg.googleSheetId) +
      '/gviz/tq?tqx=out:csv&headers=1&sheet=' +
      encodeURIComponent(name)
    );
  }

  async function fetchText(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      // A private sheet answers with a Google sign-in page instead of CSV.
      if (/^\s*(<!doctype html|<html)/i.test(text)) throw new Error('sheet is not shared or published');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  function hasColumns(text, tab) {
    const rows = window.CSV.parse(text);
    if (!rows.length) return false;
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return REQUIRED[tab].every((col) => header.includes(col));
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(tabs) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), tabs: tabs }));
    } catch (e) {
      /* storage blocked or full - the site still works without it */
    }
  }

  // ---------- normalising ----------

  function slug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function list(value) {
    return String(value || '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Multi-line cells: one item per line. " | " also works as a separator,
  // and leading "1." / "-" / "•" typed in the sheet is removed.
  function lines(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    const parts = /\n/.test(text) ? text.split(/\r?\n/) : text.split(/\s\|\s/);
    return parts.map((s) => s.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim()).filter(Boolean);
  }

  function nasStatus(value) {
    const v = String(value || '').toLowerCase();
    if (/update/.test(v)) return 'update';
    if (/^(not|no\b)|uninstalled/.test(v)) return 'not-installed';
    if (/install|^yes|running|open/.test(v)) return 'installed';
    return 'not-installed';
  }

  function approval(value) {
    const v = String(value || '').toLowerCase();
    if (/not recommended|avoid|^no\b|reject|blocked/.test(v)) return 'avoid';
    if (/approval|ask|review|restricted|pending/.test(v)) return 'review';
    return 'approved';
  }

  function userType(value) {
    const v = String(value || '').toLowerCase();
    if (/dev/.test(v)) return 'developer';
    if (/admin|it\b/.test(v)) return 'it-admin';
    return 'end-user';
  }

  function normalize(raw) {
    const objects = {};
    TABS.forEach((t) => {
      objects[t] = window.CSV.parseObjects(raw[t] || '');
    });

    const settings = {};
    objects.settings.forEach((r) => {
      if (r.key) settings[r.key.trim()] = r.value || '';
    });

    const departments = objects.departments
      .filter((r) => r.id)
      .map((r) => ({ id: slug(r.id), name: r.name || r.id, description: r.description || '' }));

    const deptLookup = new Map();
    departments.forEach((d) => {
      deptLookup.set(d.id, d.id);
      deptLookup.set(d.name.toLowerCase(), d.id);
    });
    ['all', 'everyone', 'all staff'].forEach((k) => deptLookup.set(k, 'all'));
    const mapDept = (token) => deptLookup.get(token.toLowerCase()) || deptLookup.get(slug(token)) || null;

    const apps = objects.apps
      .filter((r) => r.id && r.name)
      .map((r) => {
        const id = slug(r.id);
        return {
          id: id,
          name: r.name,
          icon: r.icon || 'icons/' + id + '.png',
          section: r.section || 'Synology',
          developer: r.developer || '',
          publisher: r.publisher || '',
          categories: list(r.category),
          nas: nasStatus(r.on_our_nas),
          approval: approval(r.approval),
          approvalNote: r.approval_note || '',
          userType: userType(r.user_type),
          departments: Array.from(new Set(list(r.departments).map(mapDept).filter(Boolean))),
          summary: r.summary || '',
          description: r.description || '',
          useCases: lines(r.use_cases),
          howTo: lines(r.how_to),
          tips: lines(r.tips),
          access: list(r.access),
          related: list(r.related).map(slug),
          dependsOn: list(r.depends_on).map(slug),
          requiredBy: [],
          keywords: list(r.keywords).map((k) => k.toLowerCase()),
          installedVersion: r.installed_version || '',
          version: r.version || '',
          learnMore: r.learn_more || '',
        };
      });

    const appIds = new Set(apps.map((a) => a.id));

    // Use cases start with a department label ("Sales: ..."). Map each label to a department,
    // so department pages can show how a package helps that team.
    const labelToDept = (label) => {
      const l = label.trim().toLowerCase();
      if (deptLookup.has(l)) return deptLookup.get(l);
      const d = departments.find((x) => x.name.toLowerCase().startsWith(l) || x.id === slug(l));
      return d ? d.id : null;
    };
    apps.forEach((a) => {
      a.useCaseByDept = {};
      a.useCases.forEach((u) => {
        const m = u.match(/^([^:]{2,40}):\s*([\s\S]+)$/);
        const id = m && labelToDept(m[1]);
        if (id && id !== 'all' && !a.useCaseByDept[id]) a.useCaseByDept[id] = m[2].charAt(0).toUpperCase() + m[2].slice(1);
      });
    });

    // "Required by" is the reverse of depends_on, so the sheet only has to list one direction.
    const appsById = new Map(apps.map((a) => [a.id, a]));
    apps.forEach((a) => {
      a.dependsOn = a.dependsOn.filter((d) => appIds.has(d) && d !== a.id);
      a.dependsOn.forEach((d) => appsById.get(d).requiredBy.push(a.id));
    });

    const tasks = objects.tasks
      .filter((r) => r.task)
      .map((r) => ({
        group: r.group || 'Other',
        task: r.task,
        description: r.description || '',
        apps: list(r.apps).map(slug).filter((id) => appIds.has(id)),
      }));

    const glossary = objects.glossary.filter((r) => r.term).map((r) => ({ term: r.term, meaning: r.meaning || '' }));
    const faq = objects.faq.filter((r) => r.question).map((r) => ({ question: r.question, answer: r.answer || '' }));

    return { settings, departments, apps, tasks, glossary, faq };
  }

  // ---------- public ----------

  async function load() {
    const cfg = window.SITE_CONFIG || {};
    const local = window.LOCAL_CSV || {};
    const raw = {};
    const errors = [];
    let source = 'local';
    let cachedAt = null;

    const urls = TABS.map((t) => sheetUrl(cfg, t));
    const sheetConfigured = urls.some(Boolean);

    if (sheetConfigured) {
      const timeout = (cfg.timeoutSeconds || 8) * 1000;
      const results = await Promise.allSettled(
        urls.map((u) => (u ? fetchText(u, timeout) : Promise.reject(new Error('no link configured'))))
      );
      results.forEach((r, i) => {
        const tab = TABS[i];
        if (r.status === 'fulfilled' && hasColumns(r.value, tab)) raw[tab] = r.value;
        else errors.push(tab + ': ' + (r.status === 'rejected' ? r.reason.message : 'missing required columns'));
      });

      const loaded = Object.keys(raw).length;
      if (loaded) {
        source = loaded === TABS.length ? 'sheet' : 'partial';
        writeCache(Object.assign({}, (readCache() || {}).tabs, raw));
      } else {
        const cache = readCache();
        if (cache && cache.tabs) {
          Object.assign(raw, cache.tabs);
          source = 'cache';
          cachedAt = cache.savedAt;
        } else {
          source = 'offline';
        }
      }
    }

    TABS.forEach((t) => {
      if (!raw[t]) raw[t] = local[t] || '';
    });

    const data = normalize(raw);
    data.meta = { source: source, sheetConfigured: sheetConfigured, errors: errors, cachedAt: cachedAt };
    return data;
  }

  window.GuideData = { load: load, slug: slug };
})();
