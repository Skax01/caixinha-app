/* app.js — estado do app, bloqueio/criptografia, eventos globais e inicialização. */
(function () {
  'use strict';
  /* Anti-clickjacking: o GitHub Pages não permite cabeçalhos HTTP (frame-ancestors), então bloqueamos dentro de iframes. */
  if (window.top !== window.self) { document.documentElement.textContent = ''; return; }

  var CX = window.CX, u = CX.u, ui = CX.ui, V = CX.vault, D = CX.drive, A = CX.app = CX.app || {}, ACT = CX.act;
  var $ = function (i) { return document.getElementById(i); };
  var TABS = [['cx', 'coin', 'Caixinha'], ['mb', 'users', 'Membros'], ['em', 'bank', 'Empréstimos', 'Emprést.'], ['pn', 'chart', 'Painel'], ['ca', 'cal', 'Agenda'], ['cf', 'set', 'Ajustes']];
  var t0 = new Date(), LSOK = true, hiddenAt = 0, idleT = null, AUTO_MS = 120000, IDLE_MS = 300000;
  A.S = null; A.tab = 'cx'; A.FL = 'todos'; A.EM = null; A.F1M = false; A.locked = false; A.CA = { y: t0.getFullYear(), m: t0.getMonth(), d: u.today() };

  /* ---------- tema ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('caixinha:theme', t); } catch (e) { /* sem acesso */ }
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t === 'dark' ? '#0e1215' : '#1b6b45');
    themeIcon();
  }
  function themeIcon() { var d = document.documentElement.getAttribute('data-theme') === 'dark', use = document.querySelector('#tg use'); if (use) use.setAttribute('href', d ? '#i-sun' : '#i-moon'); }
  ACT.theme = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };

  /* ---------- salvar / desenhar ---------- */
  function badge() {
    var e = $('sv'), t = $('svt'), w = LSOK && D.warn();
    e.className = 'status' + (!LSOK ? ' er' : w ? ' wn' : '');
    t.textContent = (LSOK ? 'Salvo' : 'Não salvou') + (LSOK ? D.badge() : '');
    e.setAttribute('aria-label', t.textContent + '. Abrir ajustes'); /* o nome acessível contém o texto visível (WCAG 2.5.3) */
    if (!LSOK && !badge.warned) { badge.warned = true; ui.announce('Não foi possível salvar os dados neste aparelho'); } else if (LSOK) badge.warned = false;
  }
  A.save = function () {
    if (!A.S) return;
    V.persist(A.S).then(function (ok) { LSOK = !!ok; badge(); });
    D.soon(); A.render();
  };
  A.render = function () {
    if (!A.S) return;
    var main = $('v'), nav = $('nav'), ae = document.activeElement, key = ae && (main.contains(ae) || nav.contains(ae)) ? ui.focusKey(ae) : null, hn = CX.hoje(A.S).length + CX.loan.watch(A.S).length;
    nav.innerHTML = '<ul>' + TABS.map(function (t) {
      return '<li><button type="button" data-a="tab" data-t="' + t[0] + '"' + (A.tab === t[0] || (A.tab === 'rf' && t[0] === 'cf') ? ' aria-current="page"' : '') + '>' + ui.icon(t[1]) + (t[3] ? '<span class="nl hs">' + t[2] + '</span><span class="ns">' + t[3] + '</span>' : '<span>' + t[2] + '</span>') + (t[0] === 'ca' && hn ? '<span class="badge" aria-label="' + hn + ' avisos">' + hn + '</span>' : '') + '</button></li>';
    }).join('') + '</ul>';
    main.innerHTML = CX.v[A.tab](); ui.dyn(main);
    $('dt').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('lk').hidden = !V.hasVault(); themeIcon(); badge();
    if (key) ui.focusBack(document, key);
  };
  A.driveChanged = function () {
    badge();
    var a = document.activeElement;
    if (A.tab === 'cf' && A.S && !document.querySelector('dialog[open],.lock') && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) A.render();
  };
  A.backup = function () { return A.S ? CX.backupText(A.S) : null; };
  /* data do último backup em arquivo (só a data, nada sensível) */
  A.markExport = function () { try { localStorage.setItem('caixinha:lastExport', String(Date.now())); } catch (e) { /* sem acesso */ } A.render(); };
  A.backupStale = function () {
    if (!A.S || (CX.drive && CX.drive.linkedNow() && !CX.drive.warn())) return false;
    var empty = !A.S.loans.length && !A.S.cxs.some(function (c) { return c.pess.length; }); if (empty) return false;
    var t = 0; try { t = +localStorage.getItem('caixinha:lastExport') || 0; } catch (e) { /* sem acesso */ }
    return !t || Date.now() - t > 10 * 864e5;
  };
  A.replace = async function (st) { st.adm = A.S ? A.S.adm : null; /* o PIN do administrador não vem de backup */ A.S = st; LSOK = !!(await V.persist(A.S)); A.render(); D.soon(); };

  /* ---------- PIN: bloqueio, criação, troca ---------- */
  function weakPin(p) { return /^(\d)\1+$/.test(p) || '0123456789'.indexOf(p) > -1 || '9876543210'.indexOf(p) > -1; }
  function checker() {
    return async function (p) {
      var w = V.waitLeft(); if (w) return 'Muitas tentativas. Aguarde ' + w + ' s.';
      if (await V.verify(p)) { V.passed(); return true; }
      V.failed(); var w2 = V.waitLeft(); return w2 ? 'PIN incorreto. Aguarde ' + w2 + ' s.' : 'PIN incorreto';
    };
  }
  A.confirmPin = async function (title) {
    if (!V.hasVault()) return true;
    return !!(await ui.pinPad({ title: title || 'Confirme com o PIN', sub: 'Digite seu PIN', len: V.pinLen(), cancel: true, check: checker() }));
  };
  async function pinCreate() {
    var p1 = await ui.pinPad({ title: 'Criar PIN', sub: 'Escolha 6 dígitos. Evite datas e sequências.', len: 6, cancel: true, check: async function (p) { return weakPin(p) ? 'Esse PIN é fácil de adivinhar. Escolha outro.' : true; } });
    if (!p1) return null;
    var p2 = await ui.pinPad({ title: 'Confirme o PIN', sub: 'Digite os mesmos 6 dígitos', len: 6, cancel: true, check: async function (p) { return p === p1 ? true : 'Não confere. Digite de novo'; } });
    return p2 ? p1 : null;
  }
  ACT.pinon = async function () {
    if (!V.supported) return ui.toast('O PIN só funciona em https');
    var pin = await pinCreate(); if (!pin) return;
    try { await V.enable(pin, A.S); ui.toast('PIN ativado. Seus dados agora estão criptografados.'); } catch (e) { ui.toast('Não foi possível ativar o PIN. Nada foi alterado.'); }
    A.render();
  };
  ACT.pinnew = async function () {
    if (!await A.confirmPin('PIN atual')) return;
    var pin = await pinCreate(); if (!pin) return;
    try { await V.enable(pin, A.S); ui.toast('PIN trocado'); } catch (e) { ui.toast('Não foi possível trocar o PIN.'); }
    A.render();
  };
  ACT.pinoff = async function () {
    if (!await A.confirmPin('Confirme o PIN')) return;
    if (!await ui.confirm({ title: 'Remover o PIN?', msg: 'Os dados deste aparelho deixam de ser criptografados e o app deixa de pedir PIN.', yes: 'Remover PIN', danger: true })) return;
    try { V.disable(A.S); ui.toast('PIN removido'); } catch (e) { ui.toast('Não foi possível remover o PIN.'); }
    A.render();
  };
  function forgot() {
    return ui.dialog({ title: 'Esqueci o PIN', msg: 'Por segurança o PIN não pode ser recuperado: ele é a chave que criptografa os dados deste aparelho.\n\nVocê pode apagar os dados deste aparelho e restaurar um backup (arquivo ou Google Drive) depois. Só continue se tiver um backup.', actions: [{ l: 'Apagar os dados deste aparelho', k: 'w', c: 'd', nv: true }, { l: 'Cancelar', k: null, c: 'g' }] })
      .then(function (r) { if (!r) return false; return ui.confirm({ title: 'Apagar tudo neste aparelho?', msg: 'Membros, empréstimos e o PIN serão apagados daqui. Os backups não são afetados.', yes: 'Apagar e reiniciar', danger: true, no: 'Voltar' }).then(function (ok) { if (ok) { V.wipe(); location.reload(); } return false; }); });
  }
  async function unlockFlow() {
    A.locked = true; document.body.classList.add('is-locked'); $('app').inert = true;
    var st = null, legacy = !V.hasVault() && !!V.legacy();
    var pin = await ui.pinPad({
      title: 'Caixinha', sub: 'Digite seu PIN', len: V.pinLen(), forgot: forgot,
      check: async function (p) {
        var w = V.waitLeft(); if (w) return 'Muitas tentativas. Aguarde ' + w + ' s.';
        try {
          if (legacy) { if (!await V.legacyCheck(p)) throw new Error('pin'); st = CX.sanitize(V.readPlain()); await V.enable(p, st); }
          else st = CX.sanitize(await V.unlock(p));
          V.passed(); return true;
        } catch (e) { V.failed(); var w2 = V.waitLeft(); return w2 ? 'PIN incorreto. Aguarde ' + w2 + ' s.' : 'PIN incorreto'; }
      }
    });
    if (!pin) return;
    A.S = st; A.locked = false; document.body.classList.remove('is-locked'); $('app').inert = false;
    A.render(); armIdle(); D.preload();
    if (legacy) ui.toast('Seus dados agora são criptografados. Troque por um PIN de 6 dígitos em Ajustes.');
  }
  A.lock = function () {
    if (!V.hasVault() || A.locked || !V.unlocked()) return;
    V.lock(); A.S = null; clearTimeout(idleT);
    if (A.tab === 'rf') { A.tab = 'cf'; A.RF = null; } /* a área de rifas pede o PIN de novo */
    document.querySelectorAll('dialog').forEach(function (d) { try { d.close(); } catch (e) { /* já fechado */ } d.remove(); });
    document.querySelectorAll('.lock').forEach(function (l) { l.remove(); });
    $('v').innerHTML = ''; $('nav').innerHTML = ''; $('toasts').innerHTML = ''; $('printroot').innerHTML = '';
    unlockFlow();
  };
  ACT.lock = function () { A.lock(); };
  function armIdle() { clearTimeout(idleT); if (V.hasVault()) idleT = setTimeout(A.lock, IDLE_MS); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { if (A.S) armIdle(); }, { passive: true, capture: true }); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); setTimeout(function () { if (document.visibilityState === 'hidden') A.lock(); }, AUTO_MS); }
    else if (hiddenAt && Date.now() - hiddenAt > AUTO_MS) A.lock();
  });

  /* ---------- backup: exportar / importar ---------- */
  ACT.exp = async function () {
    if (!await A.confirmPin('Confirme para exportar')) return;
    ui.download('caixinha-' + u.today() + '.json', A.backup()); A.markExport(); ui.toast('Backup exportado');
  };
  ACT.expenc = async function () {
    if (!V.supported) return ui.toast('A criptografia só funciona em https');
    if (!await A.confirmPin('Confirme para exportar')) return;
    var r = await ui.dialog({ title: 'Exportar com senha', msg: 'O arquivo só abre com esta senha. Guarde-a: sem ela não há como recuperar o backup.', fields: [{ l: 'Senha (mínimo 8 caracteres)', k: 'a', t: 'password', max: 100, cap: 'none' }, { l: 'Repita a senha', k: 'b', t: 'password', max: 100, cap: 'none' }], actions: [{ l: 'Exportar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: function (v) { return v.a.length < 8 ? 'Use pelo menos 8 caracteres.' : v.a !== v.b ? 'As senhas não conferem.' : ''; } });
    if (!r) return;
    ui.toast('Criptografando…');
    try { ui.download('caixinha-' + u.today() + '.cifrado.json', await V.encryptText(A.backup(), r.v.a)); A.markExport(); ui.toast('Backup cifrado exportado'); } catch (e) { ui.toast('Não foi possível criptografar.'); }
  };
  ACT.imp = async function () { if (!await A.confirmPin('Confirme para importar')) return; $('fi').click(); };
  $('fi').onchange = function (e) {
    var f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 5e6) return ui.toast('Arquivo grande demais para ser um backup.');
    var rd = new FileReader();
    rd.onload = async function () {
      try {
        var txt = String(rd.result);
        if (V.isEncrypted(txt)) {
          var p = await ui.dialog({ title: 'Backup com senha', fields: [{ l: 'Senha do arquivo', k: 'a', t: 'password', max: 100, cap: 'none' }], actions: [{ l: 'Abrir', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: function (v) { return v.a ? '' : 'Digite a senha.'; } });
          if (!p) return;
          try { txt = await V.decryptText(txt, p.v.a); } catch (x) { return ui.toast('Senha incorreta ou arquivo danificado.'); }
        }
        var st = CX.parseBackup(txt);
        if (await ui.confirm({ title: 'Importar backup', msg: 'Isto substitui os dados atuais deste aparelho por ' + st.cxs.reduce(function (s, c) { return s + c.pess.length; }, 0) + ' membros e ' + st.loans.length + ' empréstimos do arquivo.', yes: 'Importar', danger: true })) { await A.replace(st); ui.toast('Backup importado'); }
      } catch (x) { ui.toast('Arquivo inválido. Nada foi alterado.'); }
    };
    rd.readAsText(f);
  };

  /* ---------- Google Drive ---------- */
  ACT.gsave = function () { var i = $('gid'); if (i && D.saveId(i.value)) A.render(); };
  ACT.gsync = function () { D.sync(true); };
  ACT.gres = async function () { if (!await A.confirmPin('Confirme para restaurar')) return; D.restore(); };
  ACT.gout = async function () { if (!await A.confirmPin('Confirme para desconectar')) return; D.disconnect(); };

  /* ---------- navegação e eventos ---------- */
  ACT.tab = function (b) { A.tab = b.getAttribute('data-t'); A.render(); scrollTo(0, 0); var m = $('v'); m.focus({ preventScroll: true }); };
  ACT['goto-cf'] = function () { A.tab = 'cf'; A.render(); scrollTo(0, 0); };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b || b.closest('dialog,.lock') || A.locked) return;
    var f = ACT[b.getAttribute('data-a')]; if (!f) return;
    try { var r = f(b, e); if (r && r.catch) r.catch(fail); } catch (x) { fail(x); }
  });
  function fail(x) { if (window.console) console.error(x); ui.toast('Algo deu errado. Tente de novo.'); }
  window.addEventListener('unhandledrejection', function (e) { fail(e.reason); });
  document.addEventListener('input', CX.v.nfInput); document.addEventListener('change', CX.v.nfInput); document.addEventListener('input', CX.v.mbInput);

  /* ---------- inicialização ---------- */
  function boot() {
    themeIcon();
    if (V.hasVault() || V.legacy()) {
      if (!V.supported) { $('v').innerHTML = '<div class="card"><h2>Abra pelo endereço seguro</h2><p class="lead mb0">Seus dados estão protegidos por PIN e só podem ser abertos em https (ou localhost).</p></div>'; return; }
      return unlockFlow();
    }
    var raw = V.readPlain();
    A.S = CX.sanitize(raw);
    if (raw && !raw.v) { try { localStorage.setItem('caixinha:antes-da-v2', JSON.stringify(raw)); } catch (e) { /* sem espaço */ } }
    V.persist(A.S).then(function (ok) { LSOK = !!ok; badge(); });
    A.render(); armIdle(); D.preload();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  }
  boot();
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () { /* sem offline */ });
})();
