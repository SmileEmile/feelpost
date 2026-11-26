/* feelpost AI module prototype — self-contained, simulated AI */
(function () {
  const FP = window.FP;
  const ui = FP.ui;
  const icon = ui.icon;

  const params = new URLSearchParams(location.search);
  const saved = (function () {
    try { return JSON.parse(localStorage.getItem('feelpost.ai.prototype') || '{}'); }
    catch (e) { return {}; }
  })();

  const state = {
    view: params.get('view') || 'fields',
    theme: params.get('theme') || saved.theme || document.documentElement.dataset.theme || 'light',
    inserted: saved.inserted !== false,
    tested: saved.tested !== false
  };

  const views = [
    ['fields', '字段说明'],
    ['cases', 'AI 用例'],
    ['handoff', '前端接入'],
    ['settings', 'AI 设置'],
    ['context', '上下文预览']
  ];

  function spark(size, cls) {
    return '<svg class="icon ai-spark ' + (cls || '') + '" width="' + (size || 15) + '" height="' + (size || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2.5l1.8 6.1L20 10.4l-6.2 1.8L12 18.3l-1.8-6.1L4 10.4l6.2-1.8z"/>' +
      '<path d="M19 17.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/></svg>';
  }

  function updateTheme() {
    document.documentElement.dataset.theme = state.theme;
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'moon', 17);
    try {
      localStorage.setItem('feelpost.ai.prototype', JSON.stringify({ theme: state.theme, inserted: state.inserted, tested: state.tested }));
    } catch (e) { /* noop */ }
  }

  function setView(view) {
    state.view = view;
    document.getElementById('modal-root').innerHTML = '';
    render();
  }

  function renderRail() {
    const active = state.view === 'handoff' ? 'docs' : state.view === 'settings' ? 'settings' : state.view === 'cases' ? 'cases' : 'api';
    const items = [
      ['api', '接口', 'braces', 'fields'],
      ['cases', '用例', 'cases', 'cases'],
      ['docs', '文档', 'doc', 'handoff'],
      ['env', '环境', 'globe', 'settings']
    ];
    document.getElementById('rail').innerHTML =
      items.map(function (it) {
        return '<button class="rail-btn ' + (active === it[0] ? 'active' : '') + '" data-view="' + it[3] + '" title="' + it[1] + '">' +
          icon(it[2], 20) + '<span>' + it[1] + '</span></button>';
      }).join('') +
      '<span class="rail-spacer"></span>' +
      '<button class="rail-btn ' + (active === 'settings' ? 'active' : '') + '" data-view="settings" title="设置">' + icon('settings', 20) + '<span>设置</span></button>';
  }

  function interfaceTree() {
    return '<div class="sidebar-head"><h2>接口</h2><span class="count">3</span><span class="spacer"></span><button class="btn btn-sm btn-ghost">收起全部</button></div>' +
      '<div class="sidebar-search">' + icon('search', 13) + '<input placeholder="搜索路径 / 名称 / 控制器" /></div>' +
      '<div class="filter-row"><button class="filter-chip on">ALL</button><button class="filter-chip on m-get">GET</button><button class="filter-chip on m-post">POST</button><button class="filter-chip">PUT</button><button class="filter-chip">PATCH</button><button class="filter-chip">DELETE</button></div>' +
      '<div class="tree">' +
        '<div class="tree-group"><button class="tree-group-head">' + icon('chevronDown', 13) + '<span>demo-service</span><span class="count">3</span></button><div class="tree-items">' +
          '<div class="tree-group"><button class="tree-group-head">' + icon('chevronDown', 13) + '<span>com.demo.user</span><span class="count">3</span></button><div class="tree-items">' +
            '<button class="tree-item"><span class="method m-get">GET</span><span class="tree-path">/users/{id}</span></button>' +
            '<button class="tree-item active"><span class="method m-post">POST</span><span class="tree-path">/users</span><span class="tree-badges"><span class="chip new">已注册</span></span></button>' +
            '<button class="tree-item"><span class="method m-get">GET</span><span class="tree-path">/users/export</span></button>' +
          '</div></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="sidebar-foot"><span class="dot ok"></span>已注册 3</div>';
  }

  function docsSidebar() {
    return '<div class="sidebar-head"><h2>文档</h2><span class="spacer"></span><button class="btn btn-sm btn-ghost">' + icon('plus', 13) + '</button></div>' +
      '<div class="ai-docs-list">' +
        '<button class="ai-doc-item">' + icon('doc', 15) + '<span>项目文档</span></button>' +
        '<button class="ai-doc-item">' + icon('file', 15) + '<span>单接口文档</span></button>' +
        '<div class="ai-side-label">AI 接入文档</div>' +
        '<button class="ai-doc-item active">' + spark(14) + '<span>用户模块前端接入摘要</span></button>' +
      '</div>' +
      '<div class="sidebar-foot"><span class="dot ok"></span>AI 已启用 · deepseek-chat</div>';
  }

  function settingsSidebar() {
    return '<div class="sidebar-head"><h2>设置</h2></div>' +
      '<div class="ai-docs-list">' +
        '<button class="ai-doc-item">' + icon('sun', 15) + '<span>外观</span></button>' +
        '<button class="ai-doc-item">' + icon('folder', 15) + '<span>数据目录</span></button>' +
        '<button class="ai-doc-item active">' + spark(14) + '<span>AI 助手</span></button>' +
        '<button class="ai-doc-item">' + icon('info', 15) + '<span>关于</span></button>' +
      '</div>' +
      '<div class="sidebar-foot"><span class="dot ok"></span>原型数据仅存本机</div>';
  }

  function renderSidebar() {
    const el = document.getElementById('sidebar');
    if (state.view === 'handoff') el.innerHTML = docsSidebar();
    else if (state.view === 'settings') el.innerHTML = settingsSidebar();
    else el.innerHTML = interfaceTree();
  }

  function demoBar() {
    return '<div class="ai-demo-bar">' +
      '<span class="ai-demo-label">' + spark(12) + ' AI 模块原型</span>' +
      '<div class="ai-seg">' + views.map(function (v) {
        return '<button class="' + (state.view === v[0] ? 'on' : '') + '" data-view="' + v[0] + '">' + v[1] + '</button>';
      }).join('') + '</div>' +
      '<span class="spacer"></span>' +
      '<span class="ai-demo-note">模拟数据 · 不发起真实模型调用</span>' +
      '</div>';
  }

  function apiHead() {
    return '<div class="ai-api-head">' +
      '<span class="method m-post">POST</span>' +
      '<span class="ai-api-path">/users</span>' +
      '<span class="ai-api-name">创建用户</span>' +
      '<span class="chip ok soft">已注册</span>' +
      '<div class="ai-api-actions">' +
        '<button class="ai-inline-ai" data-action="open-context">' + spark(13) + ' 上下文预览</button>' +
        '<button class="ai-inline-ai" data-action="open-fields">' + spark(13) + ' AI 补全字段</button>' +
        '<button class="btn btn-primary btn-sm">发送</button>' +
      '</div></div>';
  }

  function bodyTab() {
    return '<div class="ai-tabs">' +
      '<button>Headers</button><button>Query</button><button>Path</button><button class="on">Body</button><button>Cookies</button><button>生效参数</button>' +
      '</div>';
  }

  function bodyContent() {
    return '<div class="ai-body-wrap">' +
      '<div class="ai-section-head"><h3>请求体 · JSON</h3><span class="ai-muted">application/json</span><span class="spacer"></span>' +
        '<button class="ai-inline-ai" data-action="open-fields">' + spark(13) + ' AI 补全字段说明</button>' +
      '</div>' +
      '<div class="ai-field-table" style="margin-bottom:14px">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr><th style="width:29%">字段</th><th style="width:13%">类型</th><th style="width:22%">示例</th><th>字段说明</th></tr></thead>' +
          '<tbody>' +
            '<tr><td class="path">name</td><td class="type">string</td><td class="mono">"alice"</td><td class="desc-empty">暂无说明</td></tr>' +
            '<tr><td class="path">email</td><td class="type">string</td><td class="mono">"a@b.com"</td><td class="desc-empty">暂无说明</td></tr>' +
            '<tr><td class="path">profile.age</td><td class="type">number</td><td class="mono">28</td><td>年龄</td></tr>' +
            '<tr><td class="path">profile.city</td><td class="type">string</td><td class="mono">"武汉"</td><td>所在城市</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="ai-json-card"><pre>{</pre><pre>  <span class="tok-key">"name"</span>: <span class="tok-str">"alice"</span>,</pre><pre>  <span class="tok-key">"email"</span>: <span class="tok-str">"a@b.com"</span>,</pre><pre>  <span class="tok-key">"profile"</span>: { <span class="tok-key">"age"</span>: 28, <span class="tok-key">"city"</span>: <span class="tok-str">"武汉"</span> }</pre><pre>}</pre></div>' +
      '<div class="ai-empty-hint">' + spark(13) + ' AI 会读取字段名、类型和示例值生成说明；已有说明会以 Diff 展示，不会直接覆盖。</div>' +
      '</div>';
  }

  function fieldOverlay() {
    const rows = [
      { path: 'name', type: 'string', old: '', suggestion: '用户姓名，2–32 个字符', mode: 'add', checked: true },
      { path: 'email', type: 'string', old: '', suggestion: '用户邮箱，用于登录与通知', mode: 'add', checked: true },
      { path: 'profile.age', type: 'number', old: '年龄', suggestion: '用户年龄，取值范围 18–120', mode: 'replace', checked: false },
      { path: 'profile.city', type: 'string', old: '所在城市', suggestion: '用户所在城市，省市两级', mode: 'replace', checked: false }
    ];
    return '<div class="ai-overlay in" id="ai-overlay">' +
      '<div class="ai-modal" role="dialog" aria-modal="true" aria-label="AI 补全字段说明">' +
        '<header class="ai-modal-head">' +
          '<span class="ai-ico-btn">' + spark(17) + '</span>' +
          '<div><h3>AI 补全字段说明 <span class="ai-badge">AI</span></h3><p>请求体 · POST /users · 4 个字段 · 上下文已确认</p></div>' +
          '<button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('x', 18) + '</button>' +
        '</header>' +
        '<div class="ai-modal-body">' +
          '<div class="ai-banner">' + spark(14) + '<div><b>默认只补空字段。</b> 已有说明会以 Diff 展示，勾选后才覆盖；不会新增或删除字段。</div></div>' +
          '<div class="ai-meta-line" style="margin-bottom:8px"><span class="model">deepseek-chat</span><span>·</span><span>1,840 tokens</span><span>·</span><span>字段说明 v1</span></div>' +
          '<table class="ai-diff">' +
            '<thead><tr><th style="width:34px"><input class="check" type="checkbox" checked aria-label="全选" data-action="select-all-fields" /></th><th style="width:24%">字段</th><th style="width:12%">类型</th><th>当前说明</th><th>AI 建议</th></tr></thead>' +
            '<tbody>' + rows.map(function (r) {
              return '<tr><td><input class="check" type="checkbox" ' + (r.checked ? 'checked' : '') + ' aria-label="应用 ' + r.path + '" /></td>' +
                '<td><span class="path">' + r.path + '</span></td><td><span class="type">' + r.type + '</span></td>' +
                '<td>' + (r.old ? '<span class="old">' + r.old + '</span>' : '<span class="desc-empty">暂无说明</span>') + '</td>' +
                '<td><div class="diff-cell"><span class="new">' + r.suggestion + '</span><span class="' + (r.mode === 'replace' ? 'diff-replace' : 'diff-add') + '">' + (r.mode === 'replace' ? '覆盖' : '新增') + '</span></div></td></tr>';
            }).join('') + '</tbody>' +
          '</table>' +
          '<div class="ai-empty-hint" style="margin-top:10px">' + icon('info', 13) + ' 应用后会记录模型、生成时间与 Prompt 版本；可随时人工修改或删除。</div>' +
        '</div>' +
        '<footer class="ai-modal-foot"><span class="ai-selected">已选择 <b data-role="field-count">2</b> 项</span><span class="spacer"></span><span class="ai-token">1,840 tokens</span><button class="btn" data-action="close-overlay">取消</button><button class="btn btn-primary" data-action="apply-fields">应用所选</button></footer>' +
      '</div></div>';
  }

  function caseOverlay() {
    const cases = [
      ['正常创建用户', '正常', 'name=alice, email=a@b.com, profile.age=28', true],
      ['邮箱已存在', '异常', 'email 已注册，期望 409', true],
      ['最小必填参数', '边界', 'name 与 email 非空，profile 为空', true],
      ['空请求体', '空参数', 'body = {}', false]
    ];
    return '<div class="ai-overlay drawer in" id="ai-overlay">' +
      '<aside class="ai-drawer" role="dialog" aria-modal="true" aria-label="AI 生成用例">' +
        '<header class="ai-drawer-head">' +
          '<span class="ai-ico-btn">' + spark(17) + '</span>' +
          '<div><h3>AI 生成用例 <span class="ai-badge">AI</span></h3><p>当前接口 · POST /users · 创建用户</p></div>' +
          '<button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('x', 18) + '</button>' +
        '</header>' +
        '<div class="ai-drawer-body">' +
          '<div class="ai-banner">' + spark(14) + '<div>选择场景后生成候选用例；导入前可预览。不会自动发送请求，也不会生成断言。</div></div>' +
          '<div class="ai-scenario"><span class="ai-muted" style="font-size:11px;margin-right:3px">场景</span>' +
            '<button class="on">正常</button><button class="on">边界</button><button class="on">异常</button><button>空参数</button>' +
          '</div>' +
          '<div class="ai-gen-summary">' + icon('clock', 12) + '<span>已生成 4 个候选 · 1,120 tokens · deepseek-chat</span></div>' +
          '<div class="ai-case-list">' + cases.map(function (c, i) {
            return '<label class="ai-case-card"><input class="check" type="checkbox" ' + (c[3] ? 'checked' : '') + ' />' +
              '<span class="ai-case-main"><span class="ai-case-top"><strong>' + c[0] + '</strong><span class="chip ' + (i === 1 ? 'warn' : i === 2 ? 'info' : 'ok') + ' soft">' + c[1] + '</span></span>' +
              '<span class="ai-case-tags"><span class="tag ai-tag-ai">#AI</span><span class="tag">' + (i === 1 ? '错误处理' : '冒烟') + '</span></span>' +
              '<span class="ai-case-req"><span class="method m-post">POST</span> /users</span>' +
              '<span class="ai-case-desc">' + c[2] + '</span></span></label>';
          }).join('') + '</div>' +
          '<div class="ai-empty-hint" style="margin-top:10px">' + icon('info', 13) + ' 导入后自动添加 #AI 标签，并记录模型、生成时间与 Prompt 版本。</div>' +
        '</div>' +
        '<footer class="ai-drawer-foot"><span class="ai-selected">已选择 <b data-role="case-count">3</b> 个</span><span class="spacer"></span><button class="btn" data-action="close-overlay">取消</button><button class="btn btn-primary" data-action="import-cases">导入 <span data-role="case-button-count">3</span> 个用例</button></footer>' +
      '</aside></div>';
  }

  function contextOverlay() {
    return '<div class="ai-overlay in" id="ai-overlay">' +
      '<div class="ai-modal" role="dialog" aria-modal="true" aria-label="发送前确认">' +
        '<header class="ai-modal-head">' +
          '<span class="ai-ico-btn">' + icon('lock', 17) + '</span>' +
          '<div><h3>发送前确认</h3><p>本次将发送到 deepseek-chat · 首次使用或上下文变化时需要确认</p></div>' +
          '<button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('x', 18) + '</button>' +
        '</header>' +
        '<div class="ai-modal-body">' +
          '<div class="ai-context-stats">' +
            '<div class="ai-context-stat"><b>1</b><span>接口契约</span></div>' +
            '<div class="ai-context-stat"><b>1</b><span>响应示例</span></div>' +
            '<div class="ai-context-stat"><b>2</b><span>选中用例</span></div>' +
            '<div class="ai-context-stat"><b>1,840</b><span>预计 tokens</span></div>' +
          '</div>' +
          '<div class="ai-banner">' + icon('lock', 14) + '<div><b>敏感信息已脱敏。</b> Cookie、Authorization、token 不会发送给模型；默认不发送源码。</div></div>' +
          '<div class="ai-context-redact"><span class="chip danger soft">Cookie</span><span class="chip danger soft">Authorization</span><span class="chip danger soft">token</span><span class="ai-muted">已替换为 ***</span></div>' +
          '<div class="ai-context-code"><span class="k">"interface"</span>: { <span class="k">"method"</span>: <span class="s">"POST"</span>, <span class="k">"path"</span>: <span class="s">"/users"</span> },\n' +
            '<span class="k">"headers"</span>: [{ <span class="k">"key"</span>: <span class="s">"Authorization"</span>, <span class="k">"value"</span>: <span class="r">"***"</span> }],\n' +
            '<span class="k">"body"</span>: { <span class="k">"name"</span>: <span class="s">"alice"</span>, <span class="k">"email"</span>: <span class="s">"a@b.com"</span> },\n' +
            '<span class="k">"cases"</span>: [<span class="s">"正常创建用户"</span>, <span class="s">"邮箱已存在"</span>],\n' +
            '<span class="k">"sourceCode"</span>: <span class="r">null</span></div>' +
          '<label class="ai-confirm-check"><input class="check" type="checkbox" checked /> 我确认发送以上脱敏内容，仅用于本次 AI 生成。</label>' +
        '</div>' +
        '<footer class="ai-modal-foot"><span class="ai-token">不会保存完整 Prompt 与原始响应</span><span class="spacer"></span><button class="btn" data-action="close-overlay">取消</button><button class="btn btn-primary" data-action="confirm-context">确认并生成</button></footer>' +
      '</div></div>';
  }

  function interfaceView() {
    return '<div class="ai-api-head">' +
      '<span class="method m-post">POST</span><span class="ai-api-path">/users</span><span class="ai-api-name">创建用户</span><span class="chip ok soft">已注册</span>' +
      '<div class="ai-api-actions"><button class="ai-inline-ai" data-action="open-context">' + spark(13) + ' 上下文</button><button class="ai-inline-ai" data-action="open-fields">' + spark(13) + ' AI 补全字段</button><button class="btn btn-primary btn-sm">发送</button></div></div>' +
      bodyTab() + bodyContent();
  }

  function docsView() {
    return '<div class="ai-doc-head"><div><h1>用户模块前端接入摘要 <span class="ai-badge">' + spark(11) + ' AI</span></h1><p>api-test-service · 3 个接口 · 最近生成 2026-11-24 15:42</p></div>' +
      '<div class="ai-page-actions"><button class="btn btn-sm" data-action="copy">' + icon('copy', 13) + ' 复制</button><button class="btn btn-sm" data-action="export">' + icon('download', 13) + ' 导出</button><button class="btn btn-sm btn-primary" data-action="insert-doc">' + icon('link', 13) + ' ' + (state.inserted ? '已插入项目文档' : '插入项目文档') + '</button></div></div>' +
      '<div class="ai-doc-tabs"><button class="on">Markdown</button><button>TypeScript</button><button>版本 3</button></div>' +
      '<div class="ai-scroll"><div class="ai-doc-layout"><div class="ai-doc-content"><div class="ai-doc-preview">' +
        '<h1>用户模块前端接入摘要</h1><div class="meta"><span class="ai-badge">' + spark(10) + ' AI 生成</span><span>deepseek-chat</span><span>2026-11-24 15:42</span><span>3 个接口</span></div>' +
        '<p>本文档由 feelpost 根据选中的接口契约、响应示例与用例生成。基础接口文档仍以项目文档为准；本摘要用于前端快速理解调用顺序与类型。</p>' +
        '<h2>1. 接入范围</h2>' +
        '<table class="md-table"><thead><tr><th>方法</th><th>路径</th><th>用途</th></tr></thead><tbody>' +
          '<tr><td>GET</td><td><span class="inline-code">/users/{id}</span></td><td>查询用户详情</td></tr>' +
          '<tr><td>POST</td><td><span class="inline-code">/users</span></td><td>创建用户</td></tr>' +
          '<tr><td>GET</td><td><span class="inline-code">/users/export</span></td><td>导出用户列表</td></tr>' +
        '</tbody></table>' +
        '<h2>2. TypeScript 类型</h2>' +
        '<pre>export interface User {\n  id: number\n  name: string\n  email: string\n  profile?: { age?: number; city?: string }\n}\n\nexport interface CreateUserInput {\n  name: string\n  email: string\n  profile?: Pick&lt;User, "profile"&gt;</pre>' +
        '<div class="doc-callout">' + spark(13) + ' 建议先调用创建接口，再使用返回的 id 查询详情；导出接口返回文件流，不要按 JSON 解析。</div>' +
        '<h2>3. 请求约定</h2><p>所有请求使用 <span class="inline-code">application/json</span>。创建用户时 <span class="inline-code">name</span> 与 <span class="inline-code">email</span> 必填；<span class="inline-code">profile.age</span> 范围为 18–120。</p>' +
        '<h2>4. 错误处理</h2><p>邮箱已存在返回 409；参数校验失败返回 400，错误信息位于 <span class="inline-code">error.fields</span>。建议前端按状态码统一处理，不要把错误响应当作成功数据渲染。</p>' +
      '</div></div>' +
      '<aside class="ai-doc-side">' +
        '<div class="ai-card"><div class="ai-card-title">AI 元信息</div>' +
          '<div class="ai-kv"><span>模型</span><span>deepseek-chat</span></div>' +
          '<div class="ai-kv"><span>Prompt</span><span>handoff.v1</span></div>' +
          '<div class="ai-kv"><span>tokens</span><span>3,260</span></div>' +
          '<div class="ai-kv"><span>接口</span><span>3</span></div>' +
          (state.inserted ? '<div class="ai-inserted">' + icon('check', 14) + ' 已插入项目文档</div>' : '') +
        '</div>' +
        '<div class="ai-card"><div class="ai-card-title">版本历史</div>' +
          '<div class="ai-version"><span class="vnum">v3</span><span class="cur">当前版本</span><span class="spacer"></span><span class="ai-muted">15:42</span></div>' +
          '<div class="ai-version"><span class="vnum">v2</span><span class="ai-muted">昨天 18:20</span></div>' +
          '<div class="ai-version"><span class="vnum">v1</span><span class="ai-muted">11-21 10:08</span></div>' +
        '</div>' +
        '<button class="btn" data-action="handoff-info">' + icon('info', 13) + ' 查看发送上下文</button>' +
      '</aside></div></div>';
  }

  function settingsView() {
    return '<div class="ai-settings-wrap">' +
      '<h1>设置</h1><p>管理应用偏好与可选的 AI 能力。核心功能无需 AI 也可离线使用。</p>' +
      '<div class="ai-settings-grid">' +
        '<div>' +
          '<section class="ai-settings-card">' +
            '<h2>' + spark(15) + ' AI 助手 <span class="chip ok soft" style="margin-left:4px">已启用</span></h2>' +
            '<p class="sub">OpenAI-compatible 接入，可使用云端 API 或本地 Ollama。API Key 仅保存在系统安全存储中。</p>' +
            '<div class="ai-form-row" style="margin-top:8px"><label>启用 AI</label><div class="row-flex"><label class="switch"><input type="checkbox" checked /><span class="track"></span></label><span class="ai-muted">关闭后所有 AI 入口隐藏，不影响离线功能</span></div></div>' +
            '<div class="ai-form-row"><label>Base URL</label><div class="input-group"><input class="input" value="https://api.deepseek.com/v1" /><span class="chip ok soft">HTTPS</span></div></div>' +
            '<div class="ai-form-row"><label>API Key <span class="hint">系统安全存储</span></label><div class="input-group"><input class="input" type="password" value="sk-demo-1234567890" /><span class="ai-test-ok"><span class="dot"></span>已保存</span></div></div>' +
            '<div class="ai-form-row"><label>模型</label><input class="input" value="deepseek-chat" /></div>' +
            '<div class="ai-form-row"><label>超时</label><div class="row-flex"><input class="input" style="width:110px" value="60" /><span class="ai-muted">秒 · 仅对临时性失败自动重试一次</span></div></div>' +
            '<div class="ai-form-row"><label>连接状态</label><div class="row-flex"><span class="ai-test-ok"><span class="dot"></span>连接正常 · 延迟 312ms</span><span class="spacer"></span><button class="btn btn-sm" data-action="test-ai">测试连接</button></div></div>' +
            '<div class="ai-form-row" style="border-bottom:0"><span></span><div class="row-flex"><span class="spacer"></span><button class="btn btn-sm btn-primary" data-action="save-ai">保存配置</button></div></div>' +
          '</section>' +
          '<section class="ai-settings-card"><h2>' + icon('lock', 15) + ' 隐私与上下文</h2><p class="sub">AI 默认不发送源码；发送前会展示脱敏后的上下文。</p>' +
            '<ul class="ai-privacy-list">' +
              '<li>' + icon('check', 14) + '<span>仅发送当前接口契约、已保存示例、选中用例</span></li>' +
              '<li>' + icon('check', 14) + '<span>Cookie、Authorization、Token 自动替换为 ***</span></li>' +
              '<li>' + icon('check', 14) + '<span>首次使用与上下文变化时强制确认</span></li>' +
              '<li>' + icon('check', 14) + '<span>不保存完整 Prompt、原始响应或源码</span></li>' +
            '</ul>' +
            '<div class="ai-note-box" style="margin-top:10px">最近一次上下文：POST /users · 1 个响应示例 · 2 个用例 · 1,840 tokens</div>' +
          '</section>' +
        '</div>' +
        '<div>' +
          '<section class="ai-settings-card"><h2>本月用量</h2><div class="ai-usage-big"><b>28,640</b><span>tokens</span></div><div class="ai-bar"><i style="width:57%"></i></div><div class="ai-kv"><span>字段说明</span><span>12 次</span></div><div class="ai-kv"><span>AI 用例</span><span>6 次</span></div><div class="ai-kv"><span>接入摘要</span><span>3 次</span></div></section>' +
          '<section class="ai-settings-card"><h2>安全说明</h2><p class="sub">API Key 不进入渲染进程、日志与导出文档。模型输出会经过结构化校验，失败不会写入资产。</p><div class="ai-note-box" style="margin-top:10px"><b>AI 结果始终先预览。</b> 字段说明、用例和接入文档都不会自动应用。</div></section>' +
        '</div>' +
      '</div></div>';
  }

  function renderMain() {
    const main = document.getElementById('main');
    if (state.view === 'handoff') {
      main.innerHTML = demoBar() + docsView();
      return;
    }
    if (state.view === 'settings') {
      main.innerHTML = demoBar() + settingsView();
      return;
    }
    main.innerHTML = demoBar() + '<div class="ai-workspace">' + interfaceView() + '</div>';
  }

  function renderOverlay() {
    const root = document.getElementById('modal-root');
    root.innerHTML = state.view === 'fields' ? fieldOverlay() : state.view === 'cases' ? caseOverlay() : state.view === 'context' ? contextOverlay() : '';
    const overlay = document.getElementById('ai-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });
    updateCounts();
  }

  function updateCounts() {
    const fieldChecks = Array.from(document.querySelectorAll('.ai-diff tbody .check'));
    const fieldCount = document.querySelector('[data-role="field-count"]');
    if (fieldCount) fieldCount.textContent = fieldChecks.filter(function (el) { return el.checked; }).length;
    const caseChecks = Array.from(document.querySelectorAll('.ai-case-card > .check'));
    const caseCount = document.querySelector('[data-role="case-count"]');
    const caseButtonCount = document.querySelector('[data-role="case-button-count"]');
    if (caseCount) caseCount.textContent = caseChecks.filter(function (el) { return el.checked; }).length;
    if (caseButtonCount) caseButtonCount.textContent = caseChecks.filter(function (el) { return el.checked; }).length;
  }

  function closeOverlay() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function render() {
    updateTheme();
    renderRail();
    renderSidebar();
    renderMain();
    renderOverlay();
  }

  document.addEventListener('click', function (e) {
    const scenario = e.target.closest('.ai-scenario button');
    if (scenario) { scenario.classList.toggle('on'); return; }
    const docTab = e.target.closest('.ai-doc-tabs button');
    if (docTab) {
      Array.from(docTab.parentNode.children).forEach(function (b) { b.classList.toggle('on', b === docTab); });
      return;
    }
    const view = e.target.closest('[data-view]');
    if (view) {
      setView(view.dataset.view);
      return;
    }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const name = action.dataset.action;
    if (name === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      updateTheme();
      return;
    }
    if (name === 'close-overlay') { closeOverlay(); return; }
    if (name === 'open-fields') { state.view = 'fields'; setView('fields'); return; }
    if (name === 'open-context') { state.view = 'context'; setView('context'); return; }
    if (name === 'apply-fields') {
      const count = document.querySelectorAll('.ai-diff tbody .check:checked').length;
      closeOverlay(); ui.toast('已应用 ' + count + ' 个字段说明 · 已记录 AI 元信息', 'ok'); return;
    }
    if (name === 'import-cases') {
      const count = document.querySelectorAll('.ai-case-card > .check:checked').length;
      closeOverlay(); ui.toast('已导入 ' + count + ' 个用例 · 已添加 #AI 标签', 'ok'); return;
    }
    if (name === 'confirm-context') { closeOverlay(); ui.toast('上下文已确认 · 可以开始生成', 'info'); return; }
    if (name === 'copy') { ui.toast('Markdown 已复制', 'ok'); return; }
    if (name === 'export') { ui.toast('已生成 Markdown 导出文件（模拟）', 'ok'); return; }
    if (name === 'insert-doc') {
      state.inserted = !state.inserted;
      try { localStorage.setItem('feelpost.ai.prototype', JSON.stringify({ theme: state.theme, inserted: state.inserted, tested: state.tested })); } catch (err) { /* noop */ }
      render();
      ui.toast(state.inserted ? '已插入项目文档 · 固定章节已更新' : '已取消插入项目文档', state.inserted ? 'ok' : 'info');
      return;
    }
    if (name === 'select-all-fields') {
      const all = Array.from(document.querySelectorAll('.ai-diff tbody .check'));
      const target = action.checked;
      all.forEach(function (el) { el.checked = target; });
      updateCounts();
      return;
    }
    if (name === 'test-ai') { state.tested = true; ui.toast('连接正常 · 312ms', 'ok'); return; }
    if (name === 'save-ai') { ui.toast('AI 配置已保存', 'ok'); return; }
    if (name === 'handoff-info') { state.view = 'context'; setView('context'); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches('.ai-diff .check, .ai-case-card > .check')) updateCounts();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeOverlay();
  });

  render();
})();
