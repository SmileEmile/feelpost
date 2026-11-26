/* feelpost prototype — docs & export */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const esc = util.esc;

  function scopeApis(app) {
    const p = app.project();
    const S = app.S;
    if (S.docApiId) {
      const a = p.apis.find(function (x) { return x.id === S.docApiId; });
      return a ? [a] : [];
    }
    let list;
    if (S.docScope === 'registered') {
      list = p.apis.filter(function (a) { return a.status === 'registered' || a.status === 'changed'; });
    } else {
      list = p.apis.slice();
    }
    if (!S.docIncludeManual) list = list.filter(function (a) { return a.source !== 'manual'; });
    return list;
  }

  function docMd(app) {
    const p = app.project();
    const list = scopeApis(app);
    return util.buildProjectMD(p, app.env(), app.global(), list);
  }

  function paramRows(api) {
    const rows = [];
    ['path', 'query', 'headers', 'cookies'].forEach(function (loc) {
      (api.params[loc] || []).forEach(function (x) {
        const v = util.fieldView(api, loc, x.key, x);
        rows.push([loc, x.key, v.type || 'string', v.required ? '是' : '否', v.desc || '—']);
      });
    });
    if (api.body && api.body.fields) {
      api.body.fields.forEach(function (f) {
        const v = util.fieldView(api, 'body', f.key, f);
        rows.push(['body', f.key, v.type || 'string', v.required ? '是' : '否', v.desc || '—']);
      });
    }
    return rows;
  }

  function apiDocHtml(app, api) {
    const p = app.project();
    const env = app.env();
    const draft = util.draftFromApi(api, env, app.global());
    const curl = util.buildCurl(api, draft, env, app.global());
    const example = util.effectiveExample(api, { env: env, global: app.global() });
    const rows = paramRows(api);
    const fields = util.flattenFields(example);

    return '<h2>' + ui.methodBadge(api.method) + '<code>' + esc(api.path) + '</code></h2>' +
      '<p>' + esc((api.manualLayer && api.manualLayer.summary) || api.summary || api.name) + ' · ' + esc(api.controller) + ' · ' + (FP.STATUS[api.status] || {}).label + '</p>' +
      '<h3>请求参数</h3>' +
      (rows.length
        ? '<table class="md-table"><thead><tr><th>位置</th><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[4]) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="small-note">无参数</p>') +
      '<h3>请求示例</h3>' +
      '<pre>' + esc(curl) + '</pre>' +
      '<h3>响应示例（HTTP 200）</h3>' +
      '<pre>' + esc(JSON.stringify(example, null, 2)) + '</pre>' +
      '<h3>响应字段</h3>' +
      (fields.length
        ? '<table class="md-table"><thead><tr><th>字段</th><th>类型</th><th>说明</th></tr></thead><tbody>' +
        fields.map(function (f) {
          return '<tr><td>' + esc(f.path) + '</td><td>' + esc(f.type) + '</td><td>' + esc((api.fieldNotes && api.fieldNotes[f.path]) || '—') + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="small-note">无字段</p>');
  }

  function sidebar() {
    const app = FP.app;
    const p = app.project();
    return '<div class="sidebar-head"><h2>文档</h2><span class="count">' + p.apis.length + '</span></div>' +
      '<div class="env-list">' +
      '<button class="env-item' + (!app.S.docApiId ? ' active' : '') + '" data-doc="project">' +
      '<div class="meta"><span class="name">项目文档</span><span class="url">全部接口 · 6 块结构</span></div>' +
      '</button>' +
      '<div class="kv-title" style="padding:12px 12px 4px">单接口文档</div>' +
      p.apis.map(function (a) {
        return '<button class="env-item' + (app.S.docApiId === a.id ? ' active' : '') + '" data-doc="' + esc(a.id) + '">' +
          '<div class="meta"><span class="name" style="display:flex;gap:6px;align-items:center">' + ui.methodBadge(a.method) + esc(a.name) + '</span>' +
          '<span class="url">' + esc(a.path) + '</span></div>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<div class="sidebar-foot">' + ui.icon('doc', 13) + '<span>导出给 AI 前端使用</span></div>';
  }

  function main() {
    const app = FP.app;
    const p = app.project();
    const list = scopeApis(app);
    const env = app.env();
    const md = docMd(app);
    const preview = list.map(function (a) { return apiDocHtml(app, a); }).join('');

    const tableList = '<table class="md-table"><thead><tr><th>#</th><th>方法</th><th>路径</th><th>名称</th><th>状态</th></tr></thead><tbody>' +
      list.map(function (a, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(a.method) + '</td><td>' + esc(a.path) + '</td><td>' + esc(a.name) + '</td><td>' + esc((FP.STATUS[a.status] || {}).label) + '</td></tr>';
      }).join('') + '</tbody></table>';

    const previewHtml = list.length
      ? '<h1>' + esc(p.name) + ' 接口文档</h1>' +
      '<div class="doc-meta"><span>环境：' + esc(env.name) + '（' + esc(env.baseUrl) + '）</span><span>·</span><span>接口 ' + list.length + ' 个</span><span>·</span><span>生成于 ' + util.nowStr() + '</span></div>' +
      '<h2>接口清单</h2>' + tableList + preview
      : ui.empty({ icon: 'doc', title: '没有可导出的接口', desc: '先扫描或手工新建接口，再来导出文档。' });

    return '<div class="section-head">' +
      '<div><h1>文档导出</h1><p>' + (app.S.docApiId ? '单接口文档' : '项目文档') + ' · 标准 6 块 · 面向 AI 前端</p></div>' +
      '<div class="grow"></div>' +
      '<div class="seg" data-docmode>' +
      '<button data-mode="preview" class="' + (app.S.docMode === 'preview' ? 'on' : '') + '">预览</button>' +
      '<button data-mode="source" class="' + (app.S.docMode === 'source' ? 'on' : '') + '">Markdown 源码</button>' +
      '</div>' +
      '<button class="btn" data-act="copy-md">' + ui.icon('copy', 14) + ' 复制 md</button>' +
      '<button class="btn btn-primary" data-act="download-md">' + ui.icon('download', 14) + ' 下载 .md</button>' +
      '</div>' +
      '<div class="section-body">' +
      '<div class="doc-layout">' +
      (app.S.docMode === 'preview'
        ? '<div class="doc-preview">' + previewHtml + '</div>'
        : '<pre class="md-source" style="flex:1;min-width:0;max-height:calc(100vh - 220px)">' + esc(md) + '</pre>') +
      '<div class="doc-side">' +
      '<div class="card"><div class="card-head">导出设置</div><div class="card-body">' +
      '<div class="field"><label for="doc-scope">导出范围</label>' +
      '<select class="select" id="doc-scope"' + (app.S.docApiId ? ' disabled' : '') + '>' +
      '<option value="all"' + (app.S.docScope === 'all' && !app.S.docApiId ? ' selected' : '') + '>全部接口（' + p.apis.length + '）</option>' +
      '<option value="registered"' + (app.S.docScope === 'registered' && !app.S.docApiId ? ' selected' : '') + '>仅已注册 / 已变更</option>' +
      '<option value="single"' + (app.S.docApiId ? ' selected' : '') + '>当前单个接口</option>' +
      '</select></div>' +
      '<div class="env-flag mt-12"><label class="switch"><input type="checkbox" id="doc-include-manual"' + (app.S.docIncludeManual ? ' checked' : '') + '><span class="track"></span><span>包含手工接口</span></label></div>' +
      '<div class="field mt-12"><label for="doc-env">环境（影响前置 URL 与 curl）</label>' +
      '<select class="select" id="doc-env">' + p.envs.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (e.id === env.id ? ' selected' : '') + '>' + esc(e.name) + ' · ' + esc(e.baseUrl.replace(/^https?:\/\//, '')) + '</option>';
      }).join('') + '</select></div>' +
      '<p class="small-note mt-12">' + ui.icon('info', 12) + ' 导出的 md 不含用例，也不含「鉴权要求」字段（需求基线 Q23）。</p>' +
      '</div></div>' +
      '<div class="card"><div class="card-head">md 结构 · 6 块</div><div class="card-body">' +
      '<ul class="doc-checklist">' +
      ['接口清单', '方法 + URL', '参数表（名 / 类型 / 必填 / 说明）', '请求示例（curl / JSON）', '响应示例（JSON）', '响应字段说明'].map(function (t, i) {
        return '<li><span class="num">' + (i + 1) + '</span><span>' + t + '</span></li>';
      }).join('') +
      '</ul></div></div>' +
      '</div></div></div>';
  }

  function bind(sEl, mEl) {
    const app = FP.app;
    sEl.addEventListener('click', function (e) {
      const t = e.target.closest('[data-doc]');
      if (!t) return;
      if (t.dataset.doc === 'project') app.S.docApiId = null;
      else app.S.docApiId = t.dataset.doc;
      app.S.docMode = 'preview';
      app.render();
    });

    mEl.addEventListener('click', function (e) {
      const mode = e.target.closest('[data-mode]');
      if (mode) { app.S.docMode = mode.dataset.mode; app.render(); return; }
      if (e.target.closest('[data-act="copy-md"]')) {
        util.copyText(docMd(app)).then(function (ok) { ui.toast(ok ? 'md 已复制' : '复制失败', ok ? 'ok' : 'err'); });
        return;
      }
      if (e.target.closest('[data-act="download-md"]')) {
        util.download(app.project().name + '-api.md', docMd(app));
        ui.toast('已开始下载');
      }
    });

    const scope = mEl.querySelector('#doc-scope');
    if (scope) {
      scope.addEventListener('change', function () {
        if (scope.value === 'single') {
          const a = app.api();
          app.S.docApiId = a ? a.id : null;
        } else {
          app.S.docApiId = null;
          app.S.docScope = scope.value;
        }
        app.render();
      });
    }
    const envSel = mEl.querySelector('#doc-env');
    if (envSel) {
      envSel.addEventListener('change', function () { app.setEnv(envSel.value); });
    }
    const incManual = mEl.querySelector('#doc-include-manual');
    if (incManual) {
      incManual.addEventListener('change', function () {
        app.S.docIncludeManual = incManual.checked;
        app.render();
      });
    }
  }

  FP.views = FP.views || {};
  FP.views.docs = { sidebar: sidebar, main: main, bind: bind };
})();
