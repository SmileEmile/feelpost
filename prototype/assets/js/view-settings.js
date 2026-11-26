/* feelpost prototype — application settings */
(function () {
  const FP = window.FP;
  const util = FP.util;
  const ui = FP.ui;
  const esc = util.esc;

  function store() { return FP.store; }

  function sidebar() {
    return '<div class="sidebar-head"><h2>设置</h2></div>' +
      '<div class="env-list">' +
      '<button class="env-item active" data-set-tab="appearance">' +
      '<div class="meta"><span class="name">外观</span><span class="url">浅色 / 深色主题</span></div></button>' +
      '<button class="env-item" data-set-tab="data">' +
      '<div class="meta"><span class="name">数据</span><span class="url">数据目录与备份</span></div></button>' +
      '<button class="env-item" data-set-tab="diag">' +
      '<div class="meta"><span class="name">诊断</span><span class="url">日志与版本</span></div></button>' +
      '</div>' +
      '<div class="sidebar-foot">' + ui.icon('info', 13) + '<span>离线运行，无账号体系</span></div>';
  }

  function main() {
    const s = store().state;
    const theme = s.theme || 'light';
    return '<div class="section-head">' +
      '<div><h1>设置</h1><p>应用级偏好，不随项目切换</p></div>' +
      '</div>' +
      '<div class="section-body">' +
      '<div class="card" id="set-appearance"><div class="card-head">' + ui.icon('sun', 15) + ' 外观</div><div class="card-body">' +
      '<div class="field"><label>主题</label>' +
      '<div class="seg">' +
      '<button data-set-theme="light" class="' + (theme === 'light' ? 'on' : '') + '">浅色</button>' +
      '<button data-set-theme="dark" class="' + (theme === 'dark' ? 'on' : '') + '">深色</button>' +
      '</div>' +
      '<span class="hint">主题选择保存在本机偏好中，重启后保留。</span>' +
      '</div></div></div>' +

      '<div class="card" id="set-data"><div class="card-head">' + ui.icon('folder', 15) + ' 数据</div><div class="card-body">' +
      '<div class="field"><label for="set-datadir">数据目录</label>' +
      '<div class="input-group"><input class="input mono" id="set-datadir" value="' + esc(s.dataDir || '~/Documents/feelpost') + '" readonly>' +
      '<button class="btn" data-open-datadir>' + ui.icon('folder', 14) + ' 打开目录</button></div>' +
      '<span class="hint">整目录可直接拷贝备份；v1 不提供“更换目录”（后置能力）。</span></div>' +
      '<div class="kv-note mt-12">' + ui.icon('lock', 14) + '凭据明文保存在数据目录，拷贝/分享备份时请注意。</div>' +
      '</div></div>' +

      '<div class="card" id="set-diag"><div class="card-head">' + ui.icon('settings', 15) + ' 诊断</div><div class="card-body">' +
      '<div class="env-flag"><label class="switch"><input type="checkbox" id="set-debug"' + (s.debugLogging ? ' checked' : '') + '><span class="track"></span><span>调试日志（记录完整请求/响应，仅排查问题）</span></label></div>' +
      '<p class="small-note mt-8">默认脱敏：只记录路径、状态码、耗时与错误，不记录 header/cookie/body。</p>' +
      '<div class="hr"></div>' +
      '<div class="flex"><span class="small-note">版本</span><span class="chip muted">原型 v0.1</span>' +
      '<span class="spacer"></span><button class="btn btn-sm" data-open-logdir>打开日志目录</button></div>' +
      '</div></div>' +

      '<div class="card"><div class="card-head">' + ui.icon('info', 15) + ' 关于</div><div class="card-body">' +
      '<p class="small-note">FeelPost 是本地接口契约中枢：从 Java 源码自动产出契约，本机调试，导出 md 给 AI 前端。</p>' +
      '<p class="small-note mt-8">离线优先 · 单机单用户 · Windows + macOS</p>' +
      '</div></div>' +
      '</div>';
  }

  function bind(sEl, mEl) {
    const app = FP.app;
    mEl.addEventListener('click', function (e) {
      const th = e.target.closest('[data-set-theme]');
      if (th) {
        store().state.theme = th.dataset.setTheme;
        store().save();
        app.render();
        ui.toast('已切换到' + (th.dataset.setTheme === 'dark' ? '深色' : '浅色') + '主题');
        return;
      }
      if (e.target.closest('[data-open-datadir]')) {
        ui.toast('原型演示：真实版本会打开 ' + store().state.dataDir, 'info');
        return;
      }
      if (e.target.closest('[data-open-logdir]')) {
        ui.toast('原型演示：真实版本会打开日志目录', 'info');
      }
    });
    mEl.addEventListener('change', function (e) {
      if (e.target.id === 'set-debug') {
        store().state.debugLogging = e.target.checked;
        store().save();
        ui.toast(e.target.checked ? '调试日志已开启（仍会脱敏凭据）' : '调试日志已关闭');
      }
    });
    sEl.addEventListener('click', function (e) {
      const tab = e.target.closest('[data-set-tab]');
      if (!tab) return;
      sEl.querySelectorAll('[data-set-tab]').forEach(function (b) { b.classList.toggle('active', b === tab); });
      const target = mEl.querySelector('#set-' + tab.dataset.setTab);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  FP.views = FP.views || {};
  FP.views.settings = { sidebar: sidebar, main: main, bind: bind };
})();
