/* feelpost prototype — UI primitives: icons, toast, modal, chips */
(function () {
  const FP = (window.FP = window.FP || {});

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronUp: '<path d="M18 15l-6-6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    scan: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    braces: '<path d="M8 3a3 3 0 0 0-3 3v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a3 3 0 0 0 3 3"/><path d="M16 3a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a3 3 0 0 1-3 3"/>',
    cases: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    play: '<path d="M6 4l14 8-14 8V4z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>'
  };

  function icon(name, size) {
    const body = ICONS[name] || ICONS.info;
    return '<svg class="icon" width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  function root(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(message, type) {
    const host = root('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.innerHTML = '<span class="toast-ico">' + icon(type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check', 15) + '</span>' +
      '<span class="toast-msg">' + FP.util.esc(message) + '</span>';
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });
    setTimeout(function () {
      el.classList.remove('in');
      setTimeout(function () { el.remove(); }, 220);
    }, 2600);
  }

  function modal(opts) {
    const host = root('modal-root');
    const layer = document.createElement('div');
    layer.className = 'modal-layer';
    layer.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + FP.util.esc(opts.title || '') + '">' +
      '<header class="modal-head">' +
      '<div><h3>' + FP.util.esc(opts.title || '') + '</h3>' +
      (opts.subtitle ? '<p class="modal-sub">' + FP.util.esc(opts.subtitle) + '</p>' : '') +
      '</div>' +
      '<button class="icon-btn" data-close aria-label="关闭">' + icon('x', 18) + '</button>' +
      '</header>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<footer class="modal-foot">' + opts.footer + '</footer>' : '') +
      '</div>';
    host.appendChild(layer);
    requestAnimationFrame(function () { layer.classList.add('in'); });

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      layer.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { layer.remove(); }, 180);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    layer.addEventListener('click', function (e) {
      if (e.target === layer && opts.dismissible !== false) close();
      if (e.target.closest('[data-close]')) close();
    });
    if (opts.onMount) opts.onMount(layer.querySelector('.modal'), close);
    return { el: layer.querySelector('.modal'), layer: layer, close: close };
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      const m = modal({
        title: opts.title || '确认操作',
        body: '<p class="confirm-text">' + FP.util.esc(opts.text || '') + '</p>',
        footer: '<button class="btn" data-cancel>取消</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + FP.util.esc(opts.okText || '确认') + '</button>',
        onMount: function (el, close) {
          el.querySelector('[data-ok]').onclick = function () { close(); resolve(true); };
          el.querySelector('[data-cancel]').onclick = function () { close(); resolve(false); };
        },
        onClose: function () { resolve(false); }
      });
      m.el.addEventListener('click', function () {});
    });
  }

  function methodBadge(method) {
    return '<span class="method m-' + FP.util.methodClass(method) + '">' + FP.util.esc(method) + '</span>';
  }

  function statusChip(status) {
    const s = FP.STATUS[status] || FP.STATUS.registered;
    return '<span class="chip ' + s.cls + '">' + s.label + '</span>';
  }

  function parseChip(parse) {
    const s = FP.PARSE[parse] || FP.PARSE.full;
    return '<span class="chip ' + s.cls + ' soft">' + s.label + '</span>';
  }

  function empty(opts) {
    return '<div class="empty">' +
      '<div class="empty-ico">' + icon(opts.icon || 'folder', 26) + '</div>' +
      '<h4>' + FP.util.esc(opts.title || '暂无内容') + '</h4>' +
      (opts.desc ? '<p>' + FP.util.esc(opts.desc) + '</p>' : '') +
      (opts.action || '') +
      '</div>';
  }

  FP.ui = {
    icon: icon,
    toast: toast,
    modal: modal,
    confirm: confirm,
    methodBadge: methodBadge,
    statusChip: statusChip,
    parseChip: parseChip,
    empty: empty
  };
})();
