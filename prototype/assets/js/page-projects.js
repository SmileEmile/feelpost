/* feelpost prototype — project list page */
(function () {
  const FP = window.FP;
  const store = FP.store;
  const ui = FP.ui;
  const esc = FP.util.esc;

  store.init();

  const themeParam = new URLSearchParams(location.search).get('theme');
  if (themeParam === 'dark' || themeParam === 'light') {
    store.state.theme = themeParam;
    store.save();
  }

  const page = document.getElementById('page');
  const themeBtn = document.querySelector('[data-act="theme"]');

  function paintTheme() {
    const theme = store.state.theme || 'light';
    document.documentElement.dataset.theme = theme;
    if (themeBtn) {
      themeBtn.innerHTML = ui.icon(theme === 'dark' ? 'sun' : 'moon', 17);
      themeBtn.title = theme === 'dark' ? '切换到浅色' : '切换到深色';
    }
  }

  function pendingCount(p) {
    return (p.pendingBatch || []).length;
  }

  function render() {
    const projects = store.state.projects;
    const cards = projects.map(function (p) {
      const pending = pendingCount(p);
      const statusDot = pending
        ? '<span class="dot warn"></span> 有 ' + pending + ' 项扫描待确认'
        : '<span class="dot ok"></span> 上次扫描 ' + (p.lastScan || '—');
      return (
        '<div class="proj-card" role="button" tabindex="0" data-open="' + esc(p.id) + '" aria-label="打开项目 ' + esc(p.name) + '">' +
        '<div class="topp">' +
        '<span class="proj-ico">' + ui.icon('braces', 17) + '</span>' +
        '<div style="min-width:0">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<div class="path">' + esc(p.path) + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="desc">' + esc(p.desc || '—') + '</div>' +
        '<div class="metrics">' +
        '<span><b>' + p.apis.length + '</b> 接口</span>' +
        '<span><b>' + p.cases.length + '</b> 用例</span>' +
        '<span><b>' + p.envs.length + '</b> 环境</span>' +
        '</div>' +
        '<div class="foot">' + statusDot + '</div>' +
        '</div>'
      );
    }).join('');

    page.innerHTML =
      '<div class="page-title"><h1>项目</h1><p>以项目为维度组织扫描结果、环境与用例</p></div>' +
      '<p class="page-sub">选择一个 Spring Boot 工程开始：扫描源码生成接口 → 授权入库 → 切换环境调试 → 保存用例与响应示例 → 导出 md 给 AI 前端。</p>' +
      '<div class="proj-grid">' +
      (cards || '') +
      '<button class="new-card" data-act="new" aria-label="新建项目">' +
      ui.icon('plus', 22) +
      '<span>新建项目</span>' +
      '<span style="font-size:11px">选择本地源码目录</span>' +
      '</button>' +
      '</div>' +
      '<div class="page-foot">' +
      '<span>' + ui.icon('lock', 13) + '</span>' +
      '<span>离线运行 · 数据保存在本机</span>' +
      '<div class="spacer"></div>' +
      '<a href="app.html?project=' + encodeURIComponent(projects[0] ? projects[0].id : '') + '">直接进入工作台 →</a>' +
      '</div>';

    paintTheme();
  }

  function openProject(id) {
    location.href = 'app.html?project=' + encodeURIComponent(id) + '#workspace';
  }

  function newProjectModal() {
    ui.modal({
      title: '新建项目',
      subtitle: '项目对应一个本地 Spring Boot 工程目录',
      body:
        '<div class="field mb-8"><label for="np-name">项目名称</label>' +
        '<input class="input" id="np-name" placeholder="例如 api-test-service" autocomplete="off"></div>' +
        '<div class="field mb-8"><label for="np-path">源码目录</label>' +
        '<div class="input-group">' +
        '<input class="input" id="np-path" placeholder="~/workspace/api-test" autocomplete="off">' +
        '<button class="btn" type="button" data-pick-dir>' + ui.icon('folder', 14) + ' 选择目录</button>' +
        '</div>' +
        '<input type="file" id="np-dir" webkitdirectory multiple class="sr-only" tabindex="-1" aria-hidden="true">' +
        '<span class="hint" id="np-dir-hint">可直接粘贴路径，或点「选择目录」从本机挑选</span></div>' +
        '<div class="field mb-8"><label for="np-desc">描述（可选）</label>' +
        '<input class="input" id="np-desc" placeholder="这个工程负责什么" autocomplete="off"></div>' +
        '<div class="field"><label for="np-url">本地环境前置 URL</label>' +
        '<input class="input" id="np-url" placeholder="http://localhost:8080/api" autocomplete="off">' +
        '<span class="hint">后续可随时增删环境，前置 URL 是环境的必填项</span></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-create>创建并进入</button>',
      onMount: function (el, close) {
        const name = el.querySelector('#np-name');
        const path = el.querySelector('#np-path');
        const picker = el.querySelector('#np-dir');
        const hint = el.querySelector('#np-dir-hint');
        name.focus();

        /* 选择目录：浏览器目录选择器只暴露目录名，原型据此近似工程根路径 */
        picker.setAttribute('webkitdirectory', '');
        picker.setAttribute('directory', '');
        el.querySelector('[data-pick-dir]').onclick = function () {
          picker.value = '';
          picker.click();
        };
        picker.addEventListener('change', function () {
          const list = picker.files || [];
          if (!list.length) return;
          const first = list[0];
          const rel = first.webkitRelativePath || first.name;
          const folder = rel.split('/')[0] || '工程目录';
          path.value = '~/workspace/' + folder;
          /* 目录可能很大（如 node_modules），只抽样前 5000 个文件做识别 */
          const limit = Math.min(list.length, 5000);
          let hasBuild = false;
          let controllers = 0;
          for (let i = 0; i < limit; i += 1) {
            const f = list[i];
            const frel = f.webkitRelativePath || f.name;
            if (!hasBuild && /(^|\/)(pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle)$/.test(frel)) hasBuild = true;
            if (/Controller\.java$/.test(f.name)) controllers += 1;
          }
          const bits = [folder, list.length + ' 个文件'];
          bits.push(hasBuild ? '识别到构建文件' : '未识别到 pom.xml / build.gradle');
          if (controllers) bits.push(controllers + ' 个 Controller');
          hint.textContent = '已选择：' + bits.join(' · ');
          hint.title = '原型不会读取文件内容，只记录目录路径';
          hint.className = 'hint picked' + (hasBuild ? '' : ' warn');
          if (!hasBuild) ui.toast('未识别到 Maven / Gradle 构建文件，扫描可能失败', 'info');
        });

        el.querySelector('[data-create]').onclick = function () {
          const n = name.value.trim();
          if (!n) {
            name.focus();
            ui.toast('请填写项目名称', 'err');
            return;
          }
          const id = 'proj-' + Date.now().toString(36);
          const project = {
            id: id,
            name: n,
            path: path.value.trim() || '~/workspace/' + n,
            desc: el.querySelector('#np-desc').value.trim(),
            lastScan: '',
            scanCount: 0,
            apis: [],
            cases: [],
            envs: [{
              id: 'env-' + id,
              name: '本地',
              baseUrl: el.querySelector('#np-url').value.trim() || 'http://localhost:8080/api',
              verifyTls: false,
              proxy: '',
              params: { headers: [], query: [], cookies: [], body: [] }
            }],
            pendingBatch: null
          };
          store.state.projects.push(project);
          store.state.activeEnv[project.id] = project.envs[0].id;
          store.save();
          close();
          ui.toast('项目已创建，先跑一次扫描试试');
          setTimeout(function () { openProject(id); }, 200);
        };
        el.querySelector('#np-url').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') el.querySelector('[data-create]').click();
        });
      }
    });
  }

  page.addEventListener('click', function (e) {
    const open = e.target.closest('[data-open]');
    if (open) {
      openProject(open.dataset.open);
      return;
    }
    if (e.target.closest('[data-act="new"]')) newProjectModal();
  });

  page.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const open = e.target.closest('[data-open]');
    if (open) {
      e.preventDefault();
      openProject(open.dataset.open);
    }
  });

  document.querySelector('[data-act="reset"]').onclick = function () {
    ui.confirm({
      title: '重置演示数据',
      text: '会清空本机保存的接口、用例、环境与自定义项目，恢复初始演示数据。',
      okText: '重置',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      store.reset();
      render();
      ui.toast('演示数据已重置');
    });
  };

  document.querySelector('[data-act="new"]').onclick = newProjectModal;

  themeBtn.onclick = function () {
    store.state.theme = (store.state.theme || 'light') === 'light' ? 'dark' : 'light';
    store.save();
    paintTheme();
  };

  render();
})();
