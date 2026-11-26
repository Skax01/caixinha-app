/* rifa.js — área de administrador: rifas.
   Fica fora das abas principais (entrada discreta em Ajustes) e pede o PIN quando houver. Toda a lógica de
   dados/sorteio está em core.js (CX.rifa); aqui só há telas e ações. Nada de HTML/estilo inline (CSP estrita). */
(function () {
  'use strict';
  var CX = window.CX, u = CX.u, esc = u.esc, brl = u.brl, fd = u.fd, num = u.num, ui = CX.ui, V = CX.vault, R = CX.rifa, A = CX.app, ic = ui.icon, view = CX.v, ACT = CX.act;
  function S() { return A.S; }
  function find(id) { return S().rifas.find(function (r) { return r.id === id; }); }
  function cxOf(r) { return S().cxs.find(function (c) { return c.id === r.cx; }) || null; }
  function alive(r) { var m = Object.create(null), c = cxOf(r); if (c) c.pess.forEach(function (p) { m[p.id] = 1; }); return m; }
  var SEL = null; /* seleção em lote na grade: {id, set:{n:true}} */
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  /* Acesso do administrador: o PIN próprio das rifas (se definido); senão o PIN do app (se houver); senão livre. */
  function adminGate(title) {
    var s = S(); if (!s.adm) return A.confirmPin(title || 'Área de administrador');
    return ui.pinPad({ title: title || 'Área de administrador', sub: 'Digite o PIN do administrador', len: 6, cancel: true, check: async function (p) {
      var w = V.waitLeft(); if (w) return 'Muitas tentativas. Aguarde ' + w + ' s.';
      if (await V.adminCheck(p, s.adm)) { V.passed(); return true; }
      V.failed(); var w2 = V.waitLeft(); return w2 ? 'PIN incorreto. Aguarde ' + w2 + ' s.' : 'PIN incorreto';
    } }).then(Boolean);
  }
  function guard(fn) { return adminGate().then(function (ok) { if (ok) return fn(); }); }
  function weakPin(p) { return /^(\d)\1+$/.test(p) || '0123456789'.indexOf(p) > -1 || '9876543210'.indexOf(p) > -1; }
  ACT['adm-new'] = async function () {
    if (!V.supported) return ui.toast('O PIN só funciona em https ou localhost.');
    if (S().adm && !(await adminGate('PIN atual'))) return;
    var p1 = await ui.pinPad({ title: 'PIN do administrador', sub: 'Escolha 6 dígitos', len: 6, cancel: true, check: async function (p) { return weakPin(p) ? 'Esse PIN é fácil de adivinhar. Escolha outro.' : true; } }); if (!p1) return;
    var p2 = await ui.pinPad({ title: 'Confirme o PIN', sub: 'Digite os mesmos 6 dígitos', len: 6, cancel: true, check: async function (p) { return p === p1 ? true : 'Não confere. Digite de novo'; } }); if (!p2) return;
    S().adm = await V.adminHash(p1); A.save(); ui.toast('PIN do administrador definido');
  };
  ACT['adm-off'] = async function () {
    if (!(await adminGate('PIN do administrador'))) return;
    if (!await ui.confirm({ title: 'Remover o PIN do administrador?', msg: 'A área de rifas volta a usar só o PIN do app (se houver).', yes: 'Remover', danger: true })) return;
    S().adm = null; A.save(); ui.toast('PIN do administrador removido');
  };
  function tag(r) {
    return r.st === 's' ? '<span class="tag">🏆 Sorteada</span>' : r.st === 'e' ? '<span class="tag mu">Encerrada</span>' : R.locked(r) ? '<span class="tag wn">Sorteio em andamento</span>' : '<span class="tag">Ativa</span>';
  }
  function ord(n) { return n + 'º'; }

  /* ---------- entrada discreta em Ajustes ---------- */
  view.rfEntry = function () {
    var n = S().rifas.filter(function (r) { return r.st === 'a'; }).length;
    return '<div class="card"><h2>Administração</h2><div class="set-row"><div><div class="t">Rifas</div><div class="d">Área restrita do administrador' + (n ? ' · ' + plural(n, 'ativa', 'ativas') : '') + (S().adm || V.hasVault() ? '. Pede o PIN.' : '.') + '</div></div><button class="btn g" type="button" data-a="rifas">Abrir</button></div>' +
      '<div class="set-row"><div><div class="t">PIN do administrador</div><div class="d">' + (S().adm ? 'Ativo: só quem sabe o PIN abre as rifas.' : 'Defina um PIN de 6 dígitos só para as rifas.') + '</div></div><div class="row">' + (S().adm ? '<button class="btn g sm" type="button" data-a="adm-new">Trocar</button><button class="btn d sm" type="button" data-a="adm-off">Remover</button>' : '<button class="btn sm" type="button" data-a="adm-new">Definir PIN</button>') + '</div></div></div>';
  };
  ACT.rifas = function () { return guard(function () { A.tab = 'rf'; A.RF = null; A.render(); scrollTo(0, 0); }); };
  ACT['rf-back'] = function () { SEL = null; A.tab = 'cf'; A.RF = null; A.render(); scrollTo(0, 0); };
  ACT['rf-list'] = function () { SEL = null; A.RF = null; A.render(); scrollTo(0, 0); };
  ACT['rf-open'] = function (b) { A.RF = b.getAttribute('data-id'); A.render(); scrollTo(0, 0); };

  /* ---------- lista ---------- */
  function listView() {
    var rs = S().rifas.slice().reverse(), h = '<div class="row sp"><button class="btn t sm" type="button" data-a="rf-back">' + ic('left', 's') + 'Ajustes</button><button class="btn sm" type="button" data-a="rf-new">' + ic('plus', 's') + 'Nova rifa</button></div><h2 class="fd rf-title">Rifas</h2>';
    if (!V.hasVault() && !S().adm) h += '<div class="alert wn">' + ic('alert') + '<span>Sem PIN, qualquer pessoa com este aparelho abre esta área. Defina o PIN do administrador em Ajustes → Administração.</span></div>';
    if (!rs.length) return h + '<div class="card empty"><div class="fd">Nenhuma rifa ainda</div><p>Crie uma rifa e registre as vendas de cada membro em poucos toques.</p><button class="btn" type="button" data-a="rf-new">' + ic('plus', 's') + 'Criar a primeira rifa</button></div>';
    return h + rs.map(function (r) {
      var st = R.stats(r), c = cxOf(r), w = r.ganh[0];
      return '<div class="card"><div class="row sp"><div class="grow"><b class="wrap-any">' + esc(r.nome) + '</b><div class="note">' + esc(c ? c.nome : 'Sem caixinha') + ' · ' + fd(r.data) + ' · ' + brl(r.valor) + ' por número</div></div>' + tag(r) + '</div>' +
        '<div class="bar" role="img" aria-label="' + st.vendidos + ' de ' + st.total + ' números vendidos"><i data-w="' + (st.total ? st.vendidos / st.total * 100 : 0) + '"></i></div><div class="rf-chips2">' + r.prem.map(function (p, i) { return '<span class="rf-chip">' + ord(i + 1) + ' ' + esc(p) + '</span>'; }).join('') + '</div><p class="note">' + st.vendidos + '/' + st.total + ' números vendidos · ' + brl(st.arrecadado) + ' arrecadado</p>' +
        (w ? '<p class="note">🏆 ' + esc(ord(w.pos) + ': nº ' + w.n + ' · ' + w.nm) + (r.ganh.length > 1 ? ' e mais ' + (r.ganh.length - 1) : '') + '</p>' : '') +
        '<button class="btn g sm sm-top" type="button" data-a="rf-open" data-id="' + esc(r.id) + '">Abrir</button></div>';
    }).join('');
  }

  /* ---------- detalhe ---------- */
  function detailView(r) {
    var st = R.stats(r), sold = R.sold(r), won = Object.create(null), al = alive(r), locked = R.locked(r);
    r.ganh.forEach(function (g) { won[g.n] = g; });
    if (SEL && SEL.id !== r.id) SEL = null; if (locked) SEL = null;
    var grid = R.nums(r).map(function (n) {
      var v = sold[n], cl = won[n] ? 'won' : v ? 'sold' : 'free';
      if (SEL && cl === 'free' && SEL.set[n]) cl += ' sel';
      return '<button type="button" class="rf-n ' + cl + '"' + (SEL && !v ? ' aria-pressed="' + (SEL.set[n] ? 'true' : 'false') + '"' : '') + ' data-a="rf-n" data-n="' + n + '" aria-label="Número ' + n + ': ' + (won[n] ? 'premiado, ' + esc(v.nm) : v ? esc(v.nm) : 'livre') + '">' + n + '</button>';
    }).join('');
    var holders = R.byHolder(r, al).sort(function (a, b) { return a.nums[0] - b.nums[0]; }).map(function (x) {
      return '<div class="pe"><div class="grow"><div class="nm wrap-any">' + esc(x.nm) + (x.ext ? ' <span class="tag mu">externo</span>' : '') + '</div><div class="sb rf-chips">' + esc(x.nums.join(', ')) + '</div></div><div class="tr"><b>' + x.nums.length + '</b><div class="note">' + brl(x.nums.length * r.valor) + '</div></div></div>';
    }).join('');
    var prem = r.prem.map(function (p, i) {
      var g = r.ganh.find(function (x) { return x.pos === i + 1; });
      return '<div class="rf-win"><span class="rf-pos">' + ord(i + 1) + '</span><span class="grow wrap-any">' + esc(p) + '</span>' + (g ? '<span class="tag">nº ' + g.n + ' · ' + esc(g.nm) + '</span>' : '<span class="note">a sortear</span>') + '</div>';
    }).join('');
    var sortLabel = r.st === 's' ? 'Ver ganhadores' : r.ganh.length ? 'Continuar sorteio' : 'Sortear';
    return '<div class="row sp"><button class="btn t sm" type="button" data-a="rf-list">' + ic('left', 's') + 'Rifas</button><button class="btn g sm" type="button" data-a="rf-more">Opções</button></div>' +
      '<div class="row sp rf-head"><h2 class="fd rf-title wrap-any grow">' + esc(r.nome) + '</h2>' + tag(r) + '</div>' +
      '<div class="rf-chips2">' + r.prem.map(function (p, i) { return '<span class="rf-chip">' + ord(i + 1) + ' ' + esc(p) + '</span>'; }).join('') + '</div>' +
      '<section class="hero"><div class="k">Arrecadado</div><span class="v">' + brl(st.arrecadado) + '</span><div class="s">' + '<b>' + st.vendidos + '/' + st.total + '</b> números vendidos · ' + brl(r.valor) + ' cada · ' + fd(r.data) + '</div><div class="bar" role="img" aria-label="' + st.vendidos + ' de ' + st.total + ' números vendidos"><i data-w="' + (st.total ? st.vendidos / st.total * 100 : 0) + '"></i></div></section>' +
      '<div class="row">' + (st.vendidos || r.ganh.length ? '<button class="btn ' + (locked || r.st === 's' ? '' : 'g') + ' grow" type="button" data-a="rf-sort">' + ic('check', 's') + sortLabel + '</button>' : '') + '</div>' +
      '<div class="row sm-top">' + (!locked ? '<button class="btn grow" type="button" data-a="rf-add">' + ic('plus', 's') + 'Atribuir número</button>' : '') + (st.livres ? '<button class="btn g sm" type="button" data-a="rf-free">' + ic('file', 's') + 'Disponíveis (imagem)</button>' : '') + '<button class="btn g sm" type="button" data-a="rf-pdf">' + ic('file', 's') + 'Vendas (PDF)</button></div>' +
      '<div class="card sm-top"><h2 class="h2">Prêmios</h2>' + prem + '</div>' +
      '<div class="card"><div class="row sp"><h2 class="h2 grow">Números</h2>' + (!locked && st.livres > 1 ? '<button class="btn ' + (SEL ? '' : 'g') + ' sm" type="button" data-a="rf-sel" aria-pressed="' + (SEL ? 'true' : 'false') + '">' + (SEL ? 'Cancelar seleção' : 'Selecionar vários') + '</button>' : '') + '</div><p class="note">' + (SEL ? 'Toque nos números livres e depois em "Atribuir".' : 'Toque num número para atribuir ou liberar.') + '</p><div class="legend"><span><i class="f"></i>livre</span><span><i class="s"></i>vendido</span><span><i class="w"></i>premiado ★</span></div><div class="rf-grid">' + grid + '</div></div>' +
      histHtml(r) +
      '<div class="card"><h2 class="h2">Quem tem os números</h2>' + (holders || '<p class="note">Ninguém ainda. Use "Atribuir número".</p>') + '</div>' +
      (SEL ? '<div class="rf-bar" role="region" aria-label="Seleção de números"><span class="grow" id="rfBarT"></span><button class="btn sm" type="button" id="rfBarGo" data-a="rf-selgo">Atribuir</button></div>' : '');
  }
  function byName(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }
  function metaOf(r, p) { return p.cotas * (r.mult || 2); } /* números que cada membro deve vender: cotas x números por cota */
  function soldByResp(r) { var m = Object.create(null); r.vend.forEach(function (v) { var k = v.resp || v.pid; if (k) m[k] = (m[k] || 0) + 1; }); return m; }
  function memberOpts(r, c) { var sb = soldByResp(r); return c.pess.slice().sort(byName).map(function (p) { var meta = metaOf(r, p); return [p.id, p.nome + (meta ? ' (vendeu ' + (sb[p.id] || 0) + ' de ' + meta + ')' : '')]; }); }
  function firstPending(r, c) { var sb = soldByResp(r), l = c.pess.slice().sort(byName).find(function (p) { return metaOf(r, p) > (sb[p.id] || 0); }); return (l || c.pess.slice().sort(byName)[0]).id; }
  /* histórico de vendas agrupado por membro responsável (quem vendeu), com a meta de cada um e o total de pendentes */
  function histHtml(r) {
    var c = cxOf(r), pm = Object.create(null), groups = R.byResp(r), sb = soldByResp(r), pend = 0;
    if (c) c.pess.forEach(function (p) { pm[p.id] = p; pend += Math.max(0, metaOf(r, p) - (sb[p.id] || 0)); });
    if (!groups.length) return '';
    var body = groups.map(function (g) {
      var p = g.resp && pm[g.resp], who = p ? p.nome : g.items[0].nm, meta = p ? metaOf(r, p) : 0;
      return '<div class="sec">' + esc(who) + ' · ' + g.items.length + (meta ? ' de ' + meta : '') + '</div>' + g.items.map(function (v) {
        return '<div class="rf-sale"><b>nº ' + v.n + '</b><span class="grow wrap-any">' + esc(v.nm) + '</span>' + (v.ext ? '<span class="tag mu">externo</span>' : '<span class="tag">próprio</span>') + '</div>';
      }).join('');
    }).join('');
    return '<details class="card rf-hist"><summary><span>Histórico de vendas por membro</span><small>' + plural(groups.length, 'membro', 'membros') + ' · ' + plural(r.vend.length, 'número vendido', 'números vendidos') + ' · faltam vender ' + pend + '</small></summary>' + body + '</details>';
  }
  /* Lê "12", "12, 15" ou "12-20" e devolve a lista de números (sem repetição, no máximo 300). */
  function parseNums(t) {
    var out = [], seen = Object.create(null), parts = String(t || '').split(/[\s,;]+/).filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(parts[i]); if (!m) return null;
      var a = +m[1], b = m[2] ? +m[2] : a; if (b < a || b - a > 300) return null;
      for (var k = a; k <= b; k++) if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out.length && out.length <= 300 ? out : null;
  }
  /* registrar a venda: quem vendeu, qual(is) número(s), quem comprou. "Atribuir e próxima" repete com o mesmo vendedor. */
  function assign(r, n0, list) {
    var c = cxOf(r); if (!c || !c.pess.length) return ui.toast('Cadastre os membros na aba Membros primeiro.');
    if (R.locked(r)) return ui.toast('O sorteio já começou: os números estão travados.');
    var free = R.free(r); if (!free.length) return ui.toast('Não há números livres.');
    var st = { r: firstPending(r, c), n: list && list.length ? list.join(', ') : String(n0 || free[0]), b: 'p', nm: '', t: '', cnt: 0, last: '' };
    function el(id) { return document.getElementById(id); }
    ui.panel({
      title: 'Atribuir número',
      render: function () {
        var fr = R.free(r), nums = parseNums(st.n), multi = nums && nums.length > 1;
        function sel(l, k, o) { return '<label for="as_' + k + '">' + l + '</label><select id="as_' + k + '" data-f="as_' + k + '" data-nf="' + k + '">' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(st[k]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'; }
        return (st.last ? '<p class="note rf-last" role="status" aria-live="polite">' + esc(st.last) + '</p>' : '<p class="msg">Registre a venda: quem vendeu, qual número e quem comprou.</p>') +
          sel('Membro responsável (quem vendeu)', 'r', memberOpts(r, c)) +
          '<label for="as_n">Número</label><input id="as_n" data-f="as_n" data-nf="n" type="text" inputmode="numeric" value="' + esc(st.n) + '" maxlength="80" autocomplete="off" enterkeyhint="next"><span class="hint">' + plural(fr.length, 'livre', 'livres') + ' · aceita vários: 12, 15 ou 12-20</span>' +
          sel('Quem é o comprador?', 'b', [['p', 'O próprio membro'], ['e', 'Pessoa externa']]) +
          (st.b === 'e' ? '<label for="as_nm">Nome do comprador externo</label><input id="as_nm" data-f="as_nm" data-nf="nm" type="text" value="' + esc(st.nm) + '" maxlength="60" autocomplete="off" autocapitalize="words" enterkeyhint="next"><label for="as_t">Telefone do comprador externo</label><input id="as_t" data-f="as_t" data-nf="t" type="tel" inputmode="tel" value="' + esc(st.t) + '" maxlength="24" autocomplete="off" enterkeyhint="done">' : '') +
          '<div class="field-err" id="asErr" role="alert"></div><div class="acts">' +
          (!multi && fr.length > 1 ? '<button class="btn" type="button" data-p="next">Atribuir e próxima</button><button class="btn g" type="button" data-p="ok">Atribuir</button>' : '<button class="btn" type="button" data-p="ok">' + (multi ? 'Atribuir ' + nums.length + ' números' : 'Atribuir') + '</button>') +
          '<button class="btn t" type="button" data-p="x">' + (st.cnt ? 'Concluir' : 'Cancelar') + '</button></div>';
      },
      onInput: function (t) { var k = t.getAttribute('data-nf'); if (k in st) st[k] = t.value; t.removeAttribute('aria-invalid'); var e = el('asErr'); if (e) e.textContent = ''; },
      onChange: function (t, api) { var k = t.getAttribute('data-nf'); if (!(k in st)) return; st[k] = t.value; if (k === 'b') api.draw(); },
      onAct: function (k, b, api) {
        if (k === 'x') { api.close(); return; }
        function fail(m, id) { var e = el('asErr'); if (e) e.textContent = m; var f = el(id); if (f) { f.setAttribute('aria-invalid', 'true'); f.focus(); if (f.scrollIntoView) f.scrollIntoView({ block: 'center' }); } }
        var nums = parseNums(st.n), pe = c.pess.find(function (p) { return p.id === st.r; }); if (!pe) return;
        if (!nums) return fail('Digite um número, vários separados por vírgula ou uma faixa (12-20).', 'as_n');
        var fnow = R.free(r), bad = nums.filter(function (n) { return !fnow.some(function (f) { return +f === n; }); });
        if (bad.length) return fail(bad.length === 1 ? 'O número ' + bad[0] + ' não está livre.' : 'Estes números não estão livres: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? '…' : '') + '.', 'as_n');
        var ext = st.b === 'e'; if (ext && !st.nm.trim()) return fail('Informe o nome do comprador externo.', 'as_nm');
        if (k === 'next' && nums.length !== 1) k = 'ok';
        nums.forEach(function (n) { r.vend.push({ n: n, pid: ext ? null : pe.id, nm: ext ? st.nm.trim().slice(0, 60) : pe.nome, tel: ext ? st.t : pe.tel, ext: ext, resp: pe.id }); });
        r.vend.sort(function (a, b2) { return a.n - b2.n; });
        var who = ext ? st.nm.trim() : pe.nome, what = nums.length === 1 ? 'Nº ' + nums[0] : nums.length + ' números'; st.cnt += nums.length;
        SEL = null;
        A.save(); ui.toast(what + (nums.length === 1 ? ' atribuído' : ' atribuídos') + ' a ' + who);
        var fr = R.free(r);
        if (k !== 'next' || !fr.length) { api.close(); if (k === 'next') ui.toast('Todos os números foram atribuídos.'); return; }
        st.last = 'Última venda: ' + what + ' → ' + who + ' · ' + plural(st.cnt, 'número', 'números') + ' nesta sessão';
        var nx = fr.find(function (f) { return f > nums[0]; }); st.n = String(nx != null ? nx : fr[0]); st.nm = ''; st.t = ''; st.b = 'p'; api.draw();
        var nf = el('as_n'); if (nf) { nf.focus(); nf.select(); }
      }
    });
  }
  ACT['rf-add'] = function () { var r = find(A.RF); if (r) return assign(r, null); };
  /* Imagem PNG com os números disponíveis (para enviar no WhatsApp): no celular abre o menu de compartilhar; no computador baixa o arquivo. */
  async function freePng(r) {
    var fr = R.free(r), c = cxOf(r); if (!fr.length) return ui.toast('Todos os números já foram atribuídos.');
    if (document.fonts && document.fonts.load) { try { await document.fonts.load('800 56px Inter'); await document.fonts.load('700 44px Inter'); } catch (e) { /* usa a fonte padrão */ } }
    var PER = 120, parts = []; for (var q = 0; q < fr.length; q += PER) parts.push(fr.slice(q, q + PER));
    var W = 1136, padX = 56, gap = 14, top = 400, F = 'Inter, system-ui, Arial, sans-serif', blobs = [];
    var prem = r.prem.map(function (p, i) { return ord(i + 1) + ' ' + p; }).join('  ·  ');
    for (var pi = 0; pi < parts.length; pi++) {
      var chunk = parts[pi], cols = chunk.length <= 48 ? 6 : 8, cell = (W - padX * 2 - gap * (cols - 1)) / cols, rows = Math.ceil(chunk.length / cols), H = Math.round(top + rows * (cell + gap) + 110);
      if (W * H > 16e6) return ui.toast('Há números demais para uma imagem. Use "Compartilhar no WhatsApp" (texto).');
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
      var rr = function (x, y, w, h, rad) { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
      g.fillStyle = '#0a0a0f'; g.fillRect(0, 0, W, H); g.fillStyle = '#f5c842'; g.fillRect(0, 0, W, 14);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#f5c842'; g.font = '800 56px ' + F; g.fillText(r.nome, W / 2, 112, W - 80);
      g.fillStyle = '#c4c4d4'; g.font = '600 32px ' + F; g.fillText(brl(r.valor) + ' por número  ·  sorteio em ' + fd(r.data), W / 2, 170, W - 80);
      g.fillStyle = '#9090a8'; g.font = '500 30px ' + F; g.fillText(fr.length + ' disponíveis  ·  ' + r.vend.length + ' vendidos', W / 2, 218, W - 80);
      g.fillStyle = '#f5c842'; g.font = '700 30px ' + F; g.fillText('Prêmios: ' + prem, W / 2, 266, W - 80);
      g.fillStyle = '#2a2a35'; g.fillRect(48, 296, W - 96, 2);
      g.fillStyle = '#f0f0f5'; g.font = '700 38px ' + F; g.fillText('Números disponíveis' + (parts.length > 1 ? ' (' + (pi + 1) + '/' + parts.length + ')' : ''), W / 2, 356);
      g.lineWidth = 3; g.font = '800 ' + Math.round(cell * 0.4) + 'px ' + F; g.textBaseline = 'middle';
      chunk.forEach(function (n, i) {
        var x = padX + (i % cols) * (cell + gap), y = top + Math.floor(i / cols) * (cell + gap);
        rr(x, y, cell, cell, 16); g.fillStyle = '#14141c'; g.fill(); g.strokeStyle = '#22c55e'; g.stroke();
        g.fillStyle = '#ffffff'; g.fillText(String(n), x + cell / 2, y + cell / 2 + 2);
      });
      g.textBaseline = 'alphabetic'; g.fillStyle = '#22222c'; g.fillRect(0, H - 78, W, 78); g.fillStyle = '#9090a8'; g.font = '500 26px ' + F;
      g.fillText((c ? c.nome : 'Caixinha') + ' — Gerado em ' + fd(u.today()), W / 2, H - 30, W - 80);
      var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      if (!blob) return ui.toast('Não foi possível gerar a imagem.');
      blobs.push(blob);
    }
    var files = blobs.map(function (b, i) { return new File([b], 'numeros-disponiveis' + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', { type: 'image/png' }); });
    if (navigator.canShare && navigator.canShare({ files: files })) { try { await navigator.share({ files: files, title: r.nome }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    blobs.forEach(function (b, i) { ui.download('numeros-disponiveis-' + u.today() + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', b, 'image/png'); });
    ui.toast(blobs.length > 1 ? blobs.length + ' imagens salvas. É só enviar no WhatsApp.' : 'Imagem salva. É só enviar no WhatsApp.');
  }
  view.rfPng = freePng;
  ACT['rf-free'] = function () { var r = find(A.RF); if (r) return freePng(r); };
  ACT['rf-pdf'] = function () { var r = find(A.RF); if (r) printRifa(r); };

  view.rf = function () { var r = A.RF && find(A.RF); if (!r) { A.RF = null; return listView(); } return detailView(r); };

  /* ---------- nova rifa ---------- */
  /* Valor em dinheiro vira "R$ 500,00"; qualquer outro texto (ex.: "Cesta de Natal") é mantido como está. */
  function fmtPrize(s) { s = String(s || '').trim(); if (!s) return ''; return /^(R\$\s*)?[\d.,\s]+$/.test(s) ? brl(num(s)) : s.slice(0, 60); }
  ACT['rf-new'] = function () {
    var s = S(), cur = CX.curCx(s), ano = new Date().getFullYear(), seq = s.rifas.filter(function (r) { return String(r.data).slice(0, 4) === String(ano); }).length + 1;
    var N = { cx: cur.id, nome: 'Rifa de ' + ano + ' #' + String(seq).padStart(2, '0'), total: String(Math.max(2, (CX.cx.cotas(cur) || cur.pess.length || 10) * 2)), valor: '25', ini: '100', data: u.today(), q: 3, prem: ['500', '250', '100', '', ''], uni: '1', mult: '2', manual: false };
    function inp(l, k, type, extra) { return '<label for="nf_' + k + '">' + l + '</label><input id="nf_' + k + '" data-f="nf_' + k + '" data-nf="' + k + '" type="' + (type || 'text') + '" value="' + esc(N[k]) + '" autocomplete="off" ' + (extra || '') + '>'; }
    function sel(l, k, opts) { return '<label for="nf_' + k + '">' + l + '</label><select id="nf_' + k + '" data-f="nf_' + k + '" data-nf="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(N[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    ui.panel({
      title: 'Nova rifa',
      render: function () {
        var pz = ''; for (var i = 0; i < N.q; i++) pz += '<div class="rf-prz"><label for="pz' + i + '">' + (i + 1) + 'º lugar</label><input id="pz' + i + '" data-f="pz' + i + '" data-nf="pz:' + i + '" value="' + esc(N.prem[i]) + '" maxlength="60" placeholder="R$ ou descreva o prêmio" autocomplete="off"></div>';
        return '<p class="msg">Os prêmios já vêm em dinheiro (R$). Para outro tipo de prêmio, escreva o que quiser no campo, por exemplo "Cesta de Natal".</p>' +
          inp('Nome da rifa', 'nome', 'text', 'maxlength="60"') + '<div class="grid2"><div>' + inp('Total de números', 'total', 'text', 'inputmode="numeric" maxlength="4"') + '</div><div>' + inp('Valor por número (R$)', 'valor', 'text', 'inputmode="decimal" maxlength="12"') + '</div></div>' +
          inp('Data', 'data', 'date') + sel('Quantidade de ganhadores', 'q', [1, 2, 3, 4, 5].map(function (n) { return [n, n === 1 ? '1 ganhador' : n + ' ganhadores']; })) +
          '<div class="sec">Prêmios por posição</div>' + pz +
          '<p class="note sm-top">Total sugerido: cotas dos membros × meta de números por cota (ajuste em Mais opções). Cada membro vende cotas × meta.</p><details class="rf-more"><summary>Mais opções</summary>' + (s.cxs.length > 1 ? sel('Caixinha', 'cx', s.cxs.map(function (c) { return [c.id, c.nome]; })) : '') + inp('Meta de venda: números por cota', 'mult', 'text', 'inputmode="numeric" maxlength="2"') + inp('Primeiro número', 'ini', 'text', 'inputmode="numeric" maxlength="4"') +
          sel('Cada pessoa pode ganhar mais de uma vez?', 'uni', [['1', 'Não, um prêmio por pessoa'], ['0', 'Sim']]) + '</details>' +
          '<div class="field-err" id="nrErr" role="alert"></div><div class="acts"><button class="btn" type="button" data-p="ok">Criar rifa</button><button class="btn t" type="button" data-p="x">Cancelar</button></div>';
      },
      onInput: function (t) { var k = t.getAttribute('data-nf'); if (!k) return; if (k.indexOf('pz:') === 0) N.prem[+k.slice(3)] = t.value; else if (k in N && k !== 'q') N[k] = t.value;
        if (k === 'total') N.manual = true;
        if (k === 'mult' && !N.manual) { N.total = String(Math.max(2, (CX.cx.cotas(cur) || cur.pess.length || 10) * u.sint(num(t.value), 1, 50, 2))); var ti = document.getElementById('nf_total'); if (ti) ti.value = N.total; }
        var e = document.getElementById('nrErr'); if (e) e.textContent = ''; t.removeAttribute('aria-invalid'); },
      onChange: function (t, api) { var k = t.getAttribute('data-nf'); if (k === 'q') { N.q = u.sint(+t.value, 1, 5, 3); api.draw(); } else if (k && k !== 'q' && k.indexOf('pz:') !== 0) N[k] = t.value; },
      onAct: function (k, b, api) {
        if (k === 'x') return api.close();
        if (k !== 'ok') return;
        var total = Math.floor(num(N.total)), valor = num(N.valor), ini = Math.floor(num(N.ini)), prem = N.prem.slice(0, N.q).map(fmtPrize), er = document.getElementById('nrErr');
        var vazio = prem.findIndex(function (p) { return !p; }), bad = !N.nome.trim() ? ['Informe o nome da rifa.', 'nf_nome'] : (total < 2 || total > 2000) ? ['O total de números vai de 2 a 2000.', 'nf_total'] : (valor < 0 || valor > 1e9) ? ['O valor do número não pode ser negativo.', 'nf_valor'] : !u.isoOk(N.data) ? ['Informe a data.', 'nf_data'] : vazio > -1 ? ['Informe o prêmio do ' + (vazio + 1) + 'º lugar.', 'pz' + vazio] : (ini < 0 || ini > 9999) ? ['O primeiro número vai de 0 a 9999.', 'nf_ini'] : null;
        if (bad) { if (er) er.textContent = bad[0]; var bf = document.getElementById(bad[1]); if (bf) { var dt = bf.closest('details'); if (dt) dt.open = true; bf.setAttribute('aria-invalid', 'true'); bf.focus(); if (bf.scrollIntoView) bf.scrollIntoView({ block: 'center' }); } return; }
        var rf = { id: u.uid(), cx: N.cx, nome: N.nome.trim().slice(0, 60), data: N.data, valor: valor, ini: ini, total: total, prem: prem, uni: N.uni === '1', mult: u.sint(num(N.mult), 1, 50, 2), st: 'a', vend: [], ganh: [], hash: '', criadoEm: u.today() };
        api.close(); s.rifas.push(rf); A.RF = rf.id; A.save(); ui.toast('Rifa criada. Registre as vendas em "Atribuir número".');
      }
    });
  };

  /* ---------- seleção em lote ---------- */
  function selBar() {
    if (!SEL) return; var k = Object.keys(SEL.set), t = document.getElementById('rfBarT'), g = document.getElementById('rfBarGo');
    if (t) t.textContent = k.length ? plural(k.length, 'selecionado', 'selecionados') : 'Nenhum selecionado'; if (g) g.disabled = !k.length;
  }
  ACT['rf-sel'] = function () { var r = find(A.RF); if (!r) return; SEL = SEL ? null : { id: r.id, set: Object.create(null) }; A.render(); selBar(); };
  ACT['rf-selgo'] = function () {
    var r = find(A.RF); if (!r || !SEL) return; var k = Object.keys(SEL.set).map(Number).sort(function (a, b) { return a - b; });
    if (k.length) assign(r, null, k);
  };
  /* ---------- tocar num número ---------- */
  ACT['rf-n'] = async function (b) {
    var r = find(A.RF); if (!r) return; var n = +b.getAttribute('data-n'), v = R.sold(r)[n], won = r.ganh.find(function (g) { return g.n === n; }), locked = R.locked(r);
    if (won) return void ui.dialog({ title: 'Número ' + n, msg: ord(won.pos) + ' prêmio: ' + won.premio + '\nGanhador: ' + won.nm, actions: [{ l: 'Fechar', k: null, c: 'g' }] });
    if (SEL && SEL.id === r.id && !locked && !won && !v) {
      if (SEL.set[n]) delete SEL.set[n]; else SEL.set[n] = true;
      b.classList.toggle('sel', !!SEL.set[n]); b.setAttribute('aria-pressed', SEL.set[n] ? 'true' : 'false'); return selBar();
    }
    if (locked) return void ui.dialog({ title: 'Número ' + n, msg: v ? 'Com ' + v.nm + (v.tel ? ' · ' + v.tel : '') : 'Livre', actions: [{ l: 'Fechar', k: null, c: 'g' }] });
    if (v) {
      var m = await ui.menu('Número ' + n, v.nm + (v.tel ? ' · ' + v.tel : ''), [{ l: 'Liberar este número', k: 'free', c: 'd' }]); if (!m) return;
      var snap = v; r.vend = r.vend.filter(function (x) { return x.n !== n; }); A.save();
      return ui.toast('Número ' + n + ' liberado', { undo: function () { if (!R.sold(r)[n] && !R.locked(r)) { r.vend.push(snap); r.vend.sort(function (a, b2) { return a.n - b2.n; }); A.save(); } } });
    }
    return assign(r, n);
  };

  /* ---------- sorteio ---------- */
  async function sha(t) {
    if (!(window.crypto && crypto.subtle)) return '';
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function winners(r) {
    return r.ganh.map(function (g) { return '<div class="rf-win"><span class="rf-pos">' + ord(g.pos) + '</span><span class="grow wrap-any"><b>nº ' + g.n + ' · ' + esc(g.nm) + '</b><div class="note">' + esc(g.premio) + '</div></span></div>'; }).join('');
  }
  function code(r) { return r.hash ? r.hash.slice(0, 12).toUpperCase() : ''; }
  ACT['rf-sort'] = function () {
    var r = find(A.RF); if (!r) return; var busy = false;
    ui.panel({
      title: 'Sorteio · ' + r.nome,
      render: function () {
        var st = R.stats(r), done = r.st === 's', next = r.prem[r.ganh.length], last = r.ganh[r.ganh.length - 1];
        var h = '<div class="rf-slot"><div class="rf-num" id="rfNum">' + (last ? last.n : '🎟️') + '</div><div class="rf-who" id="rfWho">' + (last ? esc(last.nm) : '') + '</div></div>';
        if (code(r)) h += '<p class="note">Código de conferência: <b>' + code(r) + '</b> (identifica a lista de números sorteada)</p>';
        if (r.ganh.length) h += '<div class="sec">Ganhadores</div>' + winners(r);
        if (done) return h + '<div class="acts"><button class="btn" type="button" data-p="share">Compartilhar resultado</button><button class="btn t" type="button" data-p="x">Fechar</button></div>';
        if (!R.locked(r)) return h + '<p class="msg">' + plural(st.vendidos, 'número concorre', 'números concorrem') + '. Ao iniciar, os números ficam travados e é gerado um código de conferência.</p><div class="acts"><button class="btn" type="button" data-p="start"' + (st.vendidos ? '' : ' disabled') + '>Iniciar sorteio</button><button class="btn t" type="button" data-p="x">Cancelar</button></div>';
        return h + '<p class="msg">Próximo: <b>' + ord(r.ganh.length + 1) + ' prêmio</b> · ' + esc(next || '') + '</p><div class="acts"><button class="btn" type="button" id="rfDraw" data-p="draw">Sortear ' + ord(r.ganh.length + 1) + ' prêmio</button><button class="btn t" type="button" data-p="x">Fechar</button></div>';
      },
      onAct: async function (k, b, api) {
        if (k === 'x') return api.close();
        if (k === 'share') return shareWinners(r);
        if (k === 'start') { r.hash = await sha(R.poolText(r)); A.save(); return api.draw(); }
        if (k === 'draw') {
          if (busy) return; var d = R.draw(r);
          if (!d) { ui.toast('Não há mais números elegíveis para os prêmios restantes.'); return; }
          busy = true;
          r.ganh.push({ pos: d.pos, n: d.n, pid: d.pid, nm: d.nm, premio: r.prem[d.pos - 1], at: new Date().toISOString().slice(0, 19), rnd: d.rnd, pool: d.pool });
          if (r.ganh.length >= r.prem.length) r.st = 's';
          A.save(); /* o resultado já está gravado: fechar a tela não refaz o sorteio */
          var n0 = document.getElementById('rfNum'), who = document.getElementById('rfWho'), btn = document.getElementById('rfDraw'); if (btn) btn.disabled = true;
          var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, fin = function () { busy = false; api.draw(); };
          if (reduce || !n0) { if (n0) { n0.textContent = d.n; who.textContent = d.nm; } return fin(); }
          who.textContent = ''; var t0 = Date.now(), tm = setInterval(function () {
            var n2 = document.getElementById('rfNum'); if (!n2) { clearInterval(tm); busy = false; return; }
            if (Date.now() - t0 > 1600) { clearInterval(tm); n2.textContent = d.n; var w2 = document.getElementById('rfWho'); if (w2) w2.textContent = d.nm; ui.announce('Sorteado: número ' + d.n + ', ' + d.nm); setTimeout(fin, 900); }
            else n2.textContent = d.numbers[Math.floor(Math.random() * d.numbers.length)];
          }, 70);
        }
      }
    });
  };

  /* ---------- compartilhar, imprimir, mais ---------- */
  function shareWinners(r) {
    var t = '🏆 Resultado da ' + r.nome + '\n\n' + r.ganh.map(function (g) { return ord(g.pos) + ' · ' + g.premio + ': nº ' + g.n + ' (' + g.nm + ')'; }).join('\n') + (code(r) ? '\n\nCódigo de conferência: ' + code(r) : '');
    ui.openLink(CX.msg.waUrl('', t));
  }
  async function share(r) {
    var items = [{ l: 'Números livres', k: 'free' }, { l: 'Números por pessoa', k: 'who' }]; if (r.ganh.length) items.push({ l: 'Resultado do sorteio', k: 'win' });
    var m = await ui.menu('Compartilhar no WhatsApp', 'Abre o WhatsApp com o texto pronto.', items); if (!m) return;
    if (m.act === 'win') return shareWinners(r);
    var t;
    if (m.act === 'free') { var fr = R.free(r); t = '🎟️ ' + r.nome + '\nNúmeros livres (' + fr.length + '): ' + (fr.join(', ') || 'nenhum') + '\nValor: ' + brl(r.valor) + ' por número.'; }
    else t = '🎟️ ' + r.nome + ' — números por pessoa:\n' + R.byHolder(r, alive(r)).map(function (h) { return '• ' + h.nm + ': ' + h.nums.join(', '); }).join('\n');
    ui.openLink(CX.msg.waUrl('', t));
  }
  function printRifa(r) {
    var st = R.stats(r), c = cxOf(r), now = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }), kp = function (k, v, cl) { return '<div class="rp-k ' + cl + '"><span>' + k + '</span><b>' + v + '</b></div>'; };
    var hs = R.byHolder(r, alive(r)).sort(function (a, b) { return a.nums[0] - b.nums[0]; });
    document.getElementById('printroot').innerHTML = '<header class="rp-head"><img src="icons/icon-192.png" alt="" width="54" height="54"><div><div class="rp-brand">Caixinha e Empréstimos</div><h1>' + esc(r.nome) + '</h1></div><div class="rp-who"><b>' + esc(c ? c.nome : '') + '</b><span>' + fd(r.data) + ' · ' + brl(r.valor) + ' por número</span></div></header>' +
      '<p class="rp-sub">Relatório da rifa</p><section class="rp-kpis">' + kp('Arrecadado', brl(st.arrecadado), 'main') + kp('Vendidos', st.vendidos + ' de ' + st.total, '') + kp('Livres', String(st.livres), 'gold') + '</section>' +
      (r.ganh.length ? '<table class="rt"><thead><tr><th>Prêmio</th><th>Número</th><th>Ganhador</th></tr></thead><tbody>' + r.ganh.map(function (g) { return '<tr><td>' + ord(g.pos) + ' · ' + esc(g.premio) + '</td><td>' + g.n + '</td><td>' + esc(g.nm) + '</td></tr>'; }).join('') + '</tbody></table><div class="rp-gap"></div>' : '') +
      '<table class="rt"><thead><tr><th>Pessoa</th><th>Números</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>' + hs.map(function (h) { return '<tr><td>' + esc(h.nm) + (h.ext ? ' (externo)' : '') + '</td><td class="rp-nums">' + esc(h.nums.join(', ')) + '</td><td>' + h.nums.length + '</td><td>' + brl(h.nums.length * r.valor) + '</td></tr>'; }).join('') + '<tr class="t"><td>Total</td><td></td><td>' + st.vendidos + '</td><td>' + brl(st.arrecadado) + '</td></tr></tbody></table>' +
      (code(r) ? '<p class="rp-note"><b>Código de conferência:</b> ' + code(r) + '</p>' : '') + '<footer class="rp-foot"><span>Gerado em ' + esc(now) + '</span><span>Caixinha e Empréstimos</span></footer>';
    setTimeout(function () { window.print(); }, 60);
  }
  ACT['rf-more'] = async function () {
    var r = find(A.RF); if (!r) return; var locked = R.locked(r), items = [{ l: 'Compartilhar no WhatsApp (texto)', k: 'share' }];
    if (r.st === 'a' && !r.ganh.length) items.push({ l: 'Encerrar sem sorteio', k: 'close' }); if (r.st === 'e') items.push({ l: 'Reabrir rifa', k: 'open' });
    if (r.ganh.length || r.hash) items.push({ l: 'Anular sorteio', k: 'void', c: 'd' }); items.push({ l: 'Excluir rifa', k: 'del', c: 'd' });
    var m = await ui.menu(r.nome, locked ? 'Sorteio iniciado: os números estão travados.' : '', items); if (!m) return;
    if (m.act === 'share') return share(r);
    if (m.act === 'close') { r.st = 'e'; A.save(); return ui.toast('Rifa encerrada', { undo: function () { if (r.st === 'e') { r.st = 'a'; A.save(); } } }); }
    if (m.act === 'open') { r.st = 'a'; A.save(); return ui.toast('Rifa reaberta'); }
    if (m.act === 'void') return guard(async function () {
      if (!await ui.confirm({ title: 'Anular o sorteio?', msg: 'Os ganhadores e o código de conferência serão apagados e os números voltam a poder ser mudados.', yes: 'Anular sorteio', danger: true, no: 'Voltar' })) return;
      r.ganh = []; r.hash = ''; r.st = 'a'; A.save(); ui.toast('Sorteio anulado');
    });
    if (m.act === 'del') return guard(async function () {
      if (!await ui.confirm({ title: 'Excluir ' + r.nome + '?', msg: 'Números, vendas e ganhadores desta rifa serão apagados.', yes: 'Excluir', danger: true, no: 'Voltar' })) return;
      var snap = JSON.stringify(r), idx = S().rifas.indexOf(r); S().rifas.splice(idx, 1); A.RF = null; A.save();
      ui.toast('Rifa excluída', { undo: function () { S().rifas.splice(Math.min(idx, S().rifas.length), 0, JSON.parse(snap)); A.save(); } });
    });
  };
})();
