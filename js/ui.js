/* ui.js — componentes de interface: ícones, avisos, diálogos (<dialog> nativo), teclado de PIN. */
(function () {
  'use strict';
  var CX = window.CX, esc = CX.u.esc, ui = CX.ui = {};
  var seq = 0;

  ui.icon = function (n, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  ui.announce = function (t) { var e = document.getElementById('live'); if (e) { e.textContent = ''; setTimeout(function () { e.textContent = t; }, 30); } };

  /* ---------- avisos ---------- */
  var toastT;
  ui.toast = function (text, opt) {
    opt = opt || {};
    var box = document.getElementById('toasts'), old = box.querySelector('.toast');
    if (old) old.remove();
    var e = document.createElement('div'); e.className = 'toast';
    var s = document.createElement('span'); s.textContent = text; e.appendChild(s);
    if (opt.undo) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Desfazer';
      b.onclick = function () { e.remove(); opt.undo(); }; e.appendChild(b);
    }
    box.appendChild(e); ui.raiseToasts(); ui.announce(text);
    /* o aviso com "Desfazer" dura mais e fica parado enquanto o mouse ou o foco estão nele (WCAG 2.2.1) */
    var ms = opt.undo ? 12000 : 3200;
    function arm() { clearTimeout(toastT); toastT = setTimeout(function () { e.remove(); if (!box.children.length) { try { box.hidePopover(); } catch { /* sem popover */ } } }, ms); }
    if (opt.undo) { e.addEventListener('mouseenter', function () { clearTimeout(toastT); }); e.addEventListener('focusin', function () { clearTimeout(toastT); }); e.addEventListener('mouseleave', arm); e.addEventListener('focusout', arm); }
    arm();
  };
  /* Os avisos ficam numa camada acima dos diálogos (popover); reabrir leva o aviso ao topo de novo. */
  ui.raiseToasts = function () {
    var box = document.getElementById('toasts'); if (!box || !box.children.length || !box.showPopover) return;
    try { if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); } catch { /* sem popover */ }
  };

  /* ---------- diálogos ---------- */
  function make(wide) {
    var d = document.createElement('dialog'), id = 'dlg' + (++seq);
    d.innerHTML = '<div class="sheet' + (wide ? ' wide' : '') + '"></div>';
    d.setAttribute('aria-labelledby', id + 't'); d.dataset.tid = id + 't';
    document.body.appendChild(d); return d;
  }
  function field(f, i) {
    var id = 'f' + seq + '_' + i, h = f.h ? '<span class="hint">' + esc(f.h) + '</span>' : '', ctl;
    if (f.o) ctl = '<select id="' + id + '" data-k="' + esc(f.k) + '">' + f.o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(f.v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    else if (f.area) ctl = '<textarea id="' + id + '" data-k="' + esc(f.k) + '" rows="' + (f.rows || 5) + '" maxlength="' + (f.max || 1500) + '">' + esc(f.v) + '</textarea>';
    else ctl = '<input id="' + id + '" data-k="' + esc(f.k) + '" type="' + esc(f.t || 'text') + '" value="' + esc(f.v == null ? '' : f.v) + '"' + (f.m ? ' inputmode="' + esc(f.m) + '"' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + (f.max ? ' maxlength="' + f.max + '"' : ' maxlength="80"') + ' autocomplete="off" autocapitalize="' + (f.cap || 'sentences') + '" enterkeyhint="' + (f.eh || 'done') + '">';
    return '<label for="' + id + '">' + esc(f.l) + '</label>' + ctl + h;
  }
  function values(root) {
    var v = {}; root.querySelectorAll('[data-k]').forEach(function (x) { v[x.getAttribute('data-k')] = x.value.trim(); }); return v;
  }

  /* ui.dialog({title,msg,fields,actions,check}) → Promise<{act,v}|null>
     actions: {l,k,c} — c: g (neutro) | d (perigo) | ok | t (texto); k:null = cancelar; nv:true = não valida. */
  ui.dialog = function (o) {
    return new Promise(function (resolve) {
      var d = make(o.wide), sh = d.firstChild, fields = o.fields || [], acts = o.actions || [], dirty = false, done = false;
      sh.innerHTML = '<form novalidate><h3 id="' + d.dataset.tid + '">' + esc(o.title) + '</h3>' + (o.msg ? '<p class="msg">' + esc(o.msg) + '</p>' : '') +
        fields.map(field).join('') + '<div class="field-err" role="alert"></div><div class="acts' + (o.inline ? ' inline' : '') + '">' +
        acts.map(function (a, i) { return '<button type="' + (i === acts.findIndex(function (x) { return !x.c && !x.sub; }) ? 'submit' : 'button') + '" class="btn ' + (a.c || '') + '" data-i="' + i + '">' + esc(a.l) + '</button>'; }).join('') + '</div></form>';
      var form = sh.firstChild, err = sh.querySelector('.field-err');
      function finish(r) { if (done) return; done = true; d.close(); d.remove(); resolve(r); }
      function run(a) {
        if (a.k == null) return finish(null);
        var v = values(form), m = !a.nv && o.check ? o.check(v, a.k) : '';
        if (m) { err.textContent = m; var bad = form.querySelector('[data-bad]') || form.querySelector('input,select,textarea'); if (bad) bad.focus(); return; }
        finish({ act: a.k, v: v });
      }
      form.addEventListener('submit', function (e) { e.preventDefault(); var p = acts.find(function (a) { return !a.c && !a.sub; }) || acts[0]; if (p) run(p); });
      form.addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (b && b.type === 'button') run(acts[+b.getAttribute('data-i')]); });
      form.addEventListener('input', function () { dirty = true; err.textContent = ''; });
      d.addEventListener('cancel', function (e) { e.preventDefault(); finish(null); });
      d.addEventListener('click', function (e) { if (e.target === d && !dirty) finish(null); });
      d.showModal(); ui.raiseToasts();
      var first = form.querySelector('input,select,textarea');
      if (first && first.type !== 'date') first.focus(); else {
        /* em confirmações perigosas o foco inicial vai para "Cancelar", nunca para "Excluir" */
        var pb = form.querySelector('.btn.g') && form.querySelector('.btn.d') ? form.querySelector('.btn.g') : form.querySelector('.btn'); if (pb) pb.focus();
      }
    });
  };
  ui.confirm = function (o) {
    return ui.dialog({ title: o.title, msg: o.msg, actions: [{ l: o.yes || 'Confirmar', k: 'y', c: o.danger ? 'd' : '', nv: true }, { l: o.no || 'Cancelar', k: null, c: 'g' }] }).then(function (r) { return !!r; });
  };
  ui.menu = function (title, msg, items) {
    return ui.dialog({ title: title, msg: msg, actions: items.map(function (x) { return { l: x.l, k: x.k, c: x.c || 'g', nv: true }; }).concat([{ l: 'Fechar', k: null, c: 't' }]) });
  };

  /* Painel com redesenho (relatório, detalhes). api.draw() refaz o conteúdo; api.close() fecha. */
  ui.panel = function (o) {
    var d = make(o.wide), sh = d.firstChild, api = {};
    function draw() {
      var a = document.activeElement, key = a && a.dataset && a.dataset.f ? a.dataset.f : null;
      sh.innerHTML = '<h3 id="' + d.dataset.tid + '">' + esc(o.title) + '</h3>' + o.render(api);
      if (key) { var n = sh.querySelector('[data-f="' + key + '"]'); if (n) n.focus(); }
    }
    api.draw = draw; api.close = function () { d.close(); d.remove(); if (o.onClose) o.onClose(); };
    sh.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) o.onAct(b.getAttribute('data-p'), b, api); });
    sh.addEventListener('change', function (e) { if (o.onChange) o.onChange(e.target, api); });
    sh.addEventListener('input', function (e) { if (o.onInput) o.onInput(e.target, api); });
    d.addEventListener('cancel', function (e) { e.preventDefault(); api.close(); });
    d.addEventListener('click', function (e) { if (e.target === d) api.close(); });
    draw(); d.showModal(); ui.raiseToasts(); return api;
  };

  /* ---------- utilidades de arquivo / dom ---------- */
  ui.download = function (name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  };
  ui.openLink = function (url) { var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); };
  ui.dyn = function (root) {
    root.querySelectorAll('[data-w]').forEach(function (e) { e.style.width = Math.max(0, Math.min(100, +e.getAttribute('data-w') || 0)) + '%'; });
    root.querySelectorAll('[data-h]').forEach(function (e) { e.style.height = Math.max(0, Math.min(100, +e.getAttribute('data-h') || 0)) + '%'; });
  };
  ui.focusKey = function (el) {
    if (!el || !el.getAttribute) return null;
    var k = {}; ['data-a', 'data-id', 'data-i', 'data-k', 'data-t', 'data-d', 'data-c', 'data-p'].forEach(function (n) { var v = el.getAttribute(n); if (v != null) k[n] = v; });
    return Object.keys(k).length ? k : null;
  };
  ui.focusBack = function (root, k) {
    if (!k) return;
    var sel = Object.keys(k).map(function (n) { return '[' + n + '="' + String(k[n]).replace(/["\\]/g, '') + '"]'; }).join('');
    var e = root.querySelector(sel); if (e) e.focus({ preventScroll: true });
  };

  /* ---------- teclado numérico de PIN ----------
     o: {title, sub, len, cancel, forgot(), check(pin)→true|mensagem} → Promise<pin|null|'forgot'> */
  ui.pinPad = function (o) {
    return new Promise(function (done) {
      var el = document.createElement('div'), v = '', busy = false, len = o.len || 6, keys = '';
      el.className = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', o.title);
      for (var k = 1; k <= 9; k++) keys += '<button type="button" data-k="' + k + '" aria-label="' + k + '">' + k + '</button>';
      keys += '<button type="button" class="z" tabindex="-1" aria-hidden="true"></button><button type="button" data-k="0" aria-label="0">0</button><button type="button" data-k="b" aria-label="Apagar">⌫</button>';
      var dots = ''; for (var i = 0; i < len; i++) dots += '<i></i>';
      el.innerHTML = '<h2>' + esc(o.title) + '</h2><p class="lm" role="status">' + esc(o.sub || '') + '</p><div class="dots" aria-hidden="true">' + dots + '</div><div class="kp">' + keys + '</div>' +
        (o.cancel ? '<button type="button" class="lk" data-x="c">Cancelar</button>' : '') + (o.forgot ? '<button type="button" class="lk" data-x="f">Esqueci o PIN</button>' : '');
      var msg = el.querySelector('.lm'), dotsEl = el.querySelector('.dots');
      function draw() { el.querySelectorAll('.dots i').forEach(function (n, j) { n.classList.toggle('on', j < v.length); }); }
      function close(r) { document.removeEventListener('keydown', kd, true); el.remove(); done(r); }
      async function submit() {
        busy = true; msg.className = 'lm'; msg.textContent = 'Verificando…';
        var r = o.check ? await o.check(v) : true; busy = false;
        if (r === true) return close(v);
        v = ''; draw(); dotsEl.classList.remove('err'); void dotsEl.offsetWidth; dotsEl.classList.add('err');
        msg.className = 'lm er'; msg.textContent = typeof r === 'string' ? r : 'PIN incorreto';
      }
      function press(k) { if (busy) return; if (k === 'b') v = v.slice(0, -1); else if (v.length < len) v += k; draw(); if (v.length === len) submit(); }
      function kd(e) {
        var all = document.querySelectorAll('.lock'); if (all[all.length - 1] !== el) return;
        if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); press('b'); }
        else if (e.key === 'Escape' && o.cancel) { e.preventDefault(); close(null); }
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.k) press(b.dataset.k);
        else if (b.dataset.x === 'c') close(null);
        else if (b.dataset.x === 'f' && o.forgot) Promise.resolve(o.forgot()).then(function (r) { if (r) close('forgot'); });
      });
      document.addEventListener('keydown', kd, true); document.body.appendChild(el);
      var first = el.querySelector('[data-k="1"]'); if (first) first.focus();
    });
  };
})();
