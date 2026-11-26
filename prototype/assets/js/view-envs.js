/* feelpost prototype — environments & global params */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const esc = util.esc;

  const TABS = [['headers', 'Header'], ['query', 'Query'], ['cookies', 'Cookie'], ['body', 'Body']];
  const SCOPE = { env: 'env', global: 'global' };

  function store() { return FP.store; }
  function project() { return FP.app.project(); }
  function env() { return FP.app.env(); }

  function paramsArray(scope, tab) {
    return scope === 'env' ? env().params[tab] : FP.app.global()[tab];
  }

  function editorTable(scope, tab) {
    const rows = paramsArray(scope, tab) || [];
    const body = rows.map(function (r, i) {
      return '<tr>' +
        '<td class="cb"><input class="check" type="checkbox" data-p-en="' + scope + '" data-tab="' + tab + '" data-i="' + i + '"' + (r.enabled !== false ? ' checked' : '') + '></td>' +
        '<td><input type="text" data-p="' + scope + '" data-tab="' + tab + '" data-i="' + i + '" data-f="key" value="' + esc(r.key) + '" placeholder="key"></td>' +
        '<td><input type="text" data-p="' + scope + '" data-tab="' + tab + '" data-i="' + i + '" data-f="value" value="' + esc(r.value) + '" placeholder="value"></td>' +
        '<td class="act"><button class="icon-btn sm" data-del="' + scope + '" data-tab="' + tab + '" data-i="' + i + '" title="删除">' + ui.icon('x', 14) + '</button></td>' +
        '</tr>';
    }).join('');
    return (rows.length
      ? '<table class="kv-table"><thead><tr><th></th><th>键</th><th>值</th><th></th></tr></thead><tbody>' + body + '</tbody></table>'
      : '<p class="small-note" style="padding:6px 2px">还没有参数</p>') +
      '<div class="kv-tools"><button class="btn btn-sm" data-add="' + scope + '" data-tab="' + tab + '">' + ui.icon('plus', 13) + ' 添加一行</button></div>';
  }

  function paramCard(scope, tabState) {
    const isGlobal = scope === 'global';
    return '<div class="card">' +
      '<div class="card-head">' + ui.icon(isGlobal ? 'settings' : 'globe', 15) +
      (isGlobal ? '全局参数 <span class="sub">所有环境共享，环境可覆盖</span>' : '环境参数 <span class="sub">优先级高于全局</span>') +
      '</div>' +
      '<div class="tabs" style="padding-left:6px">' +
      TABS.map(function (t) {
        return '<button class="tab' + (tabState === t[0] ? ' active' : '') + '" data-ptab="' + scope + ':' + t[0] + '">' + t[1] + '</button>';
      }).join('') +
      '</div>' +
      '<div class="card-body">' + editorTable(scope, tabState) +
      (tabState === 'body'
        ? '<div class="kv-note">' + ui.icon('info', 14) + '环境 Body 字段会在接口请求体缺少同名字段时作为默认值补入。</div>'
        : '') +
      '</div></div>';
  }

  function effTable(rows, emptyText) {
    if (!rows.length) return '<p class="small-note" style="padding:6px 2px">' + emptyText + '</p>';
    return '<table class="kv-table eff-table"><tbody>' +
      rows.map(function (r) {
        return '<tr><td style="width:180px"><span class="mono key">' + esc(r.key) + '</span></td>' +
          '<td class="val">' + esc(r.value) + '</td>' +
          '<td style="width:70px"><span class="src">' + esc(r.source) + '</span></td><td style="width:36px"></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function sidebar() {
    const app = FP.app;
    const p = app.project();
    return '<div class="sidebar-head"><h2>环境</h2><span class="count">' + p.envs.length + '</span>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-act="new-env" title="新建环境">' + ui.icon('plus', 15) + '</button></div>' +
      '<div class="env-list">' +
      p.envs.map(function (e) {
        return '<button class="env-item' + (e.id === app.env().id ? ' active' : '') + '" data-env="' + esc(e.id) + '">' +
          '<div class="meta"><span class="name">' + esc(e.name) + '</span>' +
          '<span class="url">' + esc(e.baseUrl.replace(/^https?:\/\//, '')) + '</span></div>' +
          (e.id === app.env().id ? '<span class="dot ok"></span>' : '') +
          '</button>';
      }).join('') +
      '</div>' +
      '<div style="padding:0 12px 10px"><button class="btn btn-sm" style="width:100%;justify-content:center" data-act="new-env">' + ui.icon('plus', 13) + ' 新建环境</button></div>' +
      '<div class="sidebar-foot">' + ui.icon('lock', 13) + '<span>凭据按当前决定明文保存在本机</span></div>';
  }

  function main() {
    const app = FP.app;
    const p = app.project();
    const e = env();
    const eff = util.effectiveParams({
      api: { params: { path: [] } },
      draft: util.draftOf(),
      env: e,
      global: app.global()
    });
    const risky = e.name === '生产' && !e.verifyTls;

    return '<div class="section-head">' +
      '<div><h1>环境配置</h1><p>切换环境后整套参数立即生效 · 环境覆盖全局</p></div>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-ghost" data-act="del-env"' + (p.envs.length <= 1 ? ' disabled' : '') + '>' + ui.icon('trash', 14) + ' 删除环境</button>' +
      '<button class="btn btn-primary" data-act="save-env">' + ui.icon('check', 14) + ' 保存配置</button>' +
      '</div>' +
      '<div class="section-body">' +
      '<div class="env-grid">' +
      '<div class="card">' +
      '<div class="card-head">' + ui.icon('globe', 15) + ' 当前环境 <span class="sub">' + esc(e.name) + '</span>' +
      '<div class="spacer"></div><span class="chip ok">生效中</span></div>' +
      '<div class="card-body">' +
      '<div class="env-form-row">' +
      '<div class="field"><label for="env-name">环境名称</label><input class="input" id="env-name" value="' + esc(e.name) + '"></div>' +
      '<div class="field"><label for="env-url">前置 URL</label><input class="input mono" id="env-url" value="' + esc(e.baseUrl) + '"></div>' +
      '</div>' +
      '<div class="env-form-row mt-12">' +
      '<div class="field"><label>HTTPS 证书校验</label>' +
      '<div class="env-flag"><label class="switch"><input type="checkbox" id="env-tls"' + (e.verifyTls ? ' checked' : '') + '><span class="track"></span><span>' + (e.verifyTls ? '校验证书' : '跳过校验（内网自签证书）') + '</span></label></div>' +
      '</div>' +
      '<div class="field"><label for="env-proxy">HTTP 代理</label><input class="input mono" id="env-proxy" value="' + esc(e.proxy || '') + '" placeholder="http://10.20.0.8:3128，留空直连"></div>' +
      '</div>' +
      '<div class="env-form-row mt-12">' +
      '<div class="field"><label for="env-timeout">请求超时（毫秒）</label><input class="input mono" id="env-timeout" type="number" min="1000" step="1000" value="' + esc(e.timeoutMs || 30000) + '"></div>' +
      '<div class="field"><label>说明</label><div class="hint" style="padding-top:8px">超时按环境生效；失败不自动重试。</div></div>' +
      '</div>' +
      (risky ? '<div class="api-note warn" style="margin:12px -15px -15px;border-bottom:0">' + ui.icon('alert', 14) + '<span>生产环境未开启证书校验，请确认这是预期行为。</span></div>' : '') +
      '</div></div>' +
      paramCard('env', app.S.envTab) +
      paramCard('global', app.S.globalTab) +
      '<div class="card"><div class="card-head">' + ui.icon('braces', 15) + ' 生效参数预览 <span class="sub">全局 → 环境，后者覆盖</span></div><div class="card-body">' +
      '<h4 class="kv-title">Query</h4>' + effTable(eff.query, '无 Query 参数') +
      '<h4 class="kv-title mt-16">Headers</h4>' + effTable(eff.headers, '无 Header（Content-Type / Accept 会在发送时自动补）') +
      '<h4 class="kv-title mt-16">Cookies</h4>' + effTable(eff.cookies, '无 Cookie') +
      '</div></div>' +
      '</div></div>';
  }

  function newEnvModal() {
    const app = FP.app;
    ui.modal({
      title: '新建环境',
      subtitle: '环境 = 前置 URL + 一整套参数与凭据',
      body: '<div class="field mb-8"><label for="ne-name">环境名称</label><input class="input" id="ne-name" placeholder="例如 预发"></div>' +
        '<div class="field"><label for="ne-url">前置 URL</label><input class="input mono" id="ne-url" placeholder="https://pre-api.example.com/api"></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-create>创建</button>',
      onMount: function (el, close) {
        el.querySelector('#ne-name').focus();
        el.querySelector('[data-create]').onclick = function () {
          const name = el.querySelector('#ne-name').value.trim();
          const url = el.querySelector('#ne-url').value.trim();
          if (!name || !url) { ui.toast('名称与前置 URL 都必填', 'err'); return; }
          const envNew = {
            id: 'env-' + Date.now().toString(36),
            name: name,
            baseUrl: url,
            verifyTls: true,
            proxy: '',
            timeoutMs: 30000,
            params: { headers: [], query: [], cookies: [], body: [] }
          };
          project().envs.push(envNew);
          store().setActiveEnv(project(), envNew.id);
          FP.app.S.envId = envNew.id;
          store().save();
          close();
          ui.toast('环境已创建');
          app.render();
        };
      }
    });
  }

  function bind(sEl, mEl) {
    const app = FP.app;

    sEl.addEventListener('click', function (e) {
      const envBtn = e.target.closest('[data-env]');
      if (envBtn) { app.setEnv(envBtn.dataset.env); return; }
      if (e.target.closest('[data-act="new-env"]')) newEnvModal();
    });

    mEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-act="new-env"]')) { newEnvModal(); return; }
      if (e.target.closest('[data-act="save-env"]')) {
        const nameEl = mEl.querySelector('#env-name');
        const urlEl = mEl.querySelector('#env-url');
        if (nameEl) env().name = nameEl.value.trim() || env().name;
        if (urlEl) env().baseUrl = urlEl.value.trim() || env().baseUrl;
        store().save();
        ui.toast('环境配置已保存');
        app.render();
        return;
      }
      if (e.target.closest('[data-act="del-env"]')) {
        const p = app.project();
        if (p.envs.length <= 1) { ui.toast('至少保留一个环境', 'err'); return; }
        ui.confirm({
          title: '删除环境',
          text: '删除「' + env().name + '」？该环境下的配置会一并移除，用例与接口不受影响。',
          okText: '删除',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          const p2 = app.project();
          const delId = env().id;
          p2.envs = p2.envs.filter(function (x) { return x.id !== delId; });
          store().state.activeEnv[p2.id] = p2.envs[0].id;
          app.S.envId = p2.envs[0].id;
          store().save();
          ui.toast('环境已删除');
          app.render();
        });
        return;
      }
      const ptab = e.target.closest('[data-ptab]');
      if (ptab) {
        const parts = ptab.dataset.ptab.split(':');
        if (parts[0] === 'env') app.S.envTab = parts[1];
        else app.S.globalTab = parts[1];
        app.render();
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) {
        const scope = add.dataset.add;
        const tab = add.dataset.tab;
        const arr = scope === 'env' ? env().params[tab] : app.global()[tab];
        arr.push({ key: '', value: '', enabled: true });
        store().save();
        app.render();
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const scope = del.dataset.del;
        const tab = del.dataset.tab;
        const arr = scope === 'env' ? env().params[tab] : app.global()[tab];
        arr.splice(Number(del.dataset.i), 1);
        store().save();
        app.render();
      }
    });

    mEl.addEventListener('input', function (e) {
      const d = e.target.dataset;
      if (d.p) {
        const arr = d.p === 'env' ? env().params[d.tab] : app.global()[d.tab];
        const row = arr && arr[Number(d.i)];
        if (row && d.f) row[d.f] = e.target.value;
        return;
      }
      if (e.target.id === 'env-name') { env().name = e.target.value; return; }
      if (e.target.id === 'env-url') { env().baseUrl = e.target.value; return; }
      if (e.target.id === 'env-proxy') { env().proxy = e.target.value; }
      if (e.target.id === 'env-timeout') {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n) && n > 0) env().timeoutMs = n;
      }
    });

    mEl.addEventListener('change', function (e) {
      const d = e.target.dataset;
      if (d.pEn) {
        const arr = d.pEn === 'env' ? env().params[d.tab] : app.global()[d.tab];
        const row = arr && arr[Number(d.i)];
        if (row) row.enabled = e.target.checked;
        store().save();
        return;
      }
      if (e.target.id === 'env-tls') {
        env().verifyTls = e.target.checked;
        store().save();
        app.render();
        return;
      }
      if (e.target.id === 'env-name' || e.target.id === 'env-url' || e.target.id === 'env-proxy' || e.target.id === 'env-timeout') {
        store().save();
      }
    });
  }

  FP.views = FP.views || {};
  FP.views.envs = { sidebar: sidebar, main: main, bind: bind };
})();
