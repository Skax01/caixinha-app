/* membros.js — aba Membros: cadastro e ajuste das pessoas da caixinha.
   Um membro com cota 0 é "só membro" (participa das rifas, não paga a caixinha); com 1 ou mais, é cotista.
   Os dados são os mesmos de S.cxs[].pess, então tudo que muda aqui aparece na aba Caixinha e vice-versa. */
(function () {
  'use strict';
  var CX = window.CX, u = CX.u, esc = u.esc, num = u.num, ui = CX.ui, V = CX.vault, K = CX.cx, A = CX.app, ic = ui.icon, view = CX.v, ACT = CX.act;
  function S() { return A.S; }
  function cx() { return CX.curCx(S()); }
  function find(id) { return cx().pess.find(function (p) { return p.id === id; }); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function guard(fn) { return V.hasVault() ? A.confirmPin('Confirme com o PIN').then(function (ok) { if (ok) return fn(); }) : fn(); }
  var MAX_MEMBROS = 500;

  view.mb = function () {
    var c = cx(), cot = K.cotistas(c), total = K.cotas(c);
    var rows = c.pess.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).map(function (p) {
      var sub = [p.apelido ? '“' + esc(p.apelido) + '”' : '', esc(p.tel || 'sem WhatsApp')].filter(Boolean).join(' · ');
      return '<div class="pe" data-nm="' + esc((p.nome + ' ' + p.apelido).toLowerCase()) + '"><div class="grow"><button class="nm" type="button" data-a="mb-edit" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</button><div class="sb">' + sub + '</div></div>' +
        '<div class="rf-step"><button class="ibtn" type="button" data-a="mb-c" data-id="' + esc(p.id) + '" data-d="-1" aria-label="Menos uma cota para ' + esc(p.nome) + '"' + (p.cotas <= 0 ? ' disabled' : '') + '>−</button>' +
        '<div class="mb-c" role="status" aria-label="' + plural(p.cotas, 'cota', 'cotas') + '"><b>' + p.cotas + '</b><small>' + (p.cotas === 1 ? 'cota' : 'cotas') + '</small></div>' +
        '<button class="ibtn" type="button" data-a="mb-c" data-id="' + esc(p.id) + '" data-d="1" aria-label="Mais uma cota para ' + esc(p.nome) + '">+</button></div></div>';
    }).join('');
    return view.picker(c) + '<div class="row sp"><h2 class="fd rf-title">Membros</h2><button class="btn sm" type="button" data-a="mb-add">' + ic('plus', 's') + 'Novo membro</button></div>' +
      '<div class="stats"><div class="stat"><b>' + c.pess.length + '</b><span>membros</span></div><div class="stat"><b>' + cot.length + '</b><span>na caixinha</span></div><div class="stat w"><b>' + total + '</b><span>cotas no total</span></div></div>' +
      (c.pess.length ? '<div class="card"><label for="mbSearch">Buscar membro</label><input id="mbSearch" type="search" autocomplete="off" maxlength="60" placeholder="Nome ou apelido">' +
        '<p class="note sm-top">Toque no nome para editar. Use − e + para ajustar as cotas. Cota 0 = só membro (participa das rifas, não paga a caixinha).</p><div id="mbList">' + rows + '</div><p class="note" id="mbNone" hidden>Nenhum membro encontrado.</p></div>'
        : '<div class="card empty"><div class="fd">Nenhum membro ainda</div><p>Cadastre um por um ou cole a lista inteira de uma vez.</p></div>') +
      '<div class="row"><button class="btn grow" type="button" data-a="mb-add">' + ic('plus', 's') + 'Novo membro</button><button class="btn g grow" type="button" data-a="mb-bulk">Adicionar vários</button></div>';
  };
  view.mbInput = function (e) {
    var t = e.target; if (!t || t.id !== 'mbSearch') return; var q = t.value.trim().toLowerCase(), n = 0;
    document.querySelectorAll('#mbList .pe').forEach(function (row) { var hide = !!q && row.getAttribute('data-nm').indexOf(q) < 0; row.hidden = hide; if (!hide) n++; });
    var none = document.getElementById('mbNone'); if (none) none.hidden = n > 0;
  };

  /* mês em que a pessoa entra: o mês que está aberto na caixinha (os anteriores não contam para ela) */
  function desdeAgora() { var s = A.S; return s.ano + '-' + u.p2(s.mes + 1); }
  var fields = function (p) {
    return [{ l: 'Nome', k: 'n', v: p ? p.nome : '', max: 60 }, { l: 'Apelido (opcional)', k: 'a', v: p ? p.apelido : '', max: 30 }, { l: 'WhatsApp com DDD (opcional)', k: 't', t: 'tel', m: 'tel', v: p ? p.tel : '', max: 24 },
      { l: 'Quantidade de cotas', k: 'c', t: 'number', m: 'numeric', v: p ? p.cotas : '1', max: 4, h: '0 = só membro, sem cota na caixinha.' }];
  };
  var chk = function (v) { var c = Math.floor(num(v.c)); return !v.n ? 'Informe o nome.' : (v.c === '' || c < 0 || c > 1000) ? 'As cotas vão de 0 a 1000.' : ''; };

  ACT['mb-add'] = async function () {
    var c = cx(); if (c.pess.length >= MAX_MEMBROS) return ui.toast('Limite de ' + MAX_MEMBROS + ' membros por caixinha.');
    var r = await ui.dialog({ title: 'Novo membro', fields: fields(null), actions: [{ l: 'Adicionar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: chk });
    if (!r) return; c.pess.push({ id: u.uid(), nome: r.v.n, apelido: r.v.a, cotas: u.sint(num(r.v.c), 0, 1000, 1), tel: r.v.t, desde: desdeAgora() }); A.save(); ui.toast(r.v.n + ' adicionado');
  };
  ACT['mb-edit'] = async function (b) {
    var c = cx(), p = find(b.getAttribute('data-id')); if (!p) return;
    var r = await ui.dialog({ title: 'Editar membro', fields: fields(p), actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Remover membro', k: 'del', c: 'd', nv: true }, { l: 'Cancelar', k: null, c: 'g' }], check: chk });
    if (!r) return;
    if (r.act === 'del') {
      if (!await ui.confirm({ title: 'Remover ' + p.nome + '?', msg: 'Os pagamentos dele na caixinha também serão apagados, e os totais dos meses anteriores deixam de contar o que ele pagou. O nome continua nos históricos das rifas. Se só quer tirar das cobranças, zere as cotas dele em vez de remover.', yes: 'Remover', danger: true, no: 'Voltar' })) return;
      return guard(function () {
        c.pess = c.pess.filter(function (x) { return x.id !== p.id; });
        [c.pag, c.mul].forEach(function (o) { Object.keys(o).forEach(function (k) { if (k.indexOf(p.id + '|') === 0) delete o[k]; }); });
        A.save(); ui.toast('Membro removido');
      });
    }
    var nc = u.sint(num(r.v.c), 0, 1000, 1);
    if (nc !== p.cotas && hasPast(c, p) && !await ui.confirm({ title: 'Mudar as cotas de ' + p.nome + '?', msg: 'A mudança vale para todos os meses, inclusive os já pagos: os totais antigos serão recalculados com ' + plural(nc, 'cota', 'cotas') + '.', yes: 'Mudar cotas', no: 'Voltar' })) return;
    p.nome = r.v.n; p.apelido = r.v.a; p.tel = r.v.t; p.cotas = nc; A.save();
  };
  function hasPast(c, p) { return Object.keys(c.pag).some(function (k) { return k.indexOf(p.id + '|') === 0; }); }
  ACT['mb-c'] = function (b) {
    var p = find(b.getAttribute('data-id')); if (!p) return; p.cotas = Math.max(0, Math.min(1000, p.cotas + (+b.getAttribute('data-d') || 0))); A.save();
  };
  /* cadastro em lote: um por linha, "Nome; cotas; WhatsApp" (cotas e WhatsApp são opcionais) */
  ACT['mb-bulk'] = async function () {
    var c = cx(), r = await ui.dialog({
      title: 'Adicionar vários membros', msg: 'Cole a lista, um membro por linha. Se quiser, use ponto e vírgula para informar as cotas e o WhatsApp:\nMaria Souza; 2; 21 98765-4321',
      fields: [{ l: 'Lista de membros', k: 'l', area: true, rows: 9, v: '', max: 30000 }, { l: 'Cotas de quem não informar', k: 'c', t: 'number', m: 'numeric', v: '1', max: 4, h: 'Use 0 para cadastrar só como membro.' }],
      actions: [{ l: 'Adicionar à lista', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }],
      check: function (v) { return !v.l.trim() ? 'Cole pelo menos um nome.' : (v.c === '' || num(v.c) < 0 || num(v.c) > 1000) ? 'As cotas vão de 0 a 1000.' : ''; }
    });
    if (!r) return;
    var have = Object.create(null); c.pess.forEach(function (p) { have[p.nome.toLowerCase()] = 1; });
    var def = u.sint(num(r.v.c), 0, 1000, 1), added = 0, dup = 0, over = 0;
    r.v.l.split(/\r?\n/).forEach(function (line) {
      var x = line.split(/[;\t]/).map(function (s) { return s.trim(); }), nome = (x[0] || '').replace(/\s+/g, ' ').slice(0, 60); if (!nome) return;
      if (have[nome.toLowerCase()]) { dup++; return; } if (c.pess.length >= MAX_MEMBROS) { over++; return; }
      have[nome.toLowerCase()] = 1; c.pess.push({ id: u.uid(), nome: nome, apelido: '', cotas: x[1] !== undefined && x[1] !== '' ? u.sint(num(x[1]), 0, 1000, def) : def, tel: (x[2] || '').replace(/[^\d+()\-\s]/g, '').slice(0, 24), desde: desdeAgora() }); added++;
    });
    A.save(); ui.toast(plural(added, 'membro adicionado', 'membros adicionados') + (dup ? ' · ' + dup + ' já existiam' : '') + (over ? ' · ' + over + ' além do limite' : ''));
  };
})();
