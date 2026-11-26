/* feelpost prototype — cases summary */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const esc = util.esc;

  function project() { return FP.app.project(); }

  function allTags(p) {
    const map = {};
    p.cases.forEach(function (c) {
      (c.tags || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; });
    });
    return Object.keys(map).sort().map(function (t) { return { name: t, count: map[t] }; });
  }

  function visibleCases(app) {
    const p = app.project();
    const q = (app.S.caseQuery || '').trim().toLowerCase();
    const tag = app.S.caseTag;
    return p.cases.filter(function (c) {
      const api = p.apis.find(function (a) { return a.id === c.apiId; }) || { path: '', name: '' };
      if (tag && (c.tags || []).indexOf(tag) === -1) return false;
      if (!q) return true;
      return (c.name + ' ' + (c.note || '') + ' ' + api.path + ' ' + api.name + ' ' + (c.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1;
    });
  }

  function sidebar() {
    const app = FP.app;
    const p = app.project();
    const tags = allTags(p);
    return '<div class="sidebar-head"><h2>用例</h2><span class="count">' + p.cases.length + '</span></div>' +
      '<div class="sidebar-search">' + ui.icon('search', 14) +
      '<input id="case-search" type="text" placeholder="搜索用例 / 备注 / 路径" value="' + esc(app.S.caseQuery) + '">' +
      '</div>' +
      '<div class="env-list">' +
      '<button class="env-item' + (!app.S.caseTag ? ' active' : '') + '" data-tag="">' +
      '<div class="meta"><span class="name">全部用例</span><span class="url">共 ' + p.cases.length + ' 条</span></div>' +
      '</button>' +
      tags.map(function (t) {
        return '<button class="env-item' + (app.S.caseTag === t.name ? ' active' : '') + '" data-tag="' + esc(t.name) + '">' +
          '<div class="meta"><span class="name">#' + esc(t.name) + '</span><span class="url">' + t.count + ' 条用例</span></div>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<div class="sidebar-foot">' + ui.icon('info', 13) + '<span>用例保存的是请求快照</span></div>';
  }

  function statsHTML(p, list) {
    const covered = new Set(list.map(function (c) { return c.apiId; })).size;
    const envs = new Set(list.map(function (c) { return c.envId; })).size;
    const tags = new Set();
    list.forEach(function (c) { (c.tags || []).forEach(function (t) { tags.add(t); }); });
    return '<div class="stats">' +
      '<div class="stat"><div class="k">用例总数</div><div class="v">' + list.length + '</div></div>' +
      '<div class="stat"><div class="k">覆盖接口</div><div class="v">' + covered + ' <span class="small-note">/ ' + p.apis.length + '</span></div></div>' +
      '<div class="stat"><div class="k">涉及环境</div><div class="v">' + envs + '</div></div>' +
      '<div class="stat"><div class="k">标签</div><div class="v">' + tags.size + '</div></div>' +
      '</div>';
  }

  function main() {
    const app = FP.app;
    const p = app.project();
    const list = visibleCases(app);
    const rows = list.map(function (c) {
      const api = p.apis.find(function (a) { return a.id === c.apiId; }) || { method: '?', path: '?', name: '—' };
      const envFound = p.envs.find(function (e) { return e.id === c.envId; });
      const envName = envFound ? envFound.name : (c.envName || '环境已删除');
      return '<tr data-case="' + esc(c.id) + '" style="cursor:pointer">' +
        '<td class="row-title">' + esc(c.name) +
        (c.note ? '<div class="sub" style="font-family:var(--font)">' + esc(c.note) + '</div>' : '') + '</td>' +
        '<td><div class="flex">' + ui.methodBadge(api.method) + '<span class="sub">' + esc(api.path) + '</span></div></td>' +
        '<td><span class="chip muted">' + esc(envName) + '</span>' +
        (envFound ? '' : '<span class="chip warn">已删除</span>') + '</td>' +
        '<td><div class="tag-list">' + (c.tags || []).map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('') + '</div></td>' +
        '<td class="sub">' + esc(c.savedAt) + '</td>' +
        '<td class="right"><div class="actions">' +
        '<button class="icon-btn sm" data-case-rename="' + esc(c.id) + '" title="重命名">' + ui.icon('edit', 15) + '</button>' +
        '<button class="icon-btn sm" data-case-dup="' + esc(c.id) + '" title="复制用例">' + ui.icon('copy', 15) + '</button>' +
        '<button class="icon-btn sm" data-case-curl="' + esc(c.id) + '" title="复制 curl">' + ui.icon('link', 15) + '</button>' +
        '<button class="icon-btn sm" data-case-del="' + esc(c.id) + '" title="删除用例">' + ui.icon('trash', 15) + '</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '<div class="section-head">' +
      '<div><h1>用例汇总</h1><p>共 ' + p.cases.length + ' 条用例 · 当前筛选 ' + list.length + ' 条</p></div>' +
      '<div class="grow"></div>' +
      '<button class="btn" data-act="goto-workspace">' + ui.icon('braces', 14) + ' 去接口调试</button>' +
      '<button class="btn btn-primary" data-act="export-cases">' + ui.icon('download', 14) + ' 导出 md</button>' +
      '</div>' +
      '<div class="section-body">' +
      statsHTML(p, list) +
      '<div class="card">' +
      '<div class="card-head">' + ui.icon('cases', 15) + ' 用例 <span class="sub">保存后不随接口变更改写</span></div>' +
      (list.length
        ? '<div class="table-wrap"><table class="table">' +
        '<thead><tr><th>用例</th><th>接口</th><th>环境</th><th>标签</th><th>保存时间</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>'
        : ui.empty({
          icon: 'cases',
          title: p.cases.length ? '没有匹配的用例' : '还没有用例',
          desc: p.cases.length ? '换个关键字或清空标签筛选试试。' : '在接口调试页发送请求后，点击「保存用例」把当前请求存为快照。',
          action: p.cases.length ? '' : '<button class="btn btn-primary" data-act="goto-workspace">去接口调试</button>'
        })) +
      '</div>' +
      '</div>';
  }

  function openCase(c, app) {
    const p = app.project();
    const api = p.apis.find(function (a) { return a.id === c.apiId; }) || { method: '?', path: '?', name: '—' };
    const envFound = p.envs.find(function (e) { return e.id === c.envId; });
    const envName = envFound ? envFound.name : (c.envName || '环境已删除');
    const envBase = c.baseUrl || (envFound ? envFound.baseUrl : '');
    const env = envFound || { name: envName, baseUrl: envBase };
    const req = c.request || {};
    const query = (req.query || []).filter(function (r) { return r.key && r.enabled !== false; });
    const headers = (req.headers || []).filter(function (r) { return r.key && r.enabled !== false; });
    const pathRows = Object.keys(req.path || {}).map(function (k) { return [k, req.path[k]]; });
    const curl = util.buildCurl(api, req, env, app.global());

    ui.modal({
      title: c.name,
      subtitle: api.method + ' ' + api.path + ' · ' + envName + (envFound ? '' : '（环境已删除）'),
      wide: true,
      body:
        '<div class="flex flex-wrap mb-8">' +
        ui.statusChip(api.status) +
        '<span class="chip muted">' + esc(envName) + '</span>' +
        (envFound ? '' : '<span class="chip warn">环境已删除</span>') +
        '<span class="small-note mono">' + esc(envBase) + '</span>' +
        (c.tags || []).map(function (t) { return '<span class="tag">#' + esc(t) + '</span>'; }).join('') +
        '<span class="small-note">保存于 ' + esc(c.savedAt) + '</span>' +
        '</div>' +
        (c.note ? '<p class="small-note mb-8">' + esc(c.note) + '</p>' : '') +
        '<div class="card"><div class="card-head">请求快照</div><div class="card-body">' +
        (pathRows.length ? '<h4 class="kv-title">Path</h4><table class="kv-table"><tbody>' +
          pathRows.map(function (r) { return '<tr><td class="mono" style="width:160px">' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td><td></td></tr>'; }).join('') +
          '</tbody></table>' : '') +
        (query.length ? '<h4 class="kv-title mt-16">Query</h4><table class="kv-table"><tbody>' +
          query.map(function (r) { return '<tr><td class="mono" style="width:160px">' + esc(r.key) + '</td><td class="mono">' + esc(r.value) + '</td><td></td></tr>'; }).join('') +
          '</tbody></table>' : '') +
        (headers.length ? '<h4 class="kv-title mt-16">Headers</h4><table class="kv-table"><tbody>' +
          headers.map(function (r) { return '<tr><td class="mono" style="width:160px">' + esc(r.key) + '</td><td class="mono">' + esc(r.value) + '</td><td></td></tr>'; }).join('') +
          '</tbody></table>' : '') +
        '<h4 class="kv-title mt-16">请求体</h4>' +
        (req.bodyRaw
          ? '<pre class="code-view" style="border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">' + esc(req.bodyRaw) + '</pre>'
          : '<p class="small-note">无请求体</p>') +
        '</div></div>' +
        '<p class="small-note mt-12">这是一份冻结快照：接口定义变化不会改写它，执行前请确认参数是否仍然有效。</p>',
      footer: '<button class="btn" data-close>关闭</button>' +
        '<button class="btn btn-primary" data-copy-curl>' + ui.icon('copy', 14) + ' 复制 curl</button>',
      onMount: function (el, close) {
        el.querySelector('[data-copy-curl]').onclick = function () {
          util.copyText(curl).then(function (ok) {
            ui.toast(ok ? 'curl 已复制' : '复制失败', ok ? 'ok' : 'err');
          });
        };
      }
    });
  }

  function exportMd(app) {
    const p = app.project();
    const list = visibleCases(app);
    if (!list.length) { ui.toast('当前没有可导出的用例', 'info'); return; }
    const md = util.buildCasesMD(p, list, null, app.global());
    ui.modal({
      title: '导出用例 md',
      subtitle: '共 ' + list.length + ' 条用例',
      wide: true,
      body: '<pre class="md-source" style="max-height:52vh">' + esc(md) + '</pre>',
      footer: '<button class="btn" data-close>关闭</button>' +
        '<button class="btn" data-copy>复制</button>' +
        '<button class="btn btn-primary" data-download>' + ui.icon('download', 14) + ' 下载 .md</button>',
      onMount: function (el) {
        el.querySelector('[data-copy]').onclick = function () {
          util.copyText(md).then(function (ok) { ui.toast(ok ? '已复制 md' : '复制失败', ok ? 'ok' : 'err'); });
        };
        el.querySelector('[data-download]').onclick = function () {
          util.download(p.name + '-cases.md', md);
          ui.toast('已开始下载');
        };
      }
    });
  }

  function bind(sEl, mEl) {
    const app = FP.app;
    const search = sEl.querySelector('#case-search');
    if (search) {
      search.addEventListener('input', function () {
        const q = search.value;
        app.S.caseQuery = q;
        app.render();
        const el = document.getElementById('case-search');
        if (el) { el.focus(); el.setSelectionRange(q.length, q.length); }
      });
    }
    sEl.addEventListener('click', function (e) {
      const t = e.target.closest('[data-tag]');
      if (t) { app.S.caseTag = t.dataset.tag || null; app.render(); }
    });

    mEl.addEventListener('click', function (e) {
      const rename = e.target.closest('[data-case-rename]');
      if (rename) {
        e.stopPropagation();
        const p = app.project();
        const c = p.cases.find(function (x) { return x.id === rename.dataset.caseRename; });
        if (!c) return;
        ui.modal({
          title: '重命名用例',
          body: '<div class="field"><label for="cr-name">用例名称</label>' +
            '<input class="input" id="cr-name" value="' + esc(c.name) + '"></div>',
          footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-save-name>保存</button>',
          onMount: function (el, close) {
            const input = el.querySelector('#cr-name');
            input.focus(); input.select();
            el.querySelector('[data-save-name]').onclick = function () {
              const n = input.value.trim();
              if (!n) { ui.toast('名称不能为空', 'err'); return; }
              c.name = n;
              FP.store.save();
              close();
              ui.toast('用例已重命名');
              app.render();
            };
          }
        });
        return;
      }
      const dup = e.target.closest('[data-case-dup]');
      if (dup) {
        e.stopPropagation();
        const p = app.project();
        const c = p.cases.find(function (x) { return x.id === dup.dataset.caseDup; });
        if (!c) return;
        const copy = util.deepClone(c);
        copy.id = 'case-' + Date.now().toString(36);
        copy.name = c.name + '（副本）';
        copy.savedAt = util.nowStr();
        copy.updatedAt = copy.savedAt;
        p.cases.push(copy);
        FP.store.save();
        ui.toast('已复制用例');
        app.render();
        return;
      }
      const del = e.target.closest('[data-case-del]');
      if (del) {
        e.stopPropagation();
        const id = del.dataset.caseDel;
        const c = app.project().cases.find(function (x) { return x.id === id; });
        ui.confirm({ title: '删除用例', text: '删除「' + (c ? c.name : '') + '」？该操作不可撤销。', okText: '删除', danger: true })
          .then(function (ok) {
            if (!ok) return;
            const p = app.project();
            p.cases = p.cases.filter(function (x) { return x.id !== id; });
            store_Save();
            ui.toast('用例已删除');
            app.render();
          });
        return;
      }
      const curl = e.target.closest('[data-case-curl]');
      if (curl) {
        e.stopPropagation();
        const p = app.project();
        const c = p.cases.find(function (x) { return x.id === curl.dataset.caseCurl; });
        if (!c) return;
        const api = p.apis.find(function (a) { return a.id === c.apiId; });
        const env = p.envs.find(function (x) { return x.id === c.envId; }) || {};
        util.copyText(util.buildCurl(api, c.request, env, app.global())).then(function (ok) {
          ui.toast(ok ? 'curl 已复制' : '复制失败', ok ? 'ok' : 'err');
        });
        return;
      }
      const row = e.target.closest('[data-case]');
      if (row) {
        const c = app.project().cases.find(function (x) { return x.id === row.dataset.case; });
        if (c) openCase(c, app);
        return;
      }
      if (e.target.closest('[data-act="export-cases"]')) { exportMd(app); return; }
      if (e.target.closest('[data-act="goto-workspace"]')) { app.setSection('workspace'); }
    });
  }

  function store_Save() { FP.store.save(); }

  FP.views = FP.views || {};
  FP.views.cases = { sidebar: sidebar, main: main, bind: bind };
})();
