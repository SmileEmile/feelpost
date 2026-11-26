/* feelpost prototype — app shell, navigation, scan flow, request actions */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const store = FP.store;
  const esc = util.esc;

  const S = {
    section: 'workspace',
    projectId: null,
    apiId: null,
    envId: null,
    filter: { q: '', method: 'ALL' },
    collapsed: {},
    reqTab: 'params',
    respTab: 'body',
    docMode: 'preview',
    docScope: 'registered',
    docIncludeManual: true,
    docApiId: null,
    caseQuery: '',
    caseTag: null,
    envTab: 'headers',
    globalTab: 'headers',
    responses: {},
    drafts: {},
    sending: false
  };

  const els = {
    sidebar: document.getElementById('sidebar'),
    main: document.getElementById('main'),
    rail: document.getElementById('rail'),
    projectPicker: document.getElementById('project-picker'),
    envPicker: document.getElementById('env-picker'),
    scanMeta: document.getElementById('scan-meta'),
    scanBtn: document.getElementById('scan-btn'),
    themeBtn: document.getElementById('theme-btn')
  };

  store.init();

  /* ---------------- state helpers ---------------- */
  function project() {
    return store.project(S.projectId);
  }
  function api() {
    const p = project();
    return p.apis.find(function (a) { return a.id === S.apiId; }) || p.apis[0];
  }
  function env() {
    const p = project();
    return p.envs.find(function (e) { return e.id === S.envId; }) || store.activeEnv(p);
  }
  function globalParams() {
    return store.state.globalParams;
  }
  function getDraft(apiId) {
    const a = project().apis.find(function (x) { return x.id === apiId; });
    if (!a) return util.draftOf();
    if (!S.drafts[a.id]) S.drafts[a.id] = util.draftFromApi(a, env(), globalParams());
    return S.drafts[a.id];
  }
  function currentDraft() {
    const a = api();
    return a ? getDraft(a.id) : util.draftOf();
  }
  function getResponse(apiId) {
    return S.responses[apiId];
  }

  /* ---------------- chrome ---------------- */
  function paintTheme() {
    const theme = store.state.theme || 'light';
    document.documentElement.dataset.theme = theme;
    els.themeBtn.innerHTML = ui.icon(theme === 'dark' ? 'sun' : 'moon', 17);
    els.themeBtn.title = theme === 'dark' ? '切换到浅色' : '切换到深色';
  }

  function paintChrome() {
    const p = project();
    const e = env();
    paintTheme();
    els.projectPicker.innerHTML =
      '<span class="lbl">项目</span><b>' + esc(p.name) + '</b>' + ui.icon('chevronDown', 14);
    els.envPicker.innerHTML =
      ui.icon('globe', 14) +
      '<span class="lbl">环境</span><b>' + esc(e.name) + '</b>' +
      '<code>' + esc(e.baseUrl.replace(/^https?:\/\//, '')) + '</code>' +
      ui.icon('chevronDown', 14);
    els.scanMeta.textContent = p.lastScan ? '上次扫描 ' + util.shortTime(p.lastScan) : '尚未扫描';
    els.scanBtn.innerHTML = ui.icon('scan', 15) + '<span>扫描</span>';
  }

  function renderRail() {
    const items = [
      ['workspace', 'braces', '接口'],
      ['cases', 'cases', '用例'],
      ['docs', 'doc', '文档'],
      ['envs', 'globe', '环境']
    ];
    els.rail.innerHTML = items.map(function (it) {
      return '<button class="rail-btn' + (S.section === it[0] ? ' active' : '') + '" data-nav="' + it[0] + '" title="' + it[2] + '">' +
        ui.icon(it[1], 19) + '<span>' + it[2] + '</span></button>';
    }).join('') +
      '<div class="rail-spacer"></div>' +
      '<button class="rail-btn' + (S.section === 'settings' ? ' active' : '') + '" data-nav="settings" title="设置">' + ui.icon('settings', 19) + '<span>设置</span></button>' +
      '<button class="rail-btn" data-act="reset-demo" title="重置演示数据">' + ui.icon('refresh', 18) + '<span>重置</span></button>';
  }

  function replaceNode(el) {
    const fresh = el.cloneNode(false);
    el.replaceWith(fresh);
    return fresh;
  }

  /* ---------------- render ---------------- */
  function render() {
    const p = project();
    if (!p) { location.href = 'index.html'; return; }
    if (!S.envId || !p.envs.some(function (x) { return x.id === S.envId; })) {
      S.envId = store.state.activeEnv[p.id] || (p.envs[0] && p.envs[0].id);
    }
    if (!S.apiId || !p.apis.some(function (x) { return x.id === S.apiId; })) {
      const first = p.apis.find(function (x) { return x.status !== 'archived'; }) || p.apis[0];
      S.apiId = first ? first.id : null;
    }
    paintChrome();
    renderRail();
    const view = FP.views[S.section] || FP.views.workspace;
    /* 每次渲染换一个新容器，避免旧监听器累积导致重复触发 */
    els.sidebar = replaceNode(els.sidebar);
    els.main = replaceNode(els.main);
    els.sidebar.innerHTML = view.sidebar();
    els.main.innerHTML = view.main();
    view.bind(els.sidebar, els.main);
  }

  /* ---------------- menu ---------------- */
  let menuEl = null;
  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }
  function showMenu(anchor, items) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'menu';
    el.style.position = 'fixed';
    el.style.left = Math.round(r.left) + 'px';
    el.style.top = Math.round(r.bottom + 6) + 'px';
    el.style.minWidth = Math.max(230, Math.round(r.width) + 40) + 'px';
    el.innerHTML = items.map(function (it, i) {
      if (it.type === 'sep') return '<div class="menu-sep"></div>';
      if (it.type === 'title') return '<div class="menu-title">' + esc(it.label) + '</div>';
      return '<button class="menu-item" data-i="' + i + '">' +
        (it.icon ? ui.icon(it.icon, 14) : '') +
        '<span>' + esc(it.label) + '</span>' +
        (it.active ? '<span class="hint">' + ui.icon('check', 13) + '</span>' : (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '')) +
        '</button>';
    }).join('');
    document.body.appendChild(el);
    menuEl = el;
    el.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-i]');
      if (!btn) return;
      const it = items[Number(btn.dataset.i)];
      closeMenu();
      if (it && it.onClick) it.onClick();
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('.menu') || e.target.closest('.picker')) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && S.section === 'workspace') {
      e.preventDefault();
      sendCurrent();
    }
  });

  /* ---------------- request actions ---------------- */
  function sendCurrent() {
    const a = api();
    if (!a) return;
    if (a.status === 'archived') {
      ui.toast('已归档接口不参与调试，可先在接口文档中查看', 'info');
      return;
    }
    const d = getDraft(a.id);
    const eff = util.effectiveParams({ api: a, draft: d, env: env(), global: globalParams() });
    S.sending = true;
    render();
    setTimeout(function () {
      S.responses[a.id] = FP.mockRespond(a, eff, env());
      S.sending = false;
      S.respTab = 'body';
      render();
    }, 300);
  }

  function copyCurl(apiId) {
    const p = project();
    const a = p.apis.find(function (x) { return x.id === apiId; }) || api();
    const d = getDraft(a.id);
    const curl = util.buildCurl(a, d, env(), globalParams());
    util.copyText(curl).then(function (ok) {
      ui.toast(ok ? 'curl 已复制到剪贴板' : '复制失败，请手动选择文本', ok ? 'ok' : 'err');
    });
  }

  function openSaveCase() {
    const a = api();
    if (!a) return;
    const d = getDraft(a.id);
    const e = env();
    ui.modal({
      title: '保存为用例',
      subtitle: a.method + ' ' + a.path + ' · ' + e.name,
      body:
        '<div class="field mb-8"><label for="case-name">用例名称</label>' +
        '<input class="input" id="case-name" value="' + esc(a.name + ' · ' + e.name) + '"></div>' +
        '<div class="field mb-8"><label for="case-tags">标签（逗号分隔）</label>' +
        '<input class="input" id="case-tags" placeholder="smoke, regression"></div>' +
        '<div class="field"><label for="case-note">备注（可选）</label>' +
        '<input class="input" id="case-note" placeholder="这条用例验证什么"></div>' +
        '<p class="small-note mt-12">保存的是当前请求的完整快照，后续接口定义变化不会改写它。</p>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-save>保存用例</button>',
      onMount: function (el, close) {
        const name = el.querySelector('#case-name');
        name.focus();
        name.select();
        el.querySelector('[data-save]').onclick = function () {
          const n = name.value.trim();
          if (!n) { ui.toast('请填写用例名称', 'err'); name.focus(); return; }
          const tags = el.querySelector('#case-tags').value.split(/[,，\s]+/).filter(Boolean);
          project().cases.push({
            id: 'case-' + Date.now().toString(36),
            apiId: a.id,
            name: n,
            envId: e.id,
            envName: e.name,
            baseUrl: e.baseUrl,
            tags: tags,
            savedAt: util.nowStr(),
            request: util.deepClone(d),
            note: el.querySelector('#case-note').value.trim()
          });
          store.save();
          close();
          ui.toast('用例已保存');
          render();
        };
      }
    });
  }

  function openSaveExample() {
    const a = api();
    const res = getResponse(a.id);
    if (!res) { ui.toast('先发送一次请求，再保存响应示例', 'info'); return; }
    const body = util.parseJSON(res.body, res.body);
    const ex = {
      id: 'ex-' + Date.now().toString(36),
      name: '响应示例 ' + (a.responseExamples.length + 1),
      status: res.status,
      time: res.time,
      size: res.size,
      at: res.at,
      headers: res.headers,
      body: body
    };
    a.responseExamples.push(ex);
    store.save();
    ui.toast('已保存响应示例，导出文档时会带上');
    render();
  }

  function openManualApi() {
    const groups = Array.from(new Set(project().apis.map(function (a) { return a.group; })));
    ui.modal({
      title: '手工新建接口',
      subtitle: '用于纳管源码之外的接口（第三方服务、临时地址）',
      body:
        '<div class="env-form-row">' +
        '<div class="field"><label>请求方法</label><select class="select" id="ma-method">' +
        FP.METHODS.map(function (m) { return '<option>' + m + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>路径</label><input class="input" id="ma-path" placeholder="/health"></div>' +
        '</div>' +
        '<div class="field mt-12"><label>接口名称</label><input class="input" id="ma-name" placeholder="健康检查"></div>' +
        '<div class="field mt-12"><label>分组</label><input class="input" id="ma-group" list="ma-groups" placeholder="外部服务">' +
        '<datalist id="ma-groups">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field mt-12"><label>说明</label><input class="input" id="ma-summary" placeholder="这个接口做什么"></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-save>创建</button>',
      onMount: function (el, close) {
        el.querySelector('#ma-path').focus();
        el.querySelector('[data-save]').onclick = function () {
          const path = el.querySelector('#ma-path').value.trim();
          const name = el.querySelector('#ma-name').value.trim();
          if (!path || !name) { ui.toast('路径与名称必填', 'err'); return; }
          const a = {
            id: 'manual-' + Date.now().toString(36),
            method: el.querySelector('#ma-method').value,
            path: path.charAt(0) === '/' ? path : '/' + path,
            name: name,
            group: el.querySelector('#ma-group').value.trim() || '未分组',
            controller: '手工新建',
            module: null,
            summary: el.querySelector('#ma-summary').value.trim(),
            status: 'registered',
            source: 'manual',
            parse: 'full',
            params: { path: [], query: [], headers: [], cookies: [] },
            responseExamples: []
          };
          project().apis.push(a);
          store.save();
          close();
          S.apiId = a.id;
          ui.toast('接口已创建');
          render();
        };
      }
    });
  }

  /* ---------------- scan flow ---------------- */
  function noChangeModal(p, scope) {
    ui.modal({
      title: '扫描完成',
      subtitle: [(scope ? scopeLabel(scope) : ''), (p.lastScan ? '上次扫描 ' + p.lastScan : '')].filter(Boolean).join(' · '),
      body: ui.empty({
        icon: 'check',
        title: '没有发现变更',
        desc: p.id === 'proj-feelpost'
          ? '源码与已登记的接口一致。演示数据只包含一轮变更，可在首页重置演示数据后再次体验。'
          : '当前演示数据仅为 api-test-service 内置了可扫描的变更场景。'
      }),
      footer: '<button class="btn btn-primary" data-close>知道了</button>'
    });
  }

  const DIR_SAMPLES = [
    { label: '用户模块', path: 'src/main/java/com/demo/user', controllers: ['UserController'] },
    { label: '订单模块', path: 'src/main/java/com/demo/order', controllers: ['OrderController'] },
    { label: '报表模块', path: 'src/main/java/com/demo/report', controllers: ['ReportController'] }
  ];

  function scanGroups(p) {
    const map = {};
    p.apis.forEach(function (a) {
      if (a.source !== 'scan') return;
      if (!map[a.group]) map[a.group] = { name: a.group, module: a.module || 'app', controllers: [], count: 0 };
      map[a.group].count += 1;
      if (a.controller && map[a.group].controllers.indexOf(a.controller) === -1) {
        map[a.group].controllers.push(a.controller);
      }
    });
    /* 演示：源码中存在但尚未登记的模块 */
    if (p.id === 'proj-feelpost') {
      if (!map['报表模块']) map['报表模块'] = { name: '报表模块', module: 'report-service', controllers: [], count: 0, unregistered: true };
      if (map['报表模块'].controllers.indexOf('ReportController') === -1) {
        map['报表模块'].controllers.push('ReportController');
      }
    }
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function controllerGroupMap(p) {
    const map = {};
    p.apis.forEach(function (a) { if (a.controller) map[a.controller] = a.group; });
    if (p.id === 'proj-feelpost') map['ReportController'] = '报表模块';
    return map;
  }

  function scopeLabel(scope) {
    if (!scope || scope.type === 'all') return '整个工程';
    if (scope.type === 'dir') return '目录：' + scope.path;
    return '模块：' + (scope.label || (scope.groups || []).join('、'));
  }

  function allowedGroups(scope, p) {
    if (!scope || scope.type === 'all') return null;
    if (scope.type === 'groups') return scope.groups || [];
    if (scope.type !== 'dir') return [];
    const map = controllerGroupMap(p);
    const set = [];
    (scope.controllers || []).forEach(function (c) {
      if (map[c] && set.indexOf(map[c]) === -1) set.push(map[c]);
    });
    if (!set.length) {
      const kws = [['user', '用户模块'], ['order', '订单模块'], ['auth', '认证模块'], ['file', '文件模块'], ['report', '报表模块']];
      const path = String(scope.path || '').toLowerCase();
      kws.forEach(function (k) {
        if (path.indexOf(k[0]) !== -1 && set.indexOf(k[1]) === -1) set.push(k[1]);
      });
    }
    return set;
  }

  function uncomparedModules(scope, p) {
    const allowed = allowedGroups(scope, p);
    if (!allowed) return [];
    const allModules = [];
    p.apis.forEach(function (a) {
      if (a.source === 'scan' && a.module && allModules.indexOf(a.module) === -1) allModules.push(a.module);
    });
    const inScope = [];
    p.apis.forEach(function (a) {
      if (a.source === 'scan' && a.module && allowed.indexOf(a.group) !== -1 && inScope.indexOf(a.module) === -1) {
        inScope.push(a.module);
      }
    });
    return allModules.filter(function (m) { return inScope.indexOf(m) === -1; });
  }

  function filterBatch(batch, scope, p) {
    if (p.id !== 'proj-feelpost') return [];
    let allowed = null;
    if (scope.type === 'groups') allowed = scope.groups;
    if (scope.type === 'dir') {
      const map = controllerGroupMap(p);
      const set = [];
      (scope.controllers || []).forEach(function (c) {
        if (map[c] && set.indexOf(map[c]) === -1) set.push(map[c]);
      });
      if (!set.length) {
        const kws = [['user', '用户模块'], ['order', '订单模块'], ['auth', '认证模块'], ['file', '文件模块'], ['report', '报表模块']];
        const path = String(scope.path || '').toLowerCase();
        kws.forEach(function (k) {
          if (path.indexOf(k[0]) !== -1 && set.indexOf(k[1]) === -1) set.push(k[1]);
        });
      }
      allowed = set;
    }
    if (!allowed) return batch;
    return batch.filter(function (item) {
      const group = item.type === 'new'
        ? item.api.group
        : (p.apis.find(function (a) { return a.id === item.apiId; }) || {}).group;
      if (allowed.indexOf(group) === -1) return false;
      if (item.type === 'new') {
        return !p.apis.some(function (a) { return a.id === item.api.id; });
      }
      if (item.type === 'deleted') {
        const a = p.apis.find(function (x) { return x.id === item.apiId; });
        return !!a && a.status !== 'archived';
      }
      const a = p.apis.find(function (x) { return x.id === item.apiId; });
      return !!a && a.status !== 'archived';
    });
  }

  function scanLines(scope, batch, p) {
    const c = { new: 0, changed: 0, deleted: 0 };
    batch.forEach(function (b) { c[b.type] += 1; });
    let inScope = p.apis.length;
    if (scope.type === 'groups') {
      inScope = p.apis.filter(function (a) { return scope.groups.indexOf(a.group) !== -1; }).length;
    } else if (scope.type === 'dir') {
      inScope = p.apis.filter(function (a) { return scope.controllers.indexOf(a.controller) !== -1; }).length;
    }
    inScope += c.new;
    const fields = inScope * 6;
    const docs = Math.round(inScope * 4.1);
    const hasFile = scope.type === 'all' || (scope.groups || []).indexOf('文件模块') !== -1;
    const lines = [
      ['dim', '› 范围：' + scopeLabel(scope)],
      ['dim', '› 读取 pom.xml · Spring Boot 3.2.5 · Java 17'],
      ['ok', '✓ 解析 ' + inScope + ' 个映射'],
      ['ok', '✓ 解析 DTO 字段 ' + fields + ' 个，Javadoc 命中 ' + docs + ' 个']
    ];
    if (hasFile) lines.push(['warn', '! 1 个接口仅部分解析：POST /files/upload（multipart）']);
    lines.push(['dim', '› 与上次扫描快照比对…']);
    lines.push(['ok', '✓ 新增 ' + c.new + ' · 变更 ' + c.changed + ' · 删除 ' + c.deleted]);
    return lines;
  }

  function openScan() {
    const p = project();
    const groups = scanGroups(p);
    const checked = {};
    groups.forEach(function (g) { checked[g.name] = true; });
    let mode = 'all';
    let dir = { path: '', controllers: [] };

    const moduleMap = {};
    groups.forEach(function (g) {
      const m = g.module || 'app';
      (moduleMap[m] = moduleMap[m] || []).push(g);
    });
    const groupRows = Object.keys(moduleMap).map(function (m) {
      const gs = moduleMap[m];
      const children = gs.map(function (g) {
        const meta = g.controllers.join('、') + ' · ' + (g.count ? g.count + ' 接口' : '尚未登记');
        return '<label class="mod-row">' +
          '<input class="check" type="checkbox" data-group="' + esc(g.name) + '" data-module="' + esc(m) + '" checked>' +
          '<span class="mod-name">' + esc(g.name) + '</span>' +
          (g.unregistered ? '<span class="chip new">新</span>' : '') +
          '<span class="mod-meta">' + esc(meta) + '</span>' +
          '</label>';
      }).join('');
      return '<div class="mod-group" data-mod="' + esc(m) + '">' +
        '<div class="mod-head">' +
        '<label class="mod-title-wrap"><input class="check" type="checkbox" data-module-check="' + esc(m) + '" checked>' +
        '<span class="mod-title">' + esc(m) + '</span></label>' +
        '<span class="chip muted">' + gs.length + ' 个包</span>' +
        '<div class="spacer"></div>' +
        '<button type="button" class="icon-btn sm" data-module-toggle="' + esc(m) + '" title="折叠 / 展开">' + ui.icon('chevronDown', 14) + '</button>' +
        '</div>' +
        '<div class="mod-children">' + children + '</div>' +
        '</div>';
    }).join('');

    function scopeCard(value, title, desc, extra, badge) {
      return '<div class="scope-opt' + (value === 'all' ? ' on' : '') + '" data-scope-card="' + value + '" role="radio" tabindex="0" aria-checked="' + (value === 'all') + '">' +
        '<div class="scope-head"><span class="radio"></span><span class="scope-title">' + title + '</span>' + (badge || '') + '</div>' +
        '<div class="scope-desc">' + desc + '</div>' +
        (extra ? '<div class="scope-extra">' + extra + '</div>' : '') +
        '</div>';
    }

    const dirExtra =
      '<div class="input-group">' +
      '<input class="input mono" id="scan-dir" placeholder="选择或输入目录，如 src/main/java/com/demo/order">' +
      '<button class="btn" type="button" data-pick-scan-dir>' + ui.icon('folder', 14) + ' 选择目录</button>' +
      '</div>' +
      '<input type="file" id="scan-dir-file" webkitdirectory multiple class="sr-only" tabindex="-1" aria-hidden="true">' +
      '<div class="scope-samples">示例目录：' + DIR_SAMPLES.map(function (s, i) {
        return '<button type="button" data-sample-dir="' + i + '">' + s.label + '</button>';
      }).join('') + '</div>' +
      '<span class="hint" id="scan-dir-hint">只解析该目录下的 Controller，其余接口保持不变</span>';

    const groupsExtra = '<div class="module-tree">' + groupRows + '</div>' +
      '<p class="small-note mt-8">Maven 模块与包来自源码结构；未登记的模块会以「新」标记列出。</p>';

    ui.modal({
      title: '选择扫描范围',
      subtitle: p.path,
      body: '<div class="scope-list">' +
        scopeCard('all', '整个工程', '扫描全部 REST 接口，并按上次快照比对新增、变更与删除', '', '<span class="chip muted">默认</span>') +
        scopeCard('dir', '指定目录', '只扫描某个子目录（package），适合只改了一块代码的时候', dirExtra, '') +
        scopeCard('groups', '指定模块', '勾选要扫描的模块，只在这些模块内比对变化', groupsExtra, '') +
        '</div>',
      footer: '<button class="btn" data-close>取消</button>' +
        '<button class="btn btn-primary" data-start disabled>开始扫描</button>',
      onMount: function (el, close) {
        const start = el.querySelector('[data-start]');
        const dirInput = el.querySelector('#scan-dir');
        const dirHint = el.querySelector('#scan-dir-hint');
        const picker = el.querySelector('#scan-dir-file');
        picker.setAttribute('webkitdirectory', '');
        picker.setAttribute('directory', '');

        function syncModules() {
          el.querySelectorAll('.mod-group').forEach(function (mg) {
            const boxes = Array.from(mg.querySelectorAll('[data-group]'));
            if (!boxes.length) return;
            const on = boxes.filter(function (b) { return b.checked; }).length;
            const mc = mg.querySelector('[data-module-check]');
            mc.checked = on === boxes.length;
            mc.indeterminate = on > 0 && on < boxes.length;
          });
        }

        function refresh() {
          el.querySelectorAll('[data-scope-card]').forEach(function (card) {
            const on = card.dataset.scopeCard === mode;
            card.classList.toggle('on', on);
            card.setAttribute('aria-checked', String(on));
          });
          syncModules();
          const groupChecks = Array.from(el.querySelectorAll('[data-group]'));
          let valid = true;
          if (mode === 'dir') valid = !!dir.path;
          if (mode === 'groups') valid = groupChecks.some(function (c) { return c.checked; });
          start.disabled = !valid;
        }

        el.addEventListener('click', function (e) {
          /* 先处理卡片内部的可交互元素，避免被卡片点击吞掉 */
          const mt = e.target.closest('[data-module-toggle]');
          if (mt) {
            const mg = mt.closest('.mod-group');
            mg.classList.toggle('collapsed');
            return;
          }
          if (e.target.closest('[data-pick-scan-dir]')) { picker.value = ''; picker.click(); return; }
          const sample = e.target.closest('[data-sample-dir]');
          if (sample) {
            const s = DIR_SAMPLES[Number(sample.dataset.sampleDir)];
            dir = { path: s.path, controllers: s.controllers.slice() };
            dirInput.value = s.path;
            dirHint.textContent = '已选择：' + s.label + ' 目录 · ' + s.controllers.join('、');
            dirHint.className = 'hint picked';
            refresh();
            return;
          }
          const card = e.target.closest('[data-scope-card]');
          if (card) { mode = card.dataset.scopeCard; refresh(); }
        });

        el.addEventListener('keydown', function (e) {
          const card = e.target.closest('[data-scope-card]');
          if (card && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            mode = card.dataset.scopeCard;
            refresh();
          }
        });

        el.addEventListener('change', function (e) {
          if (e.target.id === 'scan-dir-file') {
            const list = e.target.files || [];
            if (!list.length) return;
            const first = list[0];
            const rel = first.webkitRelativePath || first.name;
            const folder = rel.split('/')[0] || '目录';
            const ctrls = [];
            const limit = Math.min(list.length, 5000);
            for (let i = 0; i < limit; i += 1) {
              const name = (list[i].name || '').replace(/\.java$/, '');
              if (/Controller$/.test(name) && ctrls.indexOf(name) === -1) ctrls.push(name);
            }
            dir = { path: folder, controllers: ctrls };
            dirInput.value = folder;
            dirHint.textContent = ctrls.length
              ? '识别到 ' + ctrls.length + ' 个 Controller：' + ctrls.join('、')
              : '未在该目录识别到 Controller，扫描将不会发现接口';
            dirHint.className = 'hint picked' + (ctrls.length ? '' : ' warn');
          }
          if (e.target.dataset.moduleCheck) {
            const mg = e.target.closest('.mod-group');
            Array.from(mg.querySelectorAll('[data-group]')).forEach(function (b) {
              b.checked = e.target.checked;
              checked[b.dataset.group] = b.checked;
            });
          }
          if (e.target.dataset.group) checked[e.target.dataset.group] = e.target.checked;
          refresh();
        });

        dirInput.addEventListener('input', function () {
          dir = { path: dirInput.value.trim(), controllers: [] };
          dirHint.textContent = dir.path ? '将按路径关键字匹配模块' : '只解析该目录下的 Controller';
          dirHint.className = 'hint';
          refresh();
        });

        start.onclick = function () {
          let scope;
          if (mode === 'all') scope = { type: 'all' };
          else if (mode === 'dir') scope = { type: 'dir', path: dir.path, controllers: dir.controllers.slice() };
          else {
            const chosen = Array.from(el.querySelectorAll('[data-group]')).filter(function (c) { return c.checked; });
            const byMod = {};
            chosen.forEach(function (c) {
              const m = c.dataset.module || 'app';
              (byMod[m] = byMod[m] || []).push(c.dataset.group);
            });
            const label = Object.keys(byMod).map(function (m) {
              const mc = el.querySelector('[data-module-check="' + m + '"]');
              const full = mc && mc.checked && !mc.indeterminate;
              return full ? m : m + '（' + byMod[m].join('、') + '）';
            }).join(' · ');
            scope = {
              type: 'groups',
              groups: chosen.map(function (c) { return c.dataset.group; }),
              label: label
            };
          }
          close();
          runScan(scope);
        };

        refresh();
      }
    });
  }

  function runScan(scope) {
    const p = project();
    const batch = filterBatch(FP.makeScanBatch(), scope, p);
    const lines = scanLines(scope, batch, p);
    let cancelled = false;
    let timer = null;
    let done = null;
    const m = ui.modal({
      title: '扫描源码',
      subtitle: p.path + ' · ' + scopeLabel(scope),
      body: '<div class="progress"><i></i></div><div class="scan-log"></div>',
      footer: '<button class="btn" data-cancel-run>取消扫描</button>',
      dismissible: false,
      onMount: function (el, close) {
        el.querySelector('[data-cancel-run]').onclick = function () {
          ui.confirm({
            title: '取消扫描',
            text: '本次扫描结果将被丢弃，需要重新扫描（不保留草稿）。',
            okText: '取消扫描',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            cancelled = true;
            if (timer) clearInterval(timer);
            if (done) clearTimeout(done);
            close();
            ui.toast('已取消扫描，结果未保留');
          });
        };
      }
    });
    const logEl = m.el.querySelector('.scan-log');
    const bar = m.el.querySelector('.progress i');
    let i = 0;
    timer = setInterval(function () {
      if (cancelled || i >= lines.length) return;
      const div = document.createElement('div');
      div.className = lines[i][0];
      div.textContent = lines[i][1];
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
      bar.style.width = Math.round(((i + 1) / lines.length) * 100) + '%';
      i += 1;
    }, 170);
    done = setTimeout(function () {
      if (cancelled) return;
      clearInterval(timer);
      m.close();
      showScanResults(batch, scope);
    }, 1550);
  }

  function showScanResults(batch, scope) {
    const p = project();
    const counts = {
      new: batch.filter(function (b) { return b.type === 'new'; }).length,
      changed: batch.filter(function (b) { return b.type === 'changed'; }).length,
      deleted: batch.filter(function (b) { return b.type === 'deleted'; }).length
    };
    if (!counts.new && !counts.changed && !counts.deleted) {
      noChangeModal(p, scope);
      return;
    }
    const label = { new: '新增', changed: '变更', deleted: '删除' };
    const order = ['new', 'changed', 'deleted'];
    const rows = order.map(function (type) {
      return batch.map(function (item, idx) {
        if (item.type !== type) return '';
        let a, diffHtml = '', right = '';
        if (type === 'new') {
          a = item.api;
          right = '<span class="dot ok"></span> 新接口';
        } else {
          a = p.apis.find(function (x) { return x.id === item.apiId; }) || { method: '?', path: '?', name: '' };
          if (type === 'changed') {
            diffHtml = '<div class="diff">' + (item.diff || []).map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('') + '</div>';
            right = '已注册';
          } else {
            const affected = p.cases.filter(function (c) { return c.apiId === a.id; }).length;
            right = '受影响用例 ' + affected;
          }
        }
        return '<label class="scan-row">' +
          '<input class="check" type="checkbox" data-idx="' + idx + '" checked>' +
          '<div class="main-col">' +
          '<div class="line1">' + ui.methodBadge(a.method) +
          '<span class="path">' + esc(a.path) + '</span>' +
          '<span class="name">' + esc(a.name) + '</span>' +
          '<span class="chip ' + (type === 'new' ? 'new' : type === 'changed' ? 'warn' : 'muted') + '">' + label[type] + '</span>' +
          '</div>' + diffHtml + '</div>' +
          '<div class="right-note">' + right + '</div>' +
          '</label>';
      }).join('');
    }).join('');

    const un = uncomparedModules(scope, project());
    const uncomparedHTML = un.length
      ? '<div class="api-note">' + ui.icon('info', 14) + '<span>本次仅比对「' + esc(scopeLabel(scope)) + '」；未比对 ' + un.length + ' 个模块：' + esc(un.join('、')) + '</span></div>'
      : '';
    const m = ui.modal({
      title: '扫描结果',
      subtitle: '共 ' + (counts.new + counts.changed + counts.deleted) + ' 项待确认 · 范围：' + scopeLabel(scope) + ' · 勾选后批量入库',
      wide: true,
      body:
        (uncomparedHTML ||
          '') +
        '<div class="scan-summary">' +
        '<span class="summary-pill new">' + ui.icon('plus', 13) + ' 新增 <b>' + counts.new + '</b></span>' +
        '<span class="summary-pill chg">' + ui.icon('refresh', 13) + ' 变更 <b>' + counts.changed + '</b></span>' +
        '<span class="summary-pill del">' + ui.icon('trash', 13) + ' 删除 <b>' + counts.deleted + '</b></span>' +
        '</div>' +
        '<div class="scan-list">' + rows + '</div>' +
        '<p class="small-note mt-12">授权后才写入正式接口清单。变更只更新源码层，人工补充的说明与示例不会被覆盖。</p>',
      footer: '<span class="small-note" data-count>已选择 ' + (counts.new + counts.changed + counts.deleted) + ' 项</span>' +
        '<div class="spacer"></div>' +
        '<button class="btn" data-cancel-scan>取消</button>' +
        '<button class="btn btn-primary" data-apply>确认入库</button>',
      onMount: function (el, close) {
        const checks = Array.from(el.querySelectorAll('[data-idx]'));
        el.querySelector('[data-cancel-scan]').onclick = function () {
          ui.confirm({
            title: '取消本次扫描结果',
            text: '本次结果将被丢弃，需要重新扫描（不保留草稿）。',
            okText: '丢弃结果',
            danger: true
          }).then(function (ok) { if (ok) { close(); ui.toast('已丢弃本次扫描结果'); } });
        };
        const countEl = el.querySelector('[data-count]');
        const applyBtn = el.querySelector('[data-apply]');
        function sync() {
          const n = checks.filter(function (c) { return c.checked; }).length;
          countEl.textContent = '已选择 ' + n + ' 项';
          applyBtn.disabled = n === 0;
        }
        checks.forEach(function (c) { c.addEventListener('change', sync); });
        el.querySelector('[data-apply]').onclick = function () {
          const selected = checks.filter(function (c) { return c.checked; }).map(function (c) { return Number(c.dataset.idx); });
          close();
          applyScan(batch, selected, scope);
        };
      }
    });
  }

  function applyScan(batch, selected, scope) {
    const p = project();
    const counts = { new: 0, changed: 0, deleted: 0 };
    const appliedIds = [];
    batch.forEach(function (item, idx) {
      if (selected.indexOf(idx) === -1) return;
      if (item.type === 'new') {
        const copy = util.deepClone(item.api);
        copy.isNew = true;
        copy.status = 'registered';
        copy.updatedAt = util.nowStr();
        p.apis.push(copy);
        appliedIds.push(copy.id);
        counts.new += 1;
      } else if (item.type === 'changed') {
        const a = p.apis.find(function (x) { return x.id === item.apiId; });
        if (a) {
          a.status = 'changed';
          a.changeNote = (item.diff || []).join('；');
          a.updatedAt = util.nowStr();
          a.flags = Object.assign({}, a.flags, { dirChanged: false });
          appliedIds.push(a.id);
          if (item.fieldPatch) {
            if (a.body && a.body.fields) a.body.fields.push(util.deepClone(item.fieldPatch));
            if (a.body && a.body.sample) a.body.sample[item.fieldPatch.key] = item.fieldPatch.sample;
          }
          counts.changed += 1;
        }
      } else if (item.type === 'deleted') {
        const a = p.apis.find(function (x) { return x.id === item.apiId; });
        if (a) {
          a.status = 'archived';
          a.isNew = false;
          a.flags = Object.assign({}, a.flags, { dirChanged: false });
          appliedIds.push(a.id);
          counts.deleted += 1;
        }
      }
    });
    store.touchProject(p);
    p.lastScanMeta = {
      at: util.nowStr(),
      scopeLabel: scopeLabel(scope),
      uncomparedModules: uncomparedModules(scope, p),
      apiIds: appliedIds
    };
    store.save();
    const firstNew = batch.find(function (b, i) { return b.type === 'new' && selected.indexOf(i) !== -1; });
    if (firstNew) S.apiId = firstNew.api.id;
    ui.toast('已入库：新增 ' + counts.new + ' · 变更 ' + counts.changed + ' · 归档 ' + counts.deleted);
    render();
  }

  /* ---------------- init ---------------- */
  function init() {
    const params = new URLSearchParams(location.search);
    let pid = params.get('project');
    if (!pid || !store.state.projects.some(function (p) { return p.id === pid; })) {
      pid = store.state.lastProjectId && store.state.projects.some(function (p) { return p.id === store.state.lastProjectId; })
        ? store.state.lastProjectId
        : store.state.projects[0].id;
    }
    S.projectId = pid;
    store.state.lastProjectId = pid;
    const p = project();
    S.envId = store.state.activeEnv[p.id] || (p.envs[0] && p.envs[0].id);

    const hash = util.parseHash();
    const sections = ['workspace', 'cases', 'docs', 'envs', 'settings'];
    const found = sections.find(function (s) { return hash[s]; });
    if (found) S.section = found;

    /* 深链接：便于演示与评审直接跳到某个状态 */
    if (hash.api) S.apiId = hash.api;
    if (hash.env) S.envId = hash.env;
    if (hash.tab) S.reqTab = hash.tab;
    if (hash.mode) S.docMode = hash.mode;

    const themeParam = params.get('theme');
    if (themeParam === 'dark' || themeParam === 'light') {
      store.state.theme = themeParam;
      store.save();
    }

    render();

    if (hash.scan) setTimeout(openScan, 500);
    if (hash.send) setTimeout(sendCurrent, 250);

    document.getElementById('theme-btn').addEventListener('click', function () {
      store.state.theme = (store.state.theme || 'light') === 'light' ? 'dark' : 'light';
      store.save();
      paintTheme();
    });

    els.scanBtn.addEventListener('click', openScan);

    els.projectPicker.addEventListener('click', function () {
      const items = [{ type: 'title', label: '切换项目' }];
      store.state.projects.forEach(function (pr) {
        items.push({
          label: pr.name,
          icon: 'braces',
          active: pr.id === S.projectId,
          hint: pr.apis.length + ' 接口',
          onClick: function () {
            S.projectId = pr.id;
            store.state.lastProjectId = pr.id;
            S.apiId = null;
            S.envId = store.state.activeEnv[pr.id] || (pr.envs[0] && pr.envs[0].id);
            S.section = 'workspace';
            store.save();
            history.replaceState(null, '', 'app.html?project=' + encodeURIComponent(pr.id) + '#workspace');
            render();
          }
        });
      });
      items.push({ type: 'sep' });
      items.push({ label: '项目设置…', icon: 'settings', onClick: openProjectSettings });
      items.push({ label: '新建项目…', icon: 'plus', onClick: function () { location.href = 'index.html'; } });
      items.push({ label: '返回项目列表', icon: 'folder', onClick: function () { location.href = 'index.html'; } });
      showMenu(els.projectPicker, items);
    });

    els.envPicker.addEventListener('click', function () {
      const p = project();
      const items = [{ type: 'title', label: '选择环境（整套参数生效）' }];
      p.envs.forEach(function (e) {
        items.push({
          label: e.name,
          icon: 'globe',
          active: e.id === S.envId,
          hint: e.baseUrl.replace(/^https?:\/\//, '').split('/')[0],
          onClick: function () {
            S.envId = e.id;
            store.setActiveEnv(p, e.id);
            ui.toast('已切换到 ' + e.name + ' 环境');
            render();
          }
        });
      });
      items.push({ type: 'sep' });
      items.push({ label: '管理环境与全局参数', icon: 'settings', onClick: function () { S.section = 'envs'; render(); } });
      showMenu(els.envPicker, items);
    });

    els.rail.addEventListener('click', function (e) {
      const nav = e.target.closest('[data-nav]');
      if (nav) { S.section = nav.dataset.nav; render(); return; }
      if (e.target.closest('[data-act="reset-demo"]')) resetDemo();
    });
  }

  function openProjectSettings() {
    const p = project();
    const exclude = (p.excludePatterns || []).join('\n');
    ui.modal({
      title: '项目设置',
      subtitle: p.path,
      body:
        '<div class="field mb-8"><label for="ps-name">项目名称</label><input class="input" id="ps-name" value="' + esc(p.name) + '"></div>' +
        '<div class="field mb-8"><label for="ps-dir">源码目录</label><input class="input mono" id="ps-dir" value="' + esc(p.path) + '"></div>' +
        '<div class="field mb-8"><label for="ps-desc">描述</label><input class="input" id="ps-desc" value="' + esc(p.desc || '') + '"></div>' +
        '<div class="field mb-8"><label for="ps-exclude">自定义排除规则（每行一个）</label>' +
        '<textarea class="textarea" id="ps-exclude" rows="4">' + esc(exclude) + '</textarea>' +
        '<span class="hint">默认已排除 target / build / node_modules / .git</span></div>' +
        '<div class="hr"></div>' +
        '<div class="field"><label>危险操作</label>' +
        '<div class="flex"><button class="btn btn-danger" data-delete-project>删除项目</button>' +
        '<span class="hint">会级联删除接口、环境与用例，需二次确认</span></div></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-save-ps>保存</button>',
      onMount: function (el, close) {
        el.querySelector('[data-save-ps]').onclick = function () {
          const name = el.querySelector('#ps-name').value.trim();
          if (!name) { ui.toast('项目名称不能为空', 'err'); return; }
          const newDir = el.querySelector('#ps-dir').value.trim();
          const dirChanged = newDir && newDir !== p.path;
          p.name = name;
          p.desc = el.querySelector('#ps-desc').value.trim();
          if (newDir) p.path = newDir;
          p.excludePatterns = el.querySelector('#ps-exclude').value.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
          if (dirChanged) {
            p.apis.forEach(function (a) {
              if (a.source === 'manual') return;
              a.flags = Object.assign({}, a.flags, { dirChanged: true });
            });
          }
          store.save();
          close();
          ui.toast(dirChanged ? '已保存；既有接口已标记“目录已变更”' : '项目设置已保存');
          render();
        };
        el.querySelector('[data-delete-project]').onclick = function () {
          ui.confirm({
            title: '删除项目',
            text: '将删除「' + p.name + '」及其全部接口、环境与用例，不可恢复。',
            okText: '删除项目',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            store.state.projects = store.state.projects.filter(function (x) { return x.id !== p.id; });
            delete store.state.activeEnv[p.id];
            store.state.lastProjectId = store.state.projects[0] ? store.state.projects[0].id : null;
            store.save();
            location.href = 'index.html';
          });
        };
      }
    });
  }

  function resetDemo() {
    ui.confirm({
      title: '重置演示数据',
      text: '会清空本机保存的接口、用例、环境与自定义项目，恢复初始演示数据。',
      okText: '重置',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      store.reset();
      location.href = 'index.html';
    });
  }

  FP.app = {
    S: S,
    els: els,
    project: project,
    api: api,
    env: env,
    global: globalParams,
    getDraft: getDraft,
    currentDraft: currentDraft,
    response: getResponse,
    render: render,
    send: sendCurrent,
    copyCurl: copyCurl,
    openSaveCase: openSaveCase,
    openSaveExample: openSaveExample,
    openManualApi: openManualApi,
    openScan: openScan,
    showMenu: showMenu,
    closeMenu: closeMenu,
    toast: ui.toast,
    selectApi: function (id) { S.apiId = id; S.reqTab = 'params'; render(); },
    setEnv: function (id) {
      S.envId = id;
      store.setActiveEnv(project(), id);
      render();
    },
    setSection: function (s) { S.section = s; render(); }
  };

  init();
})();
