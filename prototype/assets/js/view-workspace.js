/* feelpost prototype — workspace (interface tree + request/response) */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const esc = util.esc;

  function filteredApis(app) {
    const p = app.project();
    const q = (app.S.filter.q || '').trim().toLowerCase();
    const m = app.S.filter.method;
    let list = p.apis;
    if (app.S.filter.onlyScan && p.lastScanMeta) {
      const ids = p.lastScanMeta.apiIds || [];
      list = list.filter(function (a) { return ids.indexOf(a.id) !== -1; });
    }
    return list.filter(function (a) {
      if (m !== 'ALL' && a.method !== m) return false;
      if (!q) return true;
      return (a.path + ' ' + a.name + ' ' + a.controller + ' ' + a.group).toLowerCase().indexOf(q) !== -1;
    });
  }

  function moduleApis(list) {
    const modules = [];
    const map = {};
    list.forEach(function (a) {
      const isManual = a.source === 'manual';
      const modName = isManual ? '手工接口' : (a.module || 'app');
      const groupName = isManual ? '' : (a.group || '未分组');
      if (!map[modName]) {
        map[modName] = { name: modName, count: 0, groups: [], gmap: {}, manual: isManual };
        modules.push(map[modName]);
      }
      const mod = map[modName];
      mod.count += 1;
      const gkey = isManual ? '__manual_items__' : groupName;
      if (!mod.gmap[gkey]) {
        mod.gmap[gkey] = { name: groupName, apis: [] };
        mod.groups.push(mod.gmap[gkey]);
      }
      mod.gmap[gkey].apis.push(a);
    });
    modules.forEach(function (m) {
      m.groups.sort(function (x, y) { return x.name.localeCompare(y.name); });
      m.groups.forEach(function (g) {
        g.apis.sort(function (x, y) { return x.path.localeCompare(y.path); });
      });
    });
    modules.sort(function (x, y) {
      if (x.manual !== y.manual) return x.manual ? 1 : -1;
      return x.name.localeCompare(y.name);
    });
    return modules;
  }

  function treeHTML(app) {
    const list = filteredApis(app);
    const S = app.S;
    if (!list.length) {
      return '<div class="tree-empty">没有匹配的接口<br><span style="font-size:11px">试试清空搜索或切换方法</span></div>';
    }
    return moduleApis(list).map(function (mod) {
      const mCollapsed = S.collapsed['m:' + mod.name] !== false;
      const groupsHtml = mod.groups.map(function (g) {
        const gCollapsed = S.collapsed['g:' + g.name] === true;
        const items = g.apis.map(function (a) {
          const active = a.id === S.apiId;
          let badges = '';
          if (a.isNew) badges += '<span class="chip new">新增</span>';
          else if (a.status === 'changed') badges += '<span class="chip warn">变更</span>';
          else if (a.status === 'pending') badges += '<span class="chip warn">待确认</span>';
          else if (a.status === 'archived') badges += '<span class="chip muted">归档</span>';
          if (a.parse === 'partial') badges += '<span class="chip warn" title="解析不完整">!</span>';
          return '<button class="tree-item' + (active ? ' active' : '') + '" data-api="' + esc(a.id) + '" title="' + esc(a.name) + '" style="' + (a.status === 'archived' ? 'opacity:.6' : '') + '">' +
            ui.methodBadge(a.method) +
            '<span class="tree-path">' + esc(a.path) + '</span>' +
            '<span class="tree-badges">' + badges + '</span>' +
            '</button>';
        }).join('');
        if (!g.name) return '<div class="tree-items">' + items + '</div>';
        return '<div class="tree-group' + (gCollapsed ? ' collapsed' : '') + '" data-group="' + esc(g.name) + '">' +
          '<button class="tree-group-head" data-group-toggle>' +
          ui.icon('chevronDown', 12) +
          '<span>' + esc(g.name) + '</span>' +
          '<span class="count">' + g.apis.length + '</span>' +
          '</button>' +
          '<div class="tree-items">' + items + '</div>' +
          '</div>';
      }).join('');
      return '<div class="tree-module' + (mCollapsed ? ' collapsed' : '') + '" data-mod="' + esc(mod.name) + '">' +
        '<button class="tree-module-head" data-module-toggle>' +
        ui.icon('chevronDown', 12) +
        '<span class="mod-name" title="Maven 模块">' + esc(mod.name) + '</span>' +
        '<span class="count">' + mod.count + '</span>' +
        '</button>' +
        '<div class="tree-module-body">' + groupsHtml + '</div>' +
        '</div>';
    }).join('');
  }

  function sidebar() {
    const app = FP.app;
    const S = app.S;
    const p = app.project();
    const registered = p.apis.filter(function (a) { return a.status === 'registered'; }).length;
    const pending = p.apis.filter(function (a) { return a.status === 'pending'; }).length;
    const methods = ['ALL'].concat(FP.METHODS);
    const modules = Array.from(new Set(p.apis.map(function (a) { return a.source === 'manual' ? '手工接口' : (a.module || 'app'); })));
    const allCollapsed = modules.every(function (m) { return S.collapsed['m:' + m] !== false; });
    return '' +
      '<div class="sidebar-head">' +
      '<h2>接口</h2><span class="count">' + p.apis.length + '</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost btn-sm" data-act="toggle-modules">' + (allCollapsed ? '展开全部' : '收起全部') + '</button>' +
      '<button class="icon-btn sm" data-act="new-api" title="手工新建接口" aria-label="手工新建接口">' + ui.icon('plus', 15) + '</button>' +
      '</div>' +
      '<div class="sidebar-search">' + ui.icon('search', 14) +
      '<input id="api-search" type="text" placeholder="搜索路径 / 名称 / 控制器" value="' + esc(S.filter.q) + '" aria-label="搜索接口">' +
      '</div>' +
      '<div class="filter-row">' +
      methods.map(function (m) {
        const on = S.filter.method === m;
        const cls = m === 'ALL' ? '' : ' m-' + m.toLowerCase();
        return '<button class="filter-chip' + cls + (on ? ' on' : '') + '" data-method="' + m + '">' + m + '</button>';
      }).join('') +
      (p.lastScanMeta
        ? '<button class="filter-chip' + (S.filter.onlyScan ? ' on' : '') + '" data-only-scan title="只显示上次扫描涉及的接口">本次扫描</button>'
        : '') +
      '</div>' +
      '<div class="tree" id="api-tree">' + treeHTML(app) + '</div>' +
      '<div class="sidebar-foot">' +
      '<span class="dot ok"></span><span>已注册 ' + registered + '</span>' +
      (pending ? '<span class="dot warn" style="margin-left:6px"></span><span>待确认 ' + pending + '</span>' : '') +
      '<div class="spacer"></div><span>' + (p.lastScan ? util.shortTime(p.lastScan) : '未扫描') + '</span>' +
      '</div>';
  }

  function kvRow(opts) {
    const d = opts.desc ? '<div class="desc">' + esc(opts.desc) + '</div>' : '';
    return '<tr' + (opts.enabled === false ? ' class="disabled"' : '') + '>' +
      '<td class="cb">' + (opts.checkable === false ? '' : '<input class="check" type="checkbox" ' + (opts.enabled === false ? '' : 'checked') + ' data-' + opts.kind + '-en="' + opts.idx + '">') + '</td>' +
      '<td>' + (opts.readonlyKey
        ? '<div class="flex"><span class="mono key">' + esc(opts.key) + '</span>' + (opts.type ? '<span class="chip muted">' + esc(opts.type) + '</span>' : '') + '</div>'
        : '<input type="text" data-' + opts.kind + '-key="' + opts.idx + '" value="' + esc(opts.key) + '" placeholder="key">') + '</td>' +
      '<td><input type="text" data-' + opts.kind + '-val="' + opts.idx + '" value="' + esc(opts.value == null ? '' : opts.value) + '" placeholder="输入值"></td>' +
      '<td class="desc">' + (opts.src ? '<span class="src">' + esc(opts.src) + '</span>' : (opts.desc ? esc(opts.desc) : '')) + '</td>' +
      '<td class="act">' + (opts.removable === false ? '' : '<button class="icon-btn sm" data-' + opts.kind + '-del="' + opts.idx + '" title="删除" aria-label="删除">' + ui.icon('x', 14) + '</button>') + '</td>' +
      '</tr>';
  }

  function paramTable(rows) {
    return '<table class="kv-table">' +
      '<thead><tr><th></th><th>键</th><th>值</th><th>说明</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function pathTable(app, api, draft) {
    const rows = (api.params.path || []).map(function (p, i) {
      const v = util.fieldView(api, 'path', p.key, p);
      return '<tr>' +
        '<td class="cb"></td>' +
        '<td><div class="flex"><span class="mono key">' + esc(p.key) + '</span><span class="chip muted">' + esc(v.type || 'string') + '</span>' +
        (v.required ? '<span class="chip warn">必填</span>' : '') + '</div>' +
        (v.desc ? '<div class="desc">' + esc(v.desc) + '</div>' : '') + '</td>' +
        '<td><input type="text" data-pk="' + esc(p.key) + '" value="' + esc(draft.path[p.key] || '') + '" placeholder="请输入 ' + esc(p.key) + '"></td>' +
        '<td class="desc"></td><td class="act"></td>' +
        '</tr>';
    }).join('');
    return rows ? paramTable(rows) : '';
  }

  function querySection(app, api, draft) {
    const rows = draft.query.map(function (r, i) {
      const base = (api.params.query || []).find(function (x) { return x.key === r.key; }) || {};
      const v = util.fieldView(api, 'query', r.key, base);
      return kvRow({ kind: 'q', idx: i, key: r.key, value: r.value, desc: v.desc || r.desc, enabled: r.enabled !== false });
    }).join('');
    return '<h4 class="kv-title">Query 参数 <span class="small-note">环境与全局同名参数会被覆盖</span></h4>' +
      (draft.query.length
        ? paramTable(rows)
        : '<p class="small-note" style="padding:6px 2px">该接口没有 Query 参数，可按需补充。</p>') +
      '<div class="kv-tools">' +
      '<button class="btn btn-sm" data-act="add-query">' + ui.icon('plus', 13) + ' 添加 Query 参数</button>' +
      '<span class="small-note">取消勾选即不参与发送</span>' +
      '</div>';
  }

  function headersTab(app, api, draft) {
    const g = app.global();
    const e = app.env();
    const inherited = [];
    (g.headers || []).forEach(function (h) {
      if (h.key && h.enabled !== false) inherited.push({ key: h.key, value: h.value, src: '全局' });
    });
    ((e.params && e.params.headers) || []).forEach(function (h) {
      if (h.key && h.enabled !== false) {
        const exist = inherited.find(function (x) { return x.key === h.key; });
        if (exist) { exist.value = h.value; exist.src = '环境（覆盖全局）'; }
        else inherited.push({ key: h.key, value: h.value, src: '环境' });
      }
    });
    const inhRows = inherited.map(function (h) {
      return '<tr>' +
        '<td class="cb"><input class="check" type="checkbox" checked disabled></td>' +
        '<td><span class="mono key">' + esc(h.key) + '</span></td>' +
        '<td><span class="mono" style="color:var(--text-2)">' + esc(h.value) + '</span></td>' +
        '<td class="desc"><span class="src">' + esc(h.src) + '</span></td>' +
        '<td class="act"></td>' +
        '</tr>';
    }).join('');
    const local = draft.headers.map(function (r, i) {
      const base = (api.params.headers || []).find(function (x) { return x.key === r.key; }) || {};
      const v = util.fieldView(api, 'headers', r.key, base);
      return kvRow({ kind: 'h', idx: i, key: r.key, value: r.value, desc: v.desc || r.desc, enabled: r.enabled !== false });
    }).join('');
    return '<h4 class="kv-title">自动带入 <span class="small-note">来自当前环境与全局参数，只读</span></h4>' +
      (inhRows ? paramTable(inhRows) : '<p class="small-note" style="padding:8px 2px">当前环境没有配置 header 参数。</p>') +
      '<h4 class="kv-title mt-16">接口 Header</h4>' +
      (local
        ? paramTable(local)
        : '<p class="small-note" style="padding:6px 2px">该接口没有额外 Header，环境与全局 Header 已在上面自动带入。</p>') +
      '<div class="kv-tools"><button class="btn btn-sm" data-act="add-header">' + ui.icon('plus', 13) + ' 添加 Header</button></div>' +
      '<div class="kv-note">' + ui.icon('info', 14) + '同名 header 优先级：接口 &gt; 环境 &gt; 全局。</div>';
  }

  function bodyTab(app, api, draft) {
    if (!api.body) {
      return ui.empty({ icon: 'file', title: '该接口没有请求体', desc: '扫描结果中未发现 @RequestBody / @RequestPart，通常是 GET 或 DELETE 接口。' });
    }
    const types = [['json', 'JSON'], ['form', '表单'], ['multipart', '文件上传']];
    const seg = '<div class="seg" data-bodytype>' + types.map(function (t) {
      return '<button data-bt="' + t[0] + '" class="' + (draft.bodyType === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    let content = '';
    if (draft.bodyType === 'json') {
      content = '<div class="code-editor">' +
        '<textarea id="body-json" spellcheck="false" placeholder="在这里编辑 JSON 请求体">' + esc(draft.bodyRaw) + '</textarea>' +
        '<button class="btn btn-sm fmt" data-act="format-json">格式化</button>' +
        '</div>';
    } else if (draft.bodyType === 'form') {
      const rows = draft.formRows.map(function (r, i) {
        return kvRow({ kind: 'f', idx: i, key: r.key, value: r.value, desc: r.desc, enabled: r.enabled !== false });
      }).join('');
      content = paramTable(rows) +
        '<div class="kv-tools"><button class="btn btn-sm" data-act="add-form">' + ui.icon('plus', 13) + ' 添加字段</button></div>';
    } else {
      const fields = draft.formRows.map(function (r, i) {
        if (r.isFile) {
          const f = (draft.files || []).find(function (x) { return x.key === r.key; });
          return '<div class="file-row">' + ui.icon('file', 15) +
            '<span class="name">' + esc(f && f.name ? f.name : '未选择文件') + '</span>' +
            '<span class="size">' + esc(r.desc || '') + '</span>' +
            '<button class="btn btn-sm" data-act="pick-file" data-key="' + esc(r.key) + '">' + ui.icon('upload', 13) + ' 选择文件</button>' +
            '</div>';
        }
        return '<div class="file-row">' + ui.icon('braces', 15) +
          '<span class="name">' + esc(r.key) + '</span>' +
          '<input class="input" style="width:200px;margin-left:auto" data-fval="' + i + '" value="' + esc(r.value) + '" placeholder="值">' +
          '</div>';
      }).join('');
      content = '<div class="dropzone" data-act="pick-file" data-key="' + esc((draft.files[0] || {}).key || 'file') + '">' +
        ui.icon('upload', 22) + '<div>点击模拟选择文件，或拖拽到此处</div>' +
        '<div class="small-note mt-8">multipart/form-data · 扫描时该字段解析不完整</div>' +
        '</div><div class="mt-12">' + fields + '</div>';
    }

    return '<div class="body-bar">' + seg +
      '<span class="small-note">由 ' + (api.body.type === 'json' ? '@RequestBody' : api.body.type === 'multipart' ? '@RequestPart / MultipartFile' : '@ModelAttribute') + ' 解析</span>' +
      '<div class="spacer"></div>' +
      (draft.bodyType === 'json' ? '<span class="small-note">Content-Type: application/json</span>' : '') +
      '</div>' + content;
  }

  function cookiesTab(app, api, draft) {
    const rows = draft.cookies.map(function (r, i) {
      const base = (api.params.cookies || []).find(function (x) { return x.key === r.key; }) || {};
      const v = util.fieldView(api, 'cookies', r.key, base);
      return kvRow({ kind: 'c', idx: i, key: r.key, value: r.value, desc: v.desc || r.desc, enabled: r.enabled !== false });
    }).join('');
    return (draft.cookies.length
      ? paramTable(rows)
      : '<p class="small-note" style="padding:6px 2px">该接口没有额外 Cookie。</p>') +
      '<div class="kv-tools"><button class="btn btn-sm" data-act="add-cookie">' + ui.icon('plus', 13) + ' 添加 Cookie</button></div>' +
      '<div class="kv-note">' + ui.icon('info', 14) + '通常把登录后的 session / token 放在环境参数里，这里只放接口特有 cookie。</div>';
  }

  function effectiveTab(app, api, draft) {
    const eff = util.effectiveParams({ api: api, draft: draft, env: app.env(), global: app.global() });
    function table(rows, emptyText) {
      if (!rows.length) return '<p class="small-note" style="padding:8px 2px">' + emptyText + '</p>';
      return '<table class="kv-table eff-table"><thead><tr><th></th><th>键</th><th>值</th><th>来源</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td class="cb"></td><td><span class="mono key">' + esc(r.key) + '</span>' +
            (r.overrides ? '<span class="ov">覆盖 ' + r.overrides + ' 层</span>' : '') + '</td>' +
            '<td class="val">' + esc(r.value) + '</td>' +
            '<td><span class="src">' + esc(r.source) + '</span></td><td></td></tr>';
        }).join('') + '</tbody></table>';
    }
    const pathRows = Object.keys(eff.pathMap).map(function (k) {
      return { key: k, value: eff.pathMap[k], source: '接口', overrides: 0 };
    });
    return '<div class="pane-pad">' +
      '<div class="kv-note" style="margin-top:0">' + ui.icon('info', 14) +
      '这里是本次请求真正会发出去的参数，按 <b>全局 → 环境 → 接口</b> 合并，后者覆盖前者。</div>' +
      '<h4 class="kv-title mt-16">Path</h4>' + table(pathRows, '无 Path 参数') +
      '<h4 class="kv-title mt-16">Query</h4>' + table(eff.query, '无 Query 参数') +
      '<h4 class="kv-title mt-16">Headers</h4>' + table(eff.headers, '无 Header') +
      '<h4 class="kv-title mt-16">Cookies</h4>' + table(eff.cookies, '无 Cookie') +
      '<h4 class="kv-title mt-16">请求体</h4>' +
      (eff.bodyRaw
        ? '<pre class="code-view" style="border:1px solid var(--border);border-radius:9px;background:var(--surface-2)">' + esc(eff.bodyRaw) + '</pre>'
        : '<p class="small-note" style="padding:8px 2px">无请求体</p>') +
      '</div>';
  }

  function respStatusClass(code) {
    if (code >= 500 || !code) return 'err';
    if (code >= 400) return 'warn';
    return 'ok';
  }

  function respHTML(app, api) {
    const resp = app.response(api.id);
    const examples = api.responseExamples || [];
    const strip = '<div class="examples-strip">' +
      '<span>响应示例</span>' +
      (examples.length
        ? examples.map(function (ex) {
          return '<button class="example-chip" data-example="' + esc(ex.id) + '">' + ui.icon('file', 12) + esc(ex.name) + '<span class="muted">(' + ex.status + ')</span></button>';
        }).join('')
        : '<span class="muted">暂无，发送后可保存</span>') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" data-act="save-example"' + (resp ? '' : ' disabled') + '>' + ui.icon('save', 13) + ' 保存响应示例</button>' +
      '</div>';

    if (!resp) {
      return '<div class="resp-head">' +
        '<span class="small-note">尚未发送请求</span>' +
        '<div class="spacer"></div>' +
        '<span class="small-note"><span class="kbd">⌘</span> + <span class="kbd">Enter</span> 发送</span>' +
        '</div>' +
        '<div class="resp-body">' + ui.empty({
          icon: 'send',
          title: '发送请求查看响应',
          desc: '响应会按你的环境与参数真实合并后模拟返回，仅前端演示，不会发起网络请求。'
        }) + '</div>' + strip;
    }

    const cls = respStatusClass(resp.status);
    const tabs = [['body', '响应体'], ['headers', '响应头'], ['raw', '原始']];
    let content = '';
    if (app.S.respTab === 'body') {
      const parsed = util.parseJSON(resp.body, null);
      content = parsed
        ? '<pre class="code-view">' + util.highlightJSON(JSON.stringify(parsed, null, 2)) + '</pre>'
        : '<pre class="code-view">' + (resp.body === '' ? '<span class="muted">（空响应体）</span>' : esc(resp.body)) + '</pre>';
    } else if (app.S.respTab === 'headers') {
      content = '<table class="kv-table" style="margin:0"><tbody>' +
        (resp.headers || []).map(function (h) {
          return '<tr><td style="width:220px"><span class="mono key">' + esc(h[0]) + '</span></td><td class="val mono" style="color:var(--text-2)">' + esc(h[1]) + '</td><td></td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      content = '<pre class="code-view">' + esc(resp.body) + '</pre>';
    }

    return '<div class="resp-head">' +
      '<span class="status-pill ' + cls + '">' + resp.status + ' ' + esc(resp.statusText) + '</span>' +
      '<span class="resp-meta"><span><b>' + resp.time + '</b> ms</span><span><b>' + (resp.size > 1024 ? (resp.size / 1024).toFixed(1) + ' KB' : resp.size + ' B') + '</b></span></span>' +
      '<div class="resp-tabs">' + tabs.map(function (t) {
        return '<button class="resp-tab' + (app.S.respTab === t[0] ? ' active' : '') + '" data-resptab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="spacer"></div>' +
      '<div class="resp-tools">' +
      '<button class="icon-btn sm" data-act="copy-resp" title="复制响应体">' + ui.icon('copy', 15) + '</button>' +
      '<button class="icon-btn sm" data-act="download-resp" title="下载响应 JSON">' + ui.icon('download', 15) + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="resp-body">' + content + '</div>' + strip;
  }

  function main() {
    const app = FP.app;
    const S = app.S;
    const api = app.api();
    if (!api) {
      return ui.empty({
        icon: 'braces',
        title: '还没有接口',
        desc: '先对本地 Spring Boot 工程做一次扫描，或在左侧手工新建接口。',
        action: '<button class="btn btn-primary" data-act="scan">' + ui.icon('scan', 14) + ' 扫描源码</button>'
      });
    }
    const draft = app.getDraft(api.id);
    const tabs = [
      ['params', 'Params', (api.params.path || []).length + draft.query.length],
      ['headers', 'Headers', draft.headers.length],
      ['body', 'Body', api.body ? 1 : 0],
      ['cookies', 'Cookies', draft.cookies.length],
      ['effective', '生效参数', 0]
    ];
    let body = '';
    if (S.reqTab === 'params') {
      const pt = pathTable(app, api, draft);
      body = '<div class="pane-pad">' +
        (pt ? '<h4 class="kv-title">Path 参数</h4>' + pt : '') +
        querySection(app, api, draft) +
        '</div>';
    }
    if (S.reqTab === 'headers') body = '<div class="pane-pad">' + headersTab(app, api, draft) + '</div>';
    if (S.reqTab === 'body') body = '<div class="pane-pad">' + bodyTab(app, api, draft) + '</div>';
    if (S.reqTab === 'cookies') body = '<div class="pane-pad">' + cookiesTab(app, api, draft) + '</div>';
    if (S.reqTab === 'effective') body = effectiveTab(app, api, draft);

    const p = app.project();
    const manualN = util.manualCount(api);
    const note = api.status === 'changed' && api.changeNote
      ? '<div class="api-note">' + ui.icon('alert', 14) + '<span>本次扫描检测到变更：' + esc(api.changeNote) + '</span>' +
        '<div class="spacer"></div><button class="btn btn-sm" data-act="confirm-change">确认变更</button></div>'
      : '';
    const archivedNote = api.status === 'archived'
      ? '<div class="api-note warn">' + ui.icon('info', 14) + '<span>该接口已从源码中移除（已归档），仅供查阅历史文档与用例；归档接口不参与调试发送。</span></div>'
      : '';
    const parseNote = api.parse === 'partial'
      ? '<div class="api-note warn">' + ui.icon('alert', 14) + '<span>' + esc(api.parseNote || '该接口解析不完整，请核对参数。') + '</span></div>'
      : '';
    const dirNote = api.flags && api.flags.dirChanged
      ? '<div class="api-note warn">' + ui.icon('alert', 14) + '<span>源码目录已变更，该接口尚未重新比对。</span>' +
        '<div class="spacer"></div><button class="btn btn-sm" data-act="scan">去扫描</button></div>'
      : '';
    const meta = p.lastScanMeta;
    const uncompared = meta && meta.uncomparedModules && meta.uncomparedModules.length
      ? '<div class="api-note"><span>上次扫描仅比对「' + esc(meta.scopeLabel || '部分范围') + '」，未比对 ' + meta.uncomparedModules.length + ' 个模块：' +
        esc(meta.uncomparedModules.slice(0, 4).join('、')) + (meta.uncomparedModules.length > 4 ? ' 等' : '') + '</span></div>'
      : '';
    const isArchived = api.status === 'archived';

    return dirNote + uncompared + archivedNote + note + parseNote +
      '<div class="api-head">' +
      ui.methodBadge(api.method) +
      '<span class="api-path" title="' + esc(api.path) + '">' + esc(api.path) + '</span>' +
      '<span class="api-name">' + esc(api.name) + '</span>' +
      '<span class="divider"></span>' +
      ui.statusChip(api.status) +
      ui.parseChip(api.parse) +
      (api.source === 'manual' ? '<span class="chip muted">手工</span>' : '') +
      (manualN ? '<span class="chip info soft">人工修正 ' + manualN + '</span>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn" data-act="fix-fields">' + ui.icon('check', 14) + ' 校正字段</button>' +
      '<button class="btn" data-act="copy-curl">' + ui.icon('copy', 14) + ' 复制 curl</button>' +
      (api.status === 'changed' ? '<button class="btn" data-act="confirm-change">确认变更</button>' : '') +
      (isArchived ? '<button class="btn" data-act="restore">恢复为已注册</button>' : '') +
      '<button class="btn" data-act="save-case"' + (isArchived ? ' disabled' : '') + '>' + ui.icon('save', 14) + ' 保存用例</button>' +
      '<button class="btn btn-primary" data-act="send"' + (S.sending || isArchived ? ' disabled' : '') + '>' +
      ui.icon('send', 14) + (S.sending ? ' 发送中…' : ' 发送') + '</button>' +
      '</div>' +
      '<div class="workspace">' +
      '<section class="pane req">' +
      '<div class="tabs">' +
      tabs.map(function (t) {
        return '<button class="tab' + (S.reqTab === t[0] ? ' active' : '') + '" data-reqtab="' + t[0] + '">' + t[1] +
          (t[2] ? '<span class="tab-count">' + t[2] + '</span>' : '') + '</button>';
      }).join('') +
      '<div class="pane-tools"><span class="small-note">' + esc(app.env().name) + ' · ' + esc(api.controller) + '</span></div>' +
      '</div>' +
      '<div class="req-body" id="req-body">' + body + '</div>' +
      '</section>' +
      '<div class="splitter" id="splitter" title="拖拽调整高度"></div>' +
      '<section class="pane resp">' + respHTML(app, api) + '</section>' +
      '</div>';
  }

  /* ---------------- manual fix (校正字段) ---------------- */
  function apiFieldRows(api) {
    const rows = [];
    ['path', 'query', 'headers', 'cookies'].forEach(function (loc) {
      (api.params[loc] || []).forEach(function (f) {
        rows.push({ location: loc, key: f.key, base: f });
      });
    });
    ((api.body && api.body.fields) || []).forEach(function (f) {
      rows.push({ location: 'body', key: f.key, base: f });
    });
    return rows;
  }

  function openFixFields(app, api) {
    const rows = apiFieldRows(api);
    if (!rows.length) {
      ui.toast('该接口没有可校正的字段', 'info');
      return;
    }
    const summaryVal = (api.manualLayer && api.manualLayer.summary) || '';
    const tableRows = rows.map(function (r, i) {
      const v = util.fieldView(api, r.location, r.key, r.base);
      const baseDesc = r.base.desc || '';
      return '<tr data-fix-row="' + i + '">' +
        '<td><span class="field-loc">' + esc(r.location) + '</span></td>' +
        '<td><span class="field-key">' + esc(r.key) + '</span>' +
        (baseDesc ? '<div class="base-val">源码：' + esc(baseDesc) + '</div>' : '') + '</td>' +
        '<td><input class="input" data-fix="type" style="width:120px" value="' + esc(v.type || '') + '" placeholder="类型"></td>' +
        '<td><input class="input" data-fix="desc" value="' + esc(v.desc || '') + '" placeholder="说明"></td>' +
        '<td style="text-align:center"><input class="check" type="checkbox" data-fix="required"' + (v.required ? ' checked' : '') + '></td>' +
        '</tr>';
    }).join('');

    ui.modal({
      title: '校正字段',
      subtitle: api.method + ' ' + api.path + ' · 写入人工层，不修改源码',
      wide: true,
      body:
        '<div class="field fix-summary"><label>接口补充说明（可选）</label>' +
        '<input class="input" id="fix-summary" value="' + esc(summaryVal) + '" placeholder="例如：该接口由网关转发，字段说明以本页为准"></div>' +
        '<table class="kv-table fix-table"><thead><tr><th>位置</th><th>字段</th><th>类型</th><th>说明</th><th>必填</th></tr></thead><tbody>' +
        tableRows + '</tbody></table>' +
        '<p class="small-note mt-12">只保存与源码不同的字段；下次扫描不会覆盖人工修正。</p>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-save-fix>保存修正</button>',
      onMount: function (el, close) {
        el.querySelector('[data-save-fix]').onclick = function () {
          const overrides = [];
          Array.from(el.querySelectorAll('[data-fix-row]')).forEach(function (tr) {
            const i = Number(tr.dataset.fixRow);
            const r = rows[i];
            const type = tr.querySelector('[data-fix="type"]').value.trim();
            const desc = tr.querySelector('[data-fix="desc"]').value.trim();
            const required = tr.querySelector('[data-fix="required"]').checked;
            const base = r.base;
            const changed = type !== (base.type || '') || desc !== (base.desc || '') || required !== !!base.required;
            if (changed) overrides.push({ location: r.location, key: r.key, values: { type: type, desc: desc, required: required } });
          });
          api.manualLayer = {
            overrides: overrides,
            summary: el.querySelector('#fix-summary').value.trim(),
            updatedAt: util.nowStr()
          };
          FP.store.save();
          close();
          ui.toast(overrides.length ? '已保存 ' + overrides.length + ' 处人工修正' : '已保存说明');
          app.render();
        };
      }
    });
  }

  /* ---------------- bindings ---------------- */
  function syncToggleLabel(sEl) {
    const btn = sEl.querySelector('[data-act="toggle-modules"]');
    if (!btn) return;
    const mods = Array.from(sEl.querySelectorAll('.tree-module'));
    const allCollapsed = mods.every(function (m) { return m.classList.contains('collapsed'); });
    btn.textContent = allCollapsed ? '展开全部' : '收起全部';
  }

  function bindSidebar(sEl) {
    const app = FP.app;
    sEl.addEventListener('click', function (e) {
      const item = e.target.closest('[data-api]');
      if (item) { app.selectApi(item.dataset.api); return; }
      const modToggle = e.target.closest('[data-module-toggle]');
      if (modToggle) {
        const mod = modToggle.closest('[data-mod]');
        const key = 'm:' + mod.dataset.mod;
        const wasCollapsed = app.S.collapsed[key] !== false;
        app.S.collapsed[key] = !wasCollapsed;
        mod.classList.toggle('collapsed', !wasCollapsed);
        syncToggleLabel(sEl);
        return;
      }
      if (e.target.closest('[data-act="toggle-modules"]')) {
        const mods = Array.from(sEl.querySelectorAll('.tree-module'));
        const anyExpanded = mods.some(function (m) { return !m.classList.contains('collapsed'); });
        const expand = !anyExpanded;
        mods.forEach(function (m) { app.S.collapsed['m:' + m.dataset.mod] = !expand; });
        app.render();
        return;
      }
      const toggle = e.target.closest('[data-group-toggle]');
      if (toggle) {
        const group = toggle.closest('[data-group]');
        const name = 'g:' + group.dataset.group;
        app.S.collapsed[name] = !app.S.collapsed[name];
        group.classList.toggle('collapsed');
        return;
      }
      if (e.target.closest('[data-act="new-api"]')) app.openManualApi();
      if (e.target.closest('[data-only-scan]')) {
        app.S.filter.onlyScan = !app.S.filter.onlyScan;
        app.render();
        return;
      }
    });

    const search = sEl.querySelector('#api-search');
    if (search) {
      search.addEventListener('input', function () {
        app.S.filter.q = search.value;
        const tree = sEl.querySelector('#api-tree');
        if (tree) tree.innerHTML = treeHTML(app);
      });
    }
    sEl.querySelectorAll('[data-method]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        app.S.filter.method = btn.dataset.method;
        sEl.querySelectorAll('[data-method]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        const tree = sEl.querySelector('#api-tree');
        if (tree) tree.innerHTML = treeHTML(app);
      });
    });
  }

  function bindMain(mEl) {
    const app = FP.app;
    const S = app.S;
    const api = app.api();
    if (!api) {
      mEl.addEventListener('click', function (e) {
        if (e.target.closest('[data-act="scan"]')) app.openScan();
      });
      return;
    }
    const draft = app.getDraft(api.id);

    function repaint() { app.render(); }

    mEl.addEventListener('click', function (e) {
      const t = e.target;
      if (t.closest('[data-act="send"]')) { app.send(); return; }
      if (t.closest('[data-act="confirm-change"]')) {
        if (api.status !== 'changed') return;
        api.status = 'registered';
        FP.store.save();
        ui.toast('已确认变更，接口回到已注册');
        repaint();
        return;
      }
      if (t.closest('[data-act="restore"]')) {
        if (api.status !== 'archived') return;
        api.status = 'registered';
        FP.store.save();
        ui.toast('已恢复为已注册');
        repaint();
        return;
      }
      if (t.closest('[data-act="fix-fields"]')) { openFixFields(app, api); return; }
      if (t.closest('[data-act="copy-curl"]')) { app.copyCurl(api.id); return; }
      if (t.closest('[data-act="save-case"]')) { app.openSaveCase(); return; }
      if (t.closest('[data-act="save-example"]')) { app.openSaveExample(); return; }
      if (t.closest('[data-act="scan"]')) { app.openScan(); return; }
      if (t.closest('[data-act="format-json"]')) {
        const parsed = util.parseJSON(draft.bodyRaw, null);
        if (!parsed) { ui.toast('JSON 格式不合法', 'err'); return; }
        draft.bodyRaw = JSON.stringify(parsed, null, 2);
        repaint();
        return;
      }
      if (t.closest('[data-act="add-query"]')) { draft.query.push({ key: '', value: '', enabled: true }); repaint(); return; }
      if (t.closest('[data-act="add-header"]')) { draft.headers.push({ key: '', value: '', enabled: true }); repaint(); return; }
      if (t.closest('[data-act="add-cookie"]')) { draft.cookies.push({ key: '', value: '', enabled: true }); repaint(); return; }
      if (t.closest('[data-act="add-form"]')) { draft.formRows.push({ key: '', value: '', enabled: true }); repaint(); return; }
      if (t.closest('[data-act="pick-file"]')) {
        const key = t.closest('[data-key]').dataset.key;
        const name = key + '-' + Math.floor(Math.random() * 900 + 100) + '.png';
        draft.files = draft.files || [];
        const f = draft.files.find(function (x) { return x.key === key; });
        if (f) f.name = name; else draft.files.push({ key: key, name: name });
        repaint();
        ui.toast('已模拟选择文件：' + name);
        return;
      }
      if (t.closest('[data-act="copy-resp"]')) {
        const resp = app.response(api.id);
        if (resp) util.copyText(resp.body).then(function (ok) { ui.toast(ok ? '响应体已复制' : '复制失败', ok ? 'ok' : 'err'); });
        return;
      }
      if (t.closest('[data-act="download-resp"]')) {
        const resp = app.response(api.id);
        if (resp) util.download(api.path.replace(/[\/{}]/g, '_') + '.json', resp.body, 'application/json');
        return;
      }
      const tab = t.closest('[data-reqtab]');
      if (tab) { S.reqTab = tab.dataset.reqtab; repaint(); return; }
      const rtab = t.closest('[data-resptab]');
      if (rtab) { S.respTab = rtab.dataset.resptab; repaint(); return; }
      const bt = t.closest('[data-bt]');
      if (bt) { draft.bodyType = bt.dataset.bt; repaint(); return; }
      const ex = t.closest('[data-example]');
      if (ex) {
        const item = api.responseExamples.find(function (x) { return x.id === ex.dataset.example; });
        if (item) {
          S.responses[api.id] = {
            status: item.status,
            statusText: FP.statusText(item.status),
            time: item.time,
            size: item.size,
            at: item.at,
            body: JSON.stringify(item.body, null, 2),
            headers: item.headers || [['Content-Type', 'application/json;charset=UTF-8']]
          };
          S.respTab = 'body';
          repaint();
        }
        return;
      }
      const del = t.closest('[data-q-del],[data-h-del],[data-c-del],[data-f-del]');
      if (del) {
        const ds = del.dataset;
        if (ds.qDel !== undefined) draft.query.splice(Number(ds.qDel), 1);
        if (ds.hDel !== undefined) draft.headers.splice(Number(ds.hDel), 1);
        if (ds.cDel !== undefined) draft.cookies.splice(Number(ds.cDel), 1);
        if (ds.fDel !== undefined) draft.formRows.splice(Number(ds.fDel), 1);
        repaint();
      }
    });

    mEl.addEventListener('input', function (e) {
      const t = e.target;
      const d = t.dataset;
      if (d.qi !== undefined) draft.query[Number(d.qi)][d.field || (t.type === 'text' ? 'value' : 'value')] = t.value;
      if (t.dataset.qKey !== undefined) draft.query[Number(t.dataset.qKey)].key = t.value;
      if (t.dataset.qVal !== undefined) draft.query[Number(t.dataset.qVal)].value = t.value;
      if (t.dataset.hKey !== undefined) draft.headers[Number(t.dataset.hKey)].key = t.value;
      if (t.dataset.hVal !== undefined) draft.headers[Number(t.dataset.hVal)].value = t.value;
      if (t.dataset.cKey !== undefined) draft.cookies[Number(t.dataset.cKey)].key = t.value;
      if (t.dataset.cVal !== undefined) draft.cookies[Number(t.dataset.cVal)].value = t.value;
      if (t.dataset.fKey !== undefined) draft.formRows[Number(t.dataset.fKey)].key = t.value;
      if (t.dataset.fVal !== undefined) draft.formRows[Number(t.dataset.fVal)].value = t.value;
      if (t.dataset.fval !== undefined) draft.formRows[Number(t.dataset.fval)].value = t.value;
      if (t.dataset.pk !== undefined) draft.path[t.dataset.pk] = t.value;
      if (t.id === 'body-json') draft.bodyRaw = t.value;
    });

    mEl.addEventListener('change', function (e) {
      const t = e.target;
      const row = t.closest('tr');
      if (t.dataset.qEn !== undefined) { draft.query[Number(t.dataset.qEn)].enabled = t.checked; if (row) row.classList.toggle('disabled', !t.checked); }
      if (t.dataset.hEn !== undefined) { draft.headers[Number(t.dataset.hEn)].enabled = t.checked; if (row) row.classList.toggle('disabled', !t.checked); }
      if (t.dataset.cEn !== undefined) { draft.cookies[Number(t.dataset.cEn)].enabled = t.checked; if (row) row.classList.toggle('disabled', !t.checked); }
      if (t.dataset.fEn !== undefined) { draft.formRows[Number(t.dataset.fEn)].enabled = t.checked; if (row) row.classList.toggle('disabled', !t.checked); }
    });

    // splitter
    const splitter = mEl.querySelector('#splitter');
    const reqPane = mEl.querySelector('.pane.req');
    const respPane = mEl.querySelector('.pane.resp');
    const workspace = mEl.querySelector('.workspace');
    if (splitter && reqPane && respPane && workspace) {
      splitter.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        splitter.classList.add('dragging');
        const total = workspace.getBoundingClientRect().height;
        const startY = ev.clientY;
        const startH = reqPane.getBoundingClientRect().height;
        function move(e2) {
          let h = startH + (e2.clientY - startY);
          h = Math.max(160, Math.min(total - 200, h));
          reqPane.style.flex = '0 0 ' + h + 'px';
          respPane.style.flex = '1 1 auto';
        }
        function up() {
          splitter.classList.remove('dragging');
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    }
  }

  FP.views = FP.views || {};
  FP.views.workspace = { sidebar: sidebar, main: main, bind: function (sEl, mEl) { bindSidebar(sEl); bindMain(mEl); } };
})();
