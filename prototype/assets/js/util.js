/* feelpost prototype — shared helpers (no external deps, file:// friendly) */
(function () {
  const FP = (window.FP = window.FP || {});

  const METHOD_LIST = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  const STATUS = {
    pending: { label: '待确认', cls: 'warn' },
    registered: { label: '已注册', cls: 'ok' },
    changed: { label: '已变更', cls: 'info' },
    archived: { label: '已归档', cls: 'muted' }
  };

  const PARSE = {
    full: { label: '解析完整', cls: 'ok' },
    partial: { label: '部分解析', cls: 'warn' },
    failed: { label: '解析失败', cls: 'danger' }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8);
  }

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function nowStr() {
    const d = new Date();
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  }

  function shortTime(s) {
    return String(s || '').slice(5); // MM-DD HH:mm
  }

  function methodClass(m) {
    return String(m || '').toLowerCase();
  }

  function parseJSON(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function highlightJSON(text) {
    const re = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:?)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      const tok = m[0];
      if (m[1]) {
        const isKey = /:\s*$/.test(tok);
        out += '<span class="tok-' + (isKey ? 'key' : 'str') + '">' + esc(tok) + '</span>';
      } else if (m[2]) {
        out += '<span class="tok-bool">' + esc(tok) + '</span>';
      } else {
        out += '<span class="tok-num">' + esc(tok) + '</span>';
      }
      last = m.index + tok.length;
    }
    out += esc(text.slice(last));
    return out;
  }

  function pretty(v) {
    if (typeof v === 'string') {
      const parsed = parseJSON(v, null);
      return parsed ? JSON.stringify(parsed, null, 2) : v;
    }
    return JSON.stringify(v, null, 2);
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      const done = function (ok) { resolve(!!ok); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacyCopy(text)); });
        return;
      }
      done(legacyCopy(text));
    });
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 800);
  }

  function joinUrl(base, path) {
    const b = String(base || '').replace(/\/+$/, '');
    const p = String(path || '').replace(/^\/+/, '');
    return b + '/' + p;
  }

  function enabledRows(rows) {
    return (rows || []).filter(function (r) { return r && r.key && r.enabled !== false; });
  }

  /** Merge 全局 → 环境 → 接口，后者覆盖前者；返回带来源与覆盖次数的行 */
  function mergeLayers(layers) {
    const map = new Map();
    layers.forEach(function (layer) {
      const source = layer[0];
      const rows = layer[1];
      enabledRows(rows).forEach(function (r) {
        const prev = map.get(r.key);
        map.set(r.key, {
          key: r.key,
          value: r.value,
          source: source,
          overrides: prev ? prev.overrides + 1 : 0
        });
      });
    });
    return Array.from(map.values());
  }

  function draftOf() {
    return {
      path: {},
      query: [],
      headers: [],
      cookies: [],
      bodyType: 'json',
      bodyRaw: '',
      formRows: [],
      files: []
    };
  }

  /** 有效请求参数：全局 → 环境 → 本次编辑 */
  function effectiveParams(ctx) {
    const api = ctx.api;
    const draft = ctx.draft;
    const env = ctx.env || { params: {} };
    const global = ctx.global || {};

    const pathMap = {};
    (api.params.path || []).forEach(function (p) {
      const v = draft.path && draft.path[p.key];
      pathMap[p.key] = v != null && v !== '' ? v : (p.sample != null ? String(p.sample) : '');
    });

    const query = mergeLayers([
      ['全局', global.query],
      ['环境', env.params && env.params.query],
      ['接口', draft.query]
    ]);
    const headers = mergeLayers([
      ['全局', global.headers],
      ['环境', env.params && env.params.headers],
      ['接口', draft.headers]
    ]);
    const cookies = mergeLayers([
      ['全局', global.cookies],
      ['环境', env.params && env.params.cookies],
      ['接口', draft.cookies]
    ]);

    const hasCT = headers.some(function (h) { return /^content-type$/i.test(h.key); });
    if (!hasCT && draft.bodyType) {
      headers.push({
        key: 'Content-Type',
        value: draft.bodyType === 'json' ? 'application/json'
          : draft.bodyType === 'form' ? 'application/x-www-form-urlencoded'
            : 'multipart/form-data',
        source: '自动',
        overrides: 0
      });
    }
    if (!headers.some(function (h) { return /^accept$/i.test(h.key); })) {
      headers.push({ key: 'Accept', value: 'application/json', source: '自动', overrides: 0 });
    }

    const bodyRaw = bodyText(draft);

    return { pathMap: pathMap, query: query, headers: headers, cookies: cookies, bodyRaw: bodyRaw };
  }

  function bodyText(draft) {
    if (draft.bodyType === 'json') return String(draft.bodyRaw || '').trim();
    if (draft.bodyType === 'form') {
      const rows = enabledRows(draft.formRows);
      if (!rows.length) return '';
      return rows.map(function (r) { return encodeURIComponent(r.key) + '=' + encodeURIComponent(r.value || ''); }).join('&');
    }
    return '';
  }

  function buildUrl(api, eff, env) {
    const path = String(api.path).replace(/\{(\w+)\}/g, function (_, k) {
      return eff.pathMap[k] != null && eff.pathMap[k] !== '' ? eff.pathMap[k] : '{' + k + '}';
    });
    let url = joinUrl(env ? env.baseUrl : 'http://localhost', path);
    const qs = eff.query.filter(function (r) { return String(r.value) !== ''; }).map(function (r) {
      return encodeURIComponent(r.key) + '=' + encodeURIComponent(r.value);
    }).join('&');
    return qs ? url + '?' + qs : url;
  }

  function sq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function buildCurl(api, draft, env, global) {
    const eff = effectiveParams({ api: api, draft: draft, env: env, global: global });
    const url = buildUrl(api, eff, env || { baseUrl: 'http://localhost' });
    const lines = ['curl -X ' + api.method + ' ' + sq(url)];
    eff.headers.forEach(function (h) {
      lines.push('  -H ' + sq(h.key + ': ' + h.value));
    });
    if (eff.cookies.length) {
      lines.push('  -b ' + sq(eff.cookies.map(function (c) { return c.key + '=' + c.value; }).join('; ')));
    }
    if (eff.bodyRaw) {
      lines.push('  --data-raw ' + sq(eff.bodyRaw));
    }
    return lines.join(' \\\n');
  }

  function flattenFields(obj, prefix, out, depth) {
    out = out || [];
    depth = depth || 0;
    if (obj == null || depth > 3) return out;
    Object.keys(obj).forEach(function (k) {
      const v = obj[k];
      const path = prefix ? prefix + '.' + k : k;
      let type = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      out.push({ path: path, type: type, sample: v !== null && typeof v === 'object' ? '' : String(v) });
      if (v && typeof v === 'object' && !Array.isArray(v)) flattenFields(v, path, out, depth + 1);
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') flattenFields(v[0], path + '[]', out, depth + 1);
    });
    return out;
  }

  function mdTable(head, rows) {
    const out = [];
    out.push('| ' + head.join(' | ') + ' |');
    out.push('| ' + head.map(function () { return '---'; }).join(' | ') + ' |');
    rows.forEach(function (r) {
      out.push('| ' + r.map(function (c) { return String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' '); }).join(' | ') + ' |');
    });
    return out;
  }

  function bodySampleText(api) {
    if (!api.body) return '';
    if (api.body.type === 'json') {
      return JSON.stringify(api.body.sample || {}, null, 2);
    }
    if (api.body.type === 'form') {
      return (api.body.fields || []).map(function (f) {
        return encodeURIComponent(f.key) + '=' + encodeURIComponent(f.sample != null ? f.sample : '');
      }).join('&');
    }
    return (api.body.fields || []).map(function (f) { return f.key + '=<' + (f.type || '文件') + '>'; }).join('\n');
  }

  function effectiveExample(api, ctx) {
    const ex = (api.responseExamples || [])[0];
    if (ex) return ex.body;
    if (typeof api.mock === 'function') {
      const eff = effectiveParams({
        api: api,
        draft: ctx && ctx.draft ? ctx.draft : draftFromApi(api, ctx && ctx.env, ctx && ctx.global),
        env: ctx && ctx.env,
        global: ctx && ctx.global
      });
      try { return api.mock(eff); } catch (e) { return { code: 0, message: 'ok' }; }
    }
    return api.mock || { code: 0, message: 'ok', data: null };
  }

  function draftFromApi(api, env, global) {
    const d = draftOf();
    (api.params.path || []).forEach(function (p) { d.path[p.key] = p.sample != null ? String(p.sample) : ''; });
    d.query = (api.params.query || []).map(function (p) {
      return { key: p.key, value: p.sample != null ? String(p.sample) : '', enabled: true, desc: p.desc };
    });
    d.headers = (api.params.headers || []).map(function (p) {
      return { key: p.key, value: p.sample != null ? String(p.sample) : '', enabled: true, desc: p.desc };
    });
    d.cookies = (api.params.cookies || []).map(function (p) {
      return { key: p.key, value: p.sample != null ? String(p.sample) : '', enabled: true, desc: p.desc };
    });
    if (api.body) {
      d.bodyType = api.body.type;
      if (api.body.type === 'json') {
        const base = deepClone(api.body.sample || {});
        // 环境/全局的 body 默认值：仅补充缺失字段
        const defaults = mergeLayers([
          ['全局', global && global.body],
          ['环境', env && env.params && env.params.body]
        ]);
        defaults.forEach(function (r) {
          if (!(r.key in base)) base[r.key] = r.value;
        });
        d.bodyRaw = Object.keys(base).length ? JSON.stringify(base, null, 2) : '';
      } else {
        d.formRows = (api.body.fields || []).map(function (f) {
          return {
            key: f.key,
            value: f.type === 'File' ? '' : (f.sample != null ? String(f.sample) : ''),
            enabled: true,
            desc: f.desc,
            isFile: f.type === 'File'
          };
        });
        d.files = (api.body.fields || []).filter(function (f) { return f.type === 'File'; }).map(function (f) {
          return { key: f.key, name: '' };
        });
      }
    }
    return d;
  }

  function buildApiMD(api, project, env, global) {
    const L = [];
    L.push('## `' + api.method + '` ' + api.path + ' · ' + api.name);
    L.push('');
    L.push('- 控制器：' + api.controller);
    L.push('- 来源：' + (api.source === 'scan' ? '代码扫描' : '手工新建'));
    L.push('- 解析完整度：' + (PARSE[api.parse] || PARSE.full).label);
    L.push('- 说明：' + ((api.manualLayer && api.manualLayer.summary) || api.summary || '—'));
    L.push('');

    const paramRows = [];
    ['path', 'query', 'headers', 'cookies'].forEach(function (loc) {
      (api.params[loc] || []).forEach(function (p) {
        const v = fieldView(api, loc, p.key, p);
        paramRows.push([loc, p.key, v.type || 'string', v.required ? '是' : '否', v.desc || '—']);
      });
    });
    if (api.body && api.body.fields && api.body.fields.length) {
      api.body.fields.forEach(function (f) {
        const v = fieldView(api, 'body', f.key, f);
        paramRows.push(['body', f.key, v.type || 'string', v.required ? '是' : '否', v.desc || '—']);
      });
    }
    L.push('### 请求参数');
    L.push('');
    if (paramRows.length) {
      mdTable(['位置', '参数名', '类型', '必填', '说明'], paramRows).forEach(function (l) { L.push(l); });
    } else {
      L.push('无');
    }
    L.push('');

    L.push('### 请求示例');
    L.push('');
    L.push('```bash');
    L.push(buildCurl(api, draftFromApi(api, env, global), env, global));
    L.push('```');
    if (api.body && api.body.type === 'json') {
      L.push('');
      L.push('```json');
      L.push(bodySampleText(api));
      L.push('```');
    }
    L.push('');

    const example = effectiveExample(api, { env: env, global: global });
    L.push('### 响应示例（HTTP 200）');
    L.push('');
    L.push('```json');
    L.push(JSON.stringify(example, null, 2));
    L.push('```');
    L.push('');

    const fields = flattenFields(example);
    L.push('### 响应字段');
    L.push('');
    if (fields.length) {
      mdTable(['字段', '类型', '说明'], fields.map(function (f) {
        return [f.path, f.type, (api.fieldNotes && api.fieldNotes[f.path]) || '—'];
      })).forEach(function (l) { L.push(l); });
    } else {
      L.push('无');
    }
    L.push('');
    return L.join('\n');
  }

  function buildProjectMD(project, env, global, apis) {
    const list = apis || project.apis;
    const L = [];
    L.push('# ' + project.name + ' 接口文档');
    L.push('');
    L.push('> 生成时间：' + nowStr());
    L.push('> 环境：' + (env ? env.name + '（' + env.baseUrl + '）' : '未选择'));
    L.push('> 接口数量：' + list.length);
    L.push('');
    L.push('## 接口清单');
    L.push('');
    mdTable(['#', '方法', '路径', '名称', '状态'], list.map(function (a, i) {
      return [i + 1, a.method, a.path, a.name, (STATUS[a.status] || STATUS.registered).label];
    })).forEach(function (l) { L.push(l); });
    L.push('');
    list.forEach(function (api) {
      L.push(buildApiMD(api, project, env, global));
    });
    return L.join('\n');
  }

  function buildCasesMD(project, cases, envFor, global) {
    const L = [];
    L.push('# ' + project.name + ' 测试用例');
    L.push('');
    L.push('> 生成时间：' + nowStr());
    L.push('');
    L.push('## 用例清单');
    L.push('');
    L.push(mdTable(['用例', '接口', '环境', '标签', '保存时间'], cases.map(function (c) {
      const api = project.apis.find(function (a) { return a.id === c.apiId; }) || { method: '', path: '' };
      const env = project.envs.find(function (e) { return e.id === c.envId; });
      return [c.name, api.method + ' ' + api.path, env ? env.name : '—', (c.tags || []).join(', '), c.savedAt];
    })).join('\n'));
    L.push('');
    L.push('## 用例明细');
    L.push('');
    cases.forEach(function (c) {
      const api = project.apis.find(function (a) { return a.id === c.apiId; });
      const env = project.envs.find(function (e) { return e.id === c.envId; });
      L.push('### ' + c.name);
      L.push('');
      L.push('- 接口：`' + (api ? api.method + ' ' + api.path : '—') + '`');
      L.push('- 环境：' + (env ? env.name : '—'));
      L.push('- 标签：' + ((c.tags || []).join('、') || '—'));
      const req = c.request || {};
      if (req.path && Object.keys(req.path).length) {
        L.push('- 路径参数：' + Object.keys(req.path).map(function (k) { return k + '=' + req.path[k]; }).join(', '));
      }
      if (req.query && req.query.length) {
        L.push('- Query：' + req.query.filter(function (r) { return r.enabled !== false && r.key; })
          .map(function (r) { return r.key + '=' + r.value; }).join(', '));
      }
      if (req.bodyRaw) {
        L.push('- 请求体：');
        L.push('');
        L.push('```json');
        L.push(req.bodyRaw);
        L.push('```');
      }
      L.push('');
    });
    return L.join('\n');
  }


  /** 人工层：字段覆盖查询与合并 */
  function overrideFor(api, loc, key) {
    const list = (api.manualLayer && api.manualLayer.overrides) || [];
    return list.find(function (o) { return o.location === loc && o.key === key; });
  }

  function fieldView(api, loc, key, base) {
    const o = overrideFor(api, loc, key);
    return Object.assign({}, base || {}, (o && o.values) || {});
  }

  function manualCount(api) {
    const list = (api.manualLayer && api.manualLayer.overrides) || [];
    let n = list.length;
    if (api.manualLayer && api.manualLayer.summary) n += 1;
    return n;
  }

  function bodyFields(api) {
    if (!api.body || !api.body.fields) return [];
    return api.body.fields.map(function (f) {
      return Object.assign({}, f, fieldView(api, 'body', f.key, {}));
    });
  }

  function apiMethods() { return METHOD_LIST.slice(); }

  function parseHash() {
    const raw = String(location.hash || '').replace(/^#/, '');
    const parts = raw.split('&');
    const out = {};
    parts.forEach(function (p) {
      if (!p) return;
      const kv = p.split('=');
      out[kv[0]] = kv[1] !== undefined ? decodeURIComponent(kv[1]) : true;
    });
    return out;
  }

  FP.util = {
    esc: esc,
    uid: uid,
    deepClone: deepClone,
    nowStr: nowStr,
    shortTime: shortTime,
    methodClass: methodClass,
    parseJSON: parseJSON,
    highlightJSON: highlightJSON,
    pretty: pretty,
    copyText: copyText,
    download: download,
    joinUrl: joinUrl,
    mergeLayers: mergeLayers,
    enabledRows: enabledRows,
    draftOf: draftOf,
    draftFromApi: draftFromApi,
    effectiveParams: effectiveParams,
    buildUrl: buildUrl,
    buildCurl: buildCurl,
    flattenFields: flattenFields,
    mdTable: mdTable,
    bodySampleText: bodySampleText,
    effectiveExample: effectiveExample,
    buildApiMD: buildApiMD,
    buildProjectMD: buildProjectMD,
    buildCasesMD: buildCasesMD,
    parseHash: parseHash,
    overrideFor: overrideFor,
    fieldView: fieldView,
    manualCount: manualCount,
    bodyFields: bodyFields
  };

  FP.METHODS = METHOD_LIST;
  FP.STATUS = STATUS;
  FP.PARSE = PARSE;
})();
