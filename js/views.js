/* views.js — telas (Caixinha, Empréstimos, Painel, Agenda, Ajustes) e as ações do usuário.
   Toda string que vem de dados passa por esc(); não há handlers inline nem estilos inline (CSP estrita). */
(function () {
  'use strict';
  var CX = window.CX, u = CX.u, esc = u.esc, brl = u.brl, MN = u.MN, fd = u.fd, num = u.num, r2 = u.r2, ui = CX.ui, V = CX.vault, K = CX.cx, Ln = CX.loan, A = CX.app = CX.app || {};
  var ic = ui.icon, view = CX.v = {}, ACT = CX.act = {};
  function S() { return A.S; }
  function cx() { return CX.curCx(A.S); }
  function cmaTxt(n) { return String(n).replace('.', ','); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function find(arr, id) { return arr.find(function (x) { return x.id === id; }); }
  var SL = { np: 'Não pago', p: 'Pago', pa: 'Pago c/ atraso', a: 'Atrasado', mix: 'Misto' }, SI = { p: 'check', pa: 'check', a: 'alert' };
  function yearBar(a, b) { var s = S(); return '<div class="year"><button class="ibtn" type="button" data-a="' + a + '" aria-label="Ano anterior">' + ic('left') + '</button><b>' + s.ano + '</b><button class="ibtn" type="button" data-a="' + b + '" aria-label="Próximo ano">' + ic('right') + '</button></div>'; }
  function tagLoan(l) { return l.quit ? '<span class="tag mu">Quitado</span>' : Ln.isLate(l) ? '<span class="tag lt">' + ic('alert', 's') + 'Atrasado</span>' : '<span class="tag">' + ic('check', 's') + 'Em dia</span>'; }
  function guard(fn) {
    if (!V.hasVault()) return fn();
    return A.confirmPin('Confirme com o PIN').then(function (ok) { if (ok) return fn(); });
  }
  function moneyStr(n) { return n ? String(n).replace('.', ',') : ''; }

  /* =================== CAIXINHA =================== */
  function picker(c) {
    var s = S();
    return '<button class="picker" type="button" data-a="cxmenu" aria-label="Caixinha ' + esc(c.nome) + '. Trocar ou editar"><span class="ic">' + ic('coin') + '</span><span class="grow"><b>' + esc(c.nome) + '</b><small>Cota ' + brl(c.valor) + ' · ' + (c.venc ? 'vence dia ' + c.venc : 'sem dia de vencimento') + (s.cxs.length > 1 ? ' · ' + s.cxs.length + ' caixinhas' : '') + '</small></span>' + ic('down') + '</button>';
  }
  view.picker = picker;
  function pessoaRow(c, p, y, m) {
    var t = K.stOf(c, p, y, m), k = K.cnt(c, p, y, m), mv = K.mulOf(c, p, y, m), sb = plural(p.cotas, 'cota', 'cotas') + ' · ' + brl(p.cotas * c.valor);
    if (t === 'mix') sb = [['p', 'paga', 'pagas'], ['pa', 'paga c/ atraso', 'pagas c/ atraso'], ['a', 'atrasada', 'atrasadas'], ['np', 'não paga', 'não pagas']].filter(function (x) { return k[x[0]]; }).map(function (x) { return k[x[0]] + ' ' + (k[x[0]] > 1 ? x[2] : x[1]); }).join(' · ');
    var lk = function (a, l) { return ' · <button class="lnk" type="button" data-a="' + a + '" data-id="' + esc(p.id) + '">' + l + '</button>'; };
    return '<div class="pe"><div class="grow"><button class="nm" type="button" data-a="editp" data-id="' + esc(p.id) + '">' + esc(p.nome) + '</button><div class="sb">' + esc(sb) + (p.cotas > 1 ? lk('div', 'dividir') : '') + (k.pa > 0 ? lk('mul', mv > 0 ? 'multa ' + brl(mv) : '+ multa') : '') + '</div></div>' +
      '<button class="pill ' + t + '" type="button" data-a="st" data-id="' + esc(p.id) + '" aria-label="' + esc(p.nome) + ': ' + SL[t] + '. Alterar status">' + (SI[t] ? ic(SI[t], 's') : '') + SL[t] + '</button></div>';
  }
  function filterList(c, y, m) {
    var nF = K.pending(c, y, m).length, nA = K.lateP(c, y, m).length, FL = A.FL,
      chip = function (k, l) { return '<button type="button" data-a="fl" data-k="' + k + '" aria-pressed="' + (FL === k) + '">' + l + '</button>'; },
      ps = K.cotistas(c).filter(function (p) { return K.ativo(p, y, m); }).filter(function (p) { var q = K.cnt(c, p, y, m); return FL === 'falta' ? q.np + q.a > 0 : FL === 'atr' ? q.a > 0 : true; });
    return '<div class="seg" role="group" aria-label="Filtrar membros">' + chip('todos', 'Todos') + chip('falta', 'Faltam (' + nF + ')') + chip('atr', 'Atrasados (' + nA + ')') + '</div>' +
      (ps.length ? ps.map(function (p) { return pessoaRow(c, p, y, m); }).join('') : '<p class="note mt">Ninguém nesta lista em ' + MN[m] + '. 🎉</p>') +
      (FL !== 'todos' && ps.length ? '<button class="btn g big mt" type="button" data-a="cob">' + ic('copy', 's') + 'Copiar lista para cobrança</button>' : '');
  }
  view.cx = function () {
    var s = S(), c = cx(), y = s.ano, m = s.mes, esp = K.cotas(c, y, m) * c.valor, rec = K.received(c, y, m), mul = K.mulTot(c, y, m), pend = K.pending(c, y, m).length, late = K.lateP(c, y, m).length;
    var months = MN.map(function (n, i) { var tem = K.lateP(c, y, i).length > 0; return '<button type="button" data-a="mes" data-i="' + i + '" aria-pressed="' + (i === m) + '" aria-label="' + n + (tem ? ', com atrasos' : '') + '">' + n.slice(0, 3) + (tem ? '<span class="late-dot"></span>' : '') + '</button>'; }).join('');
    var h = picker(c) + yearBar('ano-', 'ano+') + '<div class="months" role="group" aria-label="Mês">' + months + '</div>' +
      '<section class="hero" aria-label="Resumo do mês"><div class="k">' + MN[m] + ' ' + y + ' · recebido</div><span class="v">' + brl(rec + mul) + '</span><div class="s">de ' + brl(esp) + ' esperados · ' + plural(K.cotas(c), 'cota', 'cotas') + ' de ' + brl(c.valor) + (mul ? ' · inclui ' + brl(mul) + ' de multa' : '') + '</div><div class="bar" role="img" aria-label="' + Math.round(esp ? Math.min(100, rec / esp * 100) : 0) + '% do esperado recebido"><i data-w="' + (esp ? Math.min(100, rec / esp * 100) : 0) + '"></i></div><button class="btn" type="button" data-a="rel">' + ic('file', 's') + 'Ver relatório</button></section>' +
      '<div class="stats"><div class="stat"><b>' + K.cotistas(c).length + '</b><span>membros</span></div><div class="stat w"><b>' + pend + '</b><span>faltam pagar</span></div><div class="stat d"><b>' + late + '</b><span>atrasados</span></div></div>';
    if (!K.cotistas(c).length) return h + '<div class="card empty"><div class="fd">Sua caixinha está vazia</div><p>Adicione os membros para marcar quem pagou em cada mês. Quem já está cadastrado só aparece aqui depois de ter pelo menos 1 cota (ajuste na aba Membros).</p><div class="row center"><button class="btn" type="button" data-a="addp">' + ic('plus', 's') + 'Adicionar membro</button><button class="btn g" type="button" data-a="cxedit">Editar caixinha</button></div></div>';
    return h + '<div class="card"><div class="row sp"><h2 class="h2 mb0">Pagamentos</h2><button class="btn ok sm" type="button" data-a="todos">Todos pagos</button></div><p class="note sm-top">Toque no status para alterar o pagamento.</p>' + filterList(c, y, m) + '</div>' +
      '<button class="btn big" type="button" data-a="addp">' + ic('plus', 's') + 'Novo membro</button><div class="row sm-top"><button class="btn g grow" type="button" data-a="cxedit">Editar caixinha</button><button class="btn g grow" type="button" data-a="cxnew">Nova caixinha</button></div>';
  };

  ACT['ano-'] = function () { S().ano--; A.save(); };
  ACT['ano+'] = function () { S().ano++; A.save(); };
  ACT.mes = function (b) { S().mes = +b.getAttribute('data-i'); A.render(); };
  ACT.fl = function (b) { A.FL = b.getAttribute('data-k'); A.render(); };
  ACT.todos = function () {
    var c = cx(), y = S().ano, m = S().mes, sn = JSON.stringify(c.pag);
    var n = 0;
    c.pess.forEach(function (p) {
      var k = K.pk(p.id, y, m), st = K.stOf(c, p, y, m);
      if (p.cotas <= 0 || (st !== 'np' && st !== 'a')) return;
      c.pag[k] = st === 'a' ? 'pa' : 'p'; n++;
    });
    if (!n) return ui.toast('Ninguém pendente em ' + MN[m]);
    A.save();
    ui.toast(plural(n, 'pagamento marcado', 'pagamentos marcados') + ' em ' + MN[m], { undo: function () { if (S().cxs.indexOf(c) > -1) { c.pag = JSON.parse(sn); A.save(); } } });
  };
  ACT.cob = function () {
    var c = cx(), y = S().ano, m = S().mes, late = A.FL === 'atr', ps = late ? K.lateP(c, y, m) : K.pending(c, y, m);
    var tx = 'Caixinha ' + c.nome + ' · ' + MN[m] + '/' + y + '\n' + (late ? 'Atrasados:' : 'Faltam pagar:') + '\n' + ps.map(function (p) { var q = K.cnt(c, p, y, m), n = late ? q.a : q.np + q.a; return '• ' + p.nome + ' – ' + plural(n, 'cota', 'cotas') + ' (' + brl(n * c.valor) + ')'; }).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(tx) : Promise.reject()).then(function () { ui.toast('Lista copiada. É só colar no WhatsApp'); }, function () { ui.toast('Não foi possível copiar'); });
  };
  ACT.st = async function (b) {
    var c = cx(), p = find(c.pess, b.getAttribute('data-id')), y = S().ano, m = S().mes; if (!p) return;
    if (K.stOf(c, p, y, m) === 'mix') return ACT.div(b);
    var cur = K.stOf(c, p, y, m), mk = function (k, l, cl) { return { l: (cur === k ? '✓ ' : '') + l, k: k, c: cl }; };
    var items = [mk('p', 'Pago', 'ok'), mk('pa', 'Pago com atraso', 'g'), mk('a', 'Atrasado', 'd'), mk('np', 'Não pago', 'g')];
    if (p.cotas > 1) items.push({ l: 'Dividir entre as cotas…', k: 'div', c: 'g' });
    var r = await ui.menu(p.nome, MN[m] + ' · ' + plural(p.cotas, 'cota', 'cotas'), items); if (!r) return;
    if (r.act === 'div') return ACT.div(b);
    var key = K.pk(p.id, y, m); if (r.act === 'np') delete c.pag[key]; else c.pag[key] = r.act; A.save();
  };
  ACT.div = async function (b) {
    var c = cx(), p = find(c.pess, b.getAttribute('data-id')), y = S().ano, m = S().mes; if (!p) return;
    var k = K.cnt(c, p, y, m), key = K.pk(p.id, y, m);
    var r = await ui.dialog({
      title: p.nome + ' · ' + MN[m], msg: p.cotas + ' cotas. O que não for informado fica como não pago.',
      fields: [{ l: 'Pagas', k: 'p', t: 'number', v: k.p, m: 'numeric', max: 4 }, { l: 'Pagas com atraso', k: 'pa', t: 'number', v: k.pa, m: 'numeric', max: 4 }, { l: 'Atrasadas', k: 'a', t: 'number', v: k.a, m: 'numeric', max: 4 }],
      actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Limpar divisão', k: 'clr', c: 'g', nv: true }, { l: 'Cancelar', k: null, c: 't' }],
      check: function (v) { return u.sint(num(v.p), 0, 1e4, 0) + u.sint(num(v.pa), 0, 1e4, 0) + u.sint(num(v.a), 0, 1e4, 0) > p.cotas ? 'A soma passa de ' + p.cotas + ' cotas.' : ''; }
    });
    if (!r) return;
    if (r.act === 'clr') { delete c.pag[key]; return A.save(); }
    var x = u.sint(num(r.v.p), 0, 1e4, 0), y2 = u.sint(num(r.v.pa), 0, 1e4, 0), z = u.sint(num(r.v.a), 0, 1e4, 0);
    if (!x && !y2 && !z) delete c.pag[key]; else if (x === p.cotas) c.pag[key] = 'p'; else if (y2 === p.cotas) c.pag[key] = 'pa'; else if (z === p.cotas) c.pag[key] = 'a'; else c.pag[key] = { p: x, pa: y2, a: z };
    A.save();
  };
  ACT.mul = async function (b) {
    var c = cx(), p = find(c.pess, b.getAttribute('data-id')), y = S().ano, m = S().mes; if (!p) return;
    var k = K.cnt(c, p, y, m), key = K.pk(p.id, y, m), cur = c.mul[key] || (S().multaRs > 0 ? r2(S().multaRs * k.pa) : 0);
    var r = await ui.dialog({ title: 'Multa · ' + p.nome, msg: 'Valor total cobrado pelo atraso em ' + MN[m] + '. Deixe 0 para não cobrar.', fields: [{ l: 'Multa (R$)', k: 'v', v: moneyStr(cur), m: 'decimal', max: 14 }], actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }] });
    if (!r) return; var v = r2(num(r.v.v)); if (v > 0) c.mul[key] = Math.min(v, 1e9); else delete c.mul[key]; A.save();
  };
  var pessChk = function (v) { return !v.n ? 'Informe o nome.' : (u.sint(num(v.c), 0, 9999, 0) < 1 ? 'A quantidade de cotas deve ser pelo menos 1.' : u.sint(num(v.c), 0, 9999, 0) > 1000 ? 'No máximo 1000 cotas.' : ''); };
  ACT.addp = async function () {
    var c = cx(), r = await ui.dialog({ title: 'Novo membro', fields: [{ l: 'Nome', k: 'n', max: 60 }, { l: 'Quantidade de cotas', k: 'c', t: 'number', v: '1', m: 'numeric', max: 4 }, { l: 'WhatsApp com DDD (opcional)', k: 't', t: 'tel', m: 'tel', max: 24, h: 'Usado só para abrir a conversa no WhatsApp.' }], actions: [{ l: 'Adicionar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: pessChk });
    if (!r) return; c.pess.push({ id: u.uid(), nome: r.v.n, cotas: u.sint(num(r.v.c), 1, 1000, 1), tel: r.v.t, desde: S().ano + '-' + u.p2(S().mes + 1) }); A.save(); ui.toast(r.v.n + ' adicionado');
  };
  ACT.editp = async function (b) {
    var c = cx(), p = find(c.pess, b.getAttribute('data-id')); if (!p) return;
    var r = await ui.dialog({ title: 'Editar membro', fields: [{ l: 'Nome', k: 'n', v: p.nome, max: 60 }, { l: 'Quantidade de cotas', k: 'c', t: 'number', v: p.cotas, m: 'numeric', max: 4 }, { l: 'WhatsApp com DDD (opcional)', k: 't', t: 'tel', v: p.tel || '', m: 'tel', max: 24 }], actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Remover membro', k: 'del', c: 'd', nv: true }, { l: 'Cancelar', k: null, c: 'g' }], check: pessChk });
    if (!r) return;
    if (r.act === 'del') {
      if (!await ui.confirm({ title: 'Remover ' + p.nome + '?', msg: 'Os pagamentos dele serão apagados e os totais dos meses anteriores deixam de contar o que ele pagou. Se só quer tirar das cobranças, zere as cotas na aba Membros.', yes: 'Remover', danger: true, no: 'Voltar' })) return;
      c.pess = c.pess.filter(function (x) { return x.id !== p.id; });
      [c.pag, c.mul].forEach(function (o) { Object.keys(o).forEach(function (k) { if (k.indexOf(p.id + '|') === 0) delete o[k]; }); });
      return A.save();
    }
    var nc = u.sint(num(r.v.c), 1, 1000, 1);
    if (nc !== p.cotas && Object.keys(c.pag).some(function (k) { return k.indexOf(p.id + '|') === 0; }) && !await ui.confirm({ title: 'Mudar as cotas de ' + p.nome + '?', msg: 'A mudança vale para todos os meses, inclusive os já pagos: os totais antigos serão recalculados com ' + plural(nc, 'cota', 'cotas') + '.', yes: 'Mudar cotas', no: 'Voltar' })) return;
    p.nome = r.v.n; p.cotas = nc; p.tel = r.v.t; A.save();
  };
  var cxChk = function (v) { return !v.n ? 'Informe o nome da caixinha.' : num(v.v) <= 0 ? 'O valor da cota deve ser maior que zero.' : (v.d && (u.sint(num(v.d), 0, 99, 0) < 1 || u.sint(num(v.d), 0, 99, 0) > 31) ? 'O dia de vencimento vai de 1 a 31.' : ''); };
  ACT.cxmenu = async function () {
    var s = S(), items = s.cxs.map(function (c) { return { l: (c.id === s.cur ? '✓ ' : '') + c.nome, k: 'u:' + c.id, c: c.id === s.cur ? 'ok' : 'g' }; }).concat([{ l: '+ Nova caixinha', k: 'new' }, { l: 'Editar esta caixinha', k: 'edit' }]);
    var r = await ui.menu('Suas caixinhas', 'Toque para trocar de caixinha.', items); if (!r) return;
    if (r.act === 'new') ACT.cxnew(); else if (r.act === 'edit') ACT.cxedit(); else { s.cur = r.act.slice(2); A.FL = 'todos'; A.save(); }
  };
  ACT.cxnew = async function () {
    var r = await ui.dialog({ title: 'Nova caixinha', fields: [{ l: 'Nome da caixinha', k: 'n', max: 60 }, { l: 'Valor de cada cota (R$)', k: 'v', v: '50', m: 'decimal', max: 12 }, { l: 'Dia de vencimento (1 a 31, opcional)', k: 'd', t: 'number', m: 'numeric', max: 2 }], actions: [{ l: 'Criar caixinha', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: cxChk });
    if (!r) return; var c = { id: u.uid(), nome: r.v.n, valor: Math.min(num(r.v.v), 1e7), venc: u.sint(num(r.v.d), 0, 31, 0), aviso: 2, pess: [], pag: {}, mul: {} };
    S().cxs.push(c); S().cur = c.id; A.save(); ui.toast('Caixinha criada');
  };
  ACT.cxedit = async function () {
    var s = S(), c = cx(), many = s.cxs.length > 1;
    var r = await ui.dialog({ title: 'Editar caixinha', fields: [{ l: 'Nome', k: 'n', v: c.nome, max: 60 }, { l: 'Valor de cada cota (R$)', k: 'v', v: cmaTxt(c.valor), m: 'decimal', max: 12 }, { l: 'Dia de vencimento (1 a 31, vazio = sem)', k: 'd', t: 'number', v: c.venc || '', m: 'numeric', max: 2 }, { l: 'Avisar quantos dias antes (0 a 10)', k: 'a', t: 'number', v: c.aviso, m: 'numeric', max: 2 }],
      actions: [{ l: 'Salvar', k: 'ok' }].concat(many ? [{ l: 'Excluir esta caixinha', k: 'del', c: 'd', nv: true }] : []).concat([{ l: 'Cancelar', k: null, c: 'g' }]), check: cxChk });
    if (!r) return;
    if (r.act === 'del') {
      if (!await ui.confirm({ title: 'Excluir ' + c.nome + '?', msg: 'Membros e pagamentos desta caixinha serão apagados. Isso não pode ser desfeito.', yes: 'Excluir', danger: true, no: 'Voltar' })) return;
      return guard(function () { s.cxs = s.cxs.filter(function (x) { return x.id !== c.id; }); s.cur = s.cxs[0].id; A.save(); });
    }
    var nv = Math.min(num(r.v.v), 1e7);
    if (nv !== c.valor && Object.keys(c.pag).length && !await ui.confirm({ title: 'Mudar o valor da cota?', msg: 'O novo valor (' + brl(nv) + ') vale para todos os meses, inclusive os já pagos: os totais antigos serão recalculados.', yes: 'Mudar valor', no: 'Voltar' })) return;
    c.nome = r.v.n; c.valor = nv; c.venc = u.sint(num(r.v.d), 0, 31, 0); c.aviso = u.sint(num(r.v.a), 0, 10, 2); A.save();
  };

  /* ----- relatório ----- */
  var R = { mode: 'cot', scope: 'mes', f: '', bal: '0' };
  /* Balanço (opcional) da caixinha + empréstimos. p = prefixo de classe: "bal" (tela) ou "rp-bal" (impressão). */
  function balHtml(b, p) {
    var r = function (l, v, cl) { return '<div class="' + p + '-r ' + (cl || '') + '"><span>' + l + '</span><b>' + brl(v) + '</b></div>'; };
    return '<section class="' + p + '"><div class="' + p + '-h">Balanço de ' + b.ano + '</div><div class="' + p + '-cols">' +
      '<div class="' + p + '-c"><div class="' + p + '-t">Caixinha · ' + esc(b.nome) + '</div>' + r('Pagas em dia', b.cx.emDia) + r('Pagas com atraso', b.cx.comAtraso) + r('Multas', b.cx.multas) + r('Total recebido', b.cx.total, 'sum') + r('Atrasado (a receber)', b.cx.atrasado, 'red') + r('Não pago (a receber)', b.cx.naoPago, 'red') + '</div>' +
      '<div class="' + p + '-c"><div class="' + p + '-t">Empréstimos</div>' + r('Emprestado em aberto', b.loans.naRua) + r('A receber (restante)', b.loans.aReceber) + r('Recebido em ' + b.ano, b.loans.recebido, 'sum') + r('Multas recebidas', b.loans.multas) + r('Em atraso (' + b.loans.atrasados + ')', b.loans.valorAtrasado, 'red') + '</div></div>' +
      '<div class="' + p + '-tot"><div><span>Total recebido em ' + b.ano + '</span><small>caixinha + empréstimos</small></div><b>' + brl(b.geral) + '</b></div></section>';
  }
  /* Documento impresso / PDF, com a identidade do app. */
  function printDoc(s, d, mode) {
    var c = CX.curCx(s), t = d.tot, kp = function (k, v, cl) { return '<div class="rp-k ' + cl + '"><span>' + k + '</span><b>' + brl(v) + '</b></div>'; },
      now = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    return '<header class="rp-head"><img src="icons/icon-192.png" alt="" width="54" height="54"><div><div class="rp-brand">Caixinha e Empréstimos</div><h1>Relatório da caixinha</h1></div><div class="rp-who"><b>' + esc(c.nome) + '</b><span>Cota de ' + brl(c.valor) + '</span></div></header>' +
      '<p class="rp-sub">' + esc(CX.rep.title(s, R).replace(/ · [^·]*$/, '')) + '</p>' +
      '<section class="rp-kpis">' + kp('Total recebido', t[3], 'main') + kp('Pagas em dia', t[0], '') + kp('Pagas c/ atraso', t[1], '') + kp('Multas', t[2], 'gold') + kp('Atrasado', t[4], 'red') + kp('Não pago', t[5], 'red') + '</section>' +
      rtable(d, mode, true) +
      (R.bal === '1' ? balHtml(CX.rep.balance(s), 'rp-bal') : '') +
      '<p class="rp-note"><b>Como ler:</b> multas entram no total recebido. Atrasado e não pago são valores ainda a receber.</p>' +
      '<footer class="rp-foot"><span>Gerado em ' + esc(now) + '</span><span>Caixinha e Empréstimos</span></footer>';
  }
  function rtable(d, mode, plain) {
    var z = function (x) { return x ? brl(x) : '–'; };
    return (plain ? '' : '<div class="tw">') + '<table class="rt"><thead><tr><th scope="col">' + (mode === 'mes' ? 'Mês' : 'Membro') + '</th>' + CX.rep.RC.map(function (c) { return '<th scope="col">' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.rows.map(function (r) { return '<tr><td>' + esc(r.l) + '</td>' + r.v.map(function (x) { return '<td>' + z(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '<tr class="t"><td>Total</td>' + d.tot.map(function (x) { return '<td>' + z(x) + '</td>'; }).join('') + '</tr></tbody></table>' + (plain ? '' : '</div>');
  }
  ACT.rel = function () {
    R = { mode: 'cot', scope: 'mes', f: '', bal: '0' };
    ui.panel({
      title: 'Relatório da caixinha', wide: true,
      render: function () {
        var s = S(), c = cx(), d = CX.rep.data(s, R), on = function (k, v) { return '<button type="button" data-p="' + k + ':' + v + '" data-f="' + k + ':' + v + '" aria-pressed="' + (R[k] === v) + '">'; };
        return '<p class="msg">' + esc(CX.rep.title(s, R)) + '</p><div class="seg">' + on('mode', 'cot') + 'Por membro</button>' + on('mode', 'mes') + 'Mês a mês</button></div>' +
          (R.mode === 'cot' ? '<div class="seg">' + on('scope', 'mes') + MN[s.mes] + '</button>' + on('scope', 'ano') + 'Ano ' + s.ano + '</button></div>'
            : '<label for="rf">Membro</label><select id="rf" data-f="rf"><option value="">Todos os membros</option>' + c.pess.map(function (p) { return '<option value="' + esc(p.id) + '"' + (R.f === p.id ? ' selected' : '') + '>' + esc(p.nome) + '</option>'; }).join('') + '</select>') +
          rtable(d, R.mode) + '<p class="note">Multas entram no total recebido. Atrasado e não pago são valores ainda a receber.</p>' +
          '<div class="sec">Balanço no final do PDF e da planilha</div><div class="seg" role="group" aria-label="Balanço">' + on('bal', '0') + 'Sem balanço</button>' + on('bal', '1') + 'Com balanço</button></div>' +
          (R.bal === '1' ? balHtml(CX.rep.balance(s), 'bal') : '<p class="note">Opcional: resumo do ano com caixinha, empréstimos e o total recebido.</p>') +
          '<div class="acts"><button class="btn" type="button" data-p="xls">' + ic('down2', 's') + 'Baixar planilha (Excel)</button><button class="btn g" type="button" data-p="pdf">Imprimir / salvar PDF</button><button class="btn g" type="button" data-p="csv">CSV simples</button><button class="btn t" type="button" data-p="x">Fechar</button></div>';
      },
      onChange: function (t, api) { if (t.id === 'rf') { R.f = t.value; api.draw(); } },
      onAct: function (k, b, api) {
        if (k === 'x') api.close();
        else if (k === 'xls') { ui.download('caixinha-relatorio-' + (R.mode === 'mes' ? 'mes-a-mes-' : 'membros-') + S().ano + '.xls', CX.rep.xls(S(), R, R.bal === '1'), 'application/vnd.ms-excel'); ui.toast('Planilha baixada'); }
        else if (k === 'csv') { ui.download('caixinha-relatorio-' + (R.mode === 'mes' ? 'mes-a-mes-' : 'membros-') + S().ano + '.csv', CX.rep.csv(S(), R), 'text/csv;charset=utf-8'); ui.toast('Planilha baixada'); }
        else if (k === 'pdf') {
          var d = CX.rep.data(S(), R); api.close();
          document.getElementById('printroot').innerHTML = printDoc(S(), d, R.mode);
          setTimeout(function () { window.print(); }, 60);
        } else { var a = k.split(':'); R[a[0]] = a[1]; api.draw(); }
      }
    });
  };

  /* =================== EMPRÉSTIMOS =================== */
  function loanCard(l) {
    var x = Ln.next(l), pd = l.ins.filter(function (i) { return i.paidAt; }).length, a = Ln.insSum(l, true), b = Ln.insSum(l, false), pct = a + b ? a / (a + b) * 100 : 0;
    var h = '<div class="card"><div class="row sp"><div class="grow"><b class="wrap-any">' + esc(l.nome) + '</b><div class="note">' + brl(l.principal) + ' · ' + cmaTxt(l.taxa) + '% ' + (l.tipo === 'monthly' ? 'ao mês' : 'fixo') + ' · ' + (l.n === 1 ? '1x (único)' : l.n + 'x') + (l.acr ? ' · acréscimo ' + brl(l.acr) : '') + '</div></div>' + tagLoan(l) + '</div>';
    if (!l.quit) h += '<div class="row sp mt"><div><div class="note">' + (l.n > 1 ? 'Parcela ' + x.n + '/' + l.n : 'Total a receber') + '</div><b class="amt">' + brl(x.amount) + '</b></div><div class="tr"><div class="note ' + (Ln.isLate(l) ? 'late' : '') + '">' + Ln.dueTxt(x.due) + '</div><b class="' + (Ln.isLate(l) ? 'late' : '') + '">' + fd(x.due) + '</b></div></div>' +
      (l.n > 1 ? '<div class="bar" role="img" aria-label="' + pd + ' de ' + l.n + ' parcelas recebidas"><i data-w="' + pct + '"></i></div><p class="note sm-top">' + pd + ' de ' + l.n + ' parcelas recebidas · faltam ' + brl(b) + '</p>' : '') +
      '<div class="row sm-top"><button class="btn" type="button" data-a="pn" data-id="' + esc(l.id) + '">' + (l.n > 1 ? 'Receber parcela' : 'Receber total') + '</button>' + (l.n === 1 ? '<button class="btn g" type="button" data-a="rn" data-id="' + esc(l.id) + '">Renovar</button>' : '<button class="btn ok" type="button" data-a="qn" data-id="' + esc(l.id) + '">Quitar</button>') + '</div>';
    return h + '<p class="note sm-top">' + (l.hist.length ? 'Recebido: ' + brl(Ln.lrec(l)) : 'Nenhum pagamento ainda') + (l.ren ? ' · ' + plural(l.ren, 'renovação', 'renovações') : '') + '</p><div class="row sm-top">' + (l.quit ? '' : '<button class="btn g sm" type="button" data-a="wl" data-id="' + esc(l.id) + '">' + ic('msg', 's') + 'Cobrar</button>') + '<button class="btn g sm" type="button" data-a="dn" data-id="' + esc(l.id) + '">Detalhes</button></div></div>';
  }
  view.em = function () {
    var s = S(), ab = s.loans.filter(function (l) { return !l.quit; }), qt = s.loans.filter(function (l) { return l.quit; });
    if (A.EM === null) A.EM = ab.length ? 'ativos' : 'novo';
    var sb = function (k, t) { return '<button type="button" data-a="emt" data-k="' + k + '" aria-pressed="' + (A.EM === k) + '">' + t + '</button>'; },
      seg = '<div class="seg" role="group" aria-label="Empréstimos">' + sb('ativos', 'Ativos (' + ab.length + ')') + sb('novo', 'Novo') + sb('quit', 'Quitados (' + qt.length + ')') + '</div>',
      lst = function (a) { return a.slice().sort(function (x, y) { return x.venc.localeCompare(y.venc); }).map(loanCard).join(''); };
    if (A.EM === 'novo') return seg + newLoanForm();
    if (A.EM === 'quit') return seg + (qt.length ? lst(qt) : '<div class="card empty"><div class="fd">Nenhum empréstimo quitado</div><p>Os empréstimos pagos por completo aparecem aqui.</p></div>');
    var rec = r2(u.sum(ab.map(function (l) { return Ln.insSum(l, false); }))), emp = r2(u.sum(ab.map(Ln.outP))), rc = u.sum(s.loans.map(Ln.lrec));
    return seg + '<section class="hero"><div class="k">A receber</div><span class="v">' + brl(rec) + '</span><div class="s">emprestado em aberto: ' + brl(emp) + '</div></section><div class="stats"><div class="stat"><b>' + ab.length + '</b><span>em aberto</span></div><div class="stat d"><b>' + ab.filter(Ln.isLate).length + '</b><span>atrasados</span></div><div class="stat"><b>' + brl(rc) + '</b><span>já recebido</span></div></div>' +
      (ab.length ? lst(ab) : '<div class="card empty"><div class="fd">Nenhum empréstimo ativo</div><p>Registre o primeiro para acompanhar parcelas e vencimentos.</p><button class="btn" type="button" data-a="emt" data-k="novo">Novo empréstimo</button></div>');
  };
  function newLoanForm() {
    var t = u.today(), o = '', nm = {}; for (var n = 1; n <= 12; n++) o += '<option value="' + n + '">' + (n === 1 ? '1x (único)' : n + 'x') + '</option>';
    S().loans.forEach(function (l) { nm[l.nome] = 1; }); A.F1M = false; setTimeout(loanPreview, 0);
    return '<div id="nf"><div class="card"><div class="grid2"><div class="full"><label for="fn">Nome do cliente</label><input id="fn" list="cl" autocomplete="off" maxlength="60" placeholder="Ex.: Maria Souza"><datalist id="cl">' + Object.keys(nm).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>' +
      '<div><label for="fp">WhatsApp</label><input id="fp" type="tel" inputmode="tel" maxlength="24" placeholder="(11) 99999-9999"></div>' +
      '<div><label for="fv">Valor (R$)</label><input id="fv" inputmode="decimal" maxlength="14" placeholder="1.000,00"></div>' +
      '<div><label for="fx">Parcelas</label><select id="fx">' + o + '</select></div>' +
      '<div><label for="fm">Tipo de juros</label><select id="fm"><option value="fixed">Fixo</option><option value="monthly">Ao mês</option></select></div>' +
      '<p class="note full">Fixo: juros uma única vez sobre o valor. Ao mês: juros × número de parcelas.</p>' +
      '<div><label for="fr">Juros (%)</label><input id="fr" inputmode="decimal" maxlength="8" value="15"></div>' +
      '<div><label for="fa">Acréscimo (R$)</label><input id="fa" inputmode="decimal" maxlength="14" placeholder="0,00" disabled></div>' +
      '<div><label for="fz">Emprestado em</label><input id="fz" type="date" value="' + t + '"></div>' +
      '<div><label for="f1">1º vencimento</label><input id="f1" type="date" value="' + u.addM(t, 1) + '"></div></div><div class="field-err" id="nferr" role="alert"></div></div>' +
      '<section class="hero" aria-live="polite"><div class="k">Total a receber</div><span class="v" id="pt">R$ 0,00</span><div class="s" id="ps"></div></section><button class="btn big" type="button" data-a="addL">Registrar empréstimo</button></div>';
  }
  function loanForm() { return { principal: num($('fv').value), rate: num($('fr').value), type: $('fm').value, surv: num($('fa').value), count: +$('fx').value || 1 }; }
  function $(i) { return document.getElementById(i); }
  function loanPreview() {
    var a = $('fa'); if (!a) return; var n = +$('fx').value || 1;
    if (n < 2) { a.disabled = true; a.value = ''; a.placeholder = 'Só a partir de 2x'; } else if (a.disabled) { a.disabled = false; a.value = ''; a.placeholder = '0,00'; }
    var f = loanForm(), c = Ln.calc(f), last = c.amounts[c.n - 1]; $('pt').textContent = brl(c.total);
    $('ps').textContent = f.principal > 0 ? c.n + 'x de ' + brl(c.per) + (c.n > 1 && last !== c.per ? ' (última ' + brl(last) + ')' : '') + ' · juros ' + brl(c.interest) + (c.n >= 2 ? ' · acréscimo ' + brl(c.surcharge) : '') : 'Informe o valor emprestado para ver o cálculo';
  }
  view.nfInput = function (e) {
    var t = e.target; if (!t.closest || !t.closest('#nf')) return;
    if (e.type === 'input' && t.id === 'fn') { var n = t.value.trim().toLowerCase(), p = $('fp'); if (!p.value && n) { var l = S().loans.slice().reverse().find(function (x) { return x.nome.trim().toLowerCase() === n && x.tel; }); if (l) p.value = l.tel; } }
    if (e.type === 'change') { if (t.id === 'f1') A.F1M = true; if (t.id === 'fz' && !A.F1M && t.value) $('f1').value = u.addM(t.value, 1); }
    loanPreview(); var er = $('nferr'); if (er) er.textContent = '';
  };
  ACT.emt = function (b) { A.EM = b.getAttribute('data-k'); A.render(); scrollTo(0, 0); };
  ACT.addL = function () {
    var name = $('fn').value.trim().replace(/\s+/g, ' '), f = loanForm(), c = Ln.calc(f), fz = $('fz').value, f1 = $('f1').value, er = $('nferr');
    var bad = function (m, id) { er.textContent = m; if (id) $(id).focus(); };
    if (!name) return bad('Informe o nome do cliente.', 'fn'); if (f.principal <= 0) return bad('Informe o valor emprestado.', 'fv'); if (f.principal > 1e9) return bad('Valor muito alto.', 'fv');
    if (f.rate < 0 || f.rate > 1000 || f.surv < 0) return bad('Juros e acréscimo devem ser positivos (juros até 1000%).', 'fr');
    if (!u.isoOk(fz) || !u.isoOk(f1)) return bad('Informe as datas.', 'fz'); if (f1 < fz) return bad('O 1º vencimento não pode ser antes da data do empréstimo.', 'f1');
    var l = { id: u.uid(), nome: name.slice(0, 60), tel: $('fp').value.replace(/[^\d+()\-\s]/g, '').trim().slice(0, 24), principal: f.principal, taxa: f.rate, tipo: f.type, acr: c.surcharge, n: c.n, inicio: fz, venc: f1, quit: false, hist: [], ren: 0,
      ins: c.amounts.map(function (a, i) { return { n: i + 1, due: u.addM(f1, i), amount: a, paidAt: null, fee: 0 }; }) };
    S().loans.push(l); A.EM = 'ativos'; A.save(); scrollTo(0, 0); ui.toast('Empréstimo de ' + brl(f.principal) + ' para ' + name + ' registrado');
  };
  function feeSug(due) { return due < u.today() && S().multaRs > 0 ? r2(S().multaRs) : 0; }
  var feeChk = function (v) { return num(v.m) < 0 || num(v.j) < 0 ? 'Os valores não podem ser negativos.' : ''; };
  async function payI(id, n) {
    var l = find(S().loans, id); if (!l) return; var x = l.ins.find(function (i) { return i.n === n; }); if (!x || x.paidAt) return;
    var fee = feeSug(x.due), r = await ui.dialog({ title: l.n > 1 ? 'Receber parcela ' + n + '/' + l.n : 'Receber pagamento', msg: l.nome + ' · ' + brl(x.amount) + ' · vence ' + fd(x.due) + '. Informe a multa em reais, se houver.', fields: [{ l: 'Multa por atraso (R$)', k: 'm', v: fee ? moneyStr(fee) : '0', m: 'decimal', max: 14 }], actions: [{ l: 'Registrar recebimento', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: feeChk });
    if (!r) return; var mu = Math.min(r2(num(r.v.m)), 1e9); x.paidAt = u.today(); x.fee = mu; l.hist.push({ data: u.today(), tipo: 'parcela', n: n, valor: r2(x.amount + mu), multa: mu }); Ln.recomp(l); A.save();
    ui.toast(l.quit ? 'Recebido. Empréstimo quitado' : 'Parcela ' + n + ' recebida');
  }
  ACT.pn = function (b) { var l = find(S().loans, b.getAttribute('data-id')), x = l && Ln.next(l); if (x) payI(l.id, x.n); };
  ACT.rn = async function (b) {
    var l = find(S().loans, b.getAttribute('data-id')); if (!l || l.n !== 1 || l.ins[0].paidAt) return; var x = l.ins[0], j = r2(l.principal * l.taxa / 100), fee = feeSug(x.due);
    var r = await ui.dialog({ title: 'Renovar empréstimo', msg: 'Recebe só os juros e o vencimento passa de ' + fd(x.due) + ' para ' + fd(u.addM(x.due, 1)) + '. O valor emprestado (' + brl(l.principal) + ') continua em aberto.', fields: [{ l: 'Juros recebidos (R$)', k: 'j', v: moneyStr(j), m: 'decimal', max: 14 }, { l: 'Multa por atraso (R$)', k: 'm', v: fee ? moneyStr(fee) : '0', m: 'decimal', max: 14 }], actions: [{ l: 'Registrar renovação', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: function (v) { return feeChk(v) || (num(v.j) + num(v.m) <= 0 ? 'Informe o valor recebido.' : ''); } });
    if (!r) return; var jv = Math.min(r2(num(r.v.j)), 1e9), mu = Math.min(r2(num(r.v.m)), 1e9);
    l.hist.push({ data: u.today(), tipo: 'juros', valor: r2(jv + mu), multa: mu, ref: x.due }); x.due = u.addM(x.due, 1); l.ren = (l.ren || 0) + 1; Ln.recomp(l); A.save(); ui.toast('Renovado. Novo vencimento ' + fd(x.due));
  };
  ACT.qn = async function (b) {
    var l = find(S().loans, b.getAttribute('data-id')); if (!l) return; var ps = l.ins.filter(function (i) { return !i.paidAt; }); if (!ps.length) return;
    var fee = ps.some(function (i) { return i.due < u.today(); }) && S().multaRs > 0 ? r2(S().multaRs) : 0;
    var r = await ui.dialog({ title: 'Quitar empréstimo', msg: 'Restam ' + plural(ps.length, 'parcela', 'parcelas') + ' somando ' + brl(Ln.insSum(l, false)) + '. Informe a multa em reais, se houver.', fields: [{ l: 'Multa por atraso (R$)', k: 'm', v: fee ? moneyStr(fee) : '0', m: 'decimal', max: 14 }], actions: [{ l: 'Quitar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: feeChk });
    if (!r) return; var mu = Math.min(r2(num(r.v.m)), 1e9);
    ps.forEach(function (x, i) { var f = i === 0 ? mu : 0; x.paidAt = u.today(); x.fee = f; l.hist.push({ data: u.today(), tipo: 'parcela', n: x.n, valor: r2(x.amount + f), multa: f }); }); Ln.recomp(l); A.save(); ui.toast('Empréstimo quitado');
  };
  ACT.wl = function (b) {
    var l = find(S().loans, b.getAttribute('data-id')); if (!l) return; var d = u.daysTo(l.venc), x = Ln.next(l);
    ui.openLink(CX.msg.waUrl(l.tel, CX.msg.fill(CX.msg.tpl(S(), 'emp'), { nome: l.nome.split(' ')[0], valor: brl(x ? x.amount : 0), parcela: l.n > 1 && x ? x.n + '/' + l.n : '', principal: brl(l.principal), situacao: d < 0 ? 'venceu dia ' + fd(l.venc) : d === 0 ? 'vence hoje' : 'vence dia ' + fd(l.venc) })));
  };
  ACT.dn = function (b) {
    var id = b.getAttribute('data-id');
    ui.panel({
      title: 'Detalhes do empréstimo',
      render: function () {
        var l = find(S().loans, id); if (!l) return '<p class="msg">Empréstimo não encontrado.</p>';
        var rows = l.ins.map(function (x) {
          var st = x.paidAt ? '<span class="tag">Pago ' + fd(x.paidAt) + (x.fee ? ' · multa ' + brl(x.fee) : '') + '</span>' : x.due < u.today() ? '<span class="tag lt">Atrasada</span>' : '<span class="tag mu">Aberta</span>';
          return '<div class="pe"><div class="grow"><div class="nm">' + (l.n > 1 ? x.n + '/' + l.n + ' · ' : '') + fd(x.due) + '</div><div class="sb">' + brl(x.amount) + ' ' + st + '</div></div><button class="btn g sm" type="button" data-p="' + (x.paidAt ? 'u' : 'p') + x.n + '" data-f="i' + x.n + '">' + (x.paidAt ? 'Desfazer' : 'Receber') + '</button></div>';
        }).join(''), lh = l.hist[l.hist.length - 1];
        return '<p class="msg"><b>' + esc(l.nome) + '</b><br>' + brl(l.principal) + ' · juros ' + cmaTxt(l.taxa) + '% ' + (l.tipo === 'monthly' ? 'ao mês' : 'fixo') + ' · ' + (l.n === 1 ? '1x (único)' : l.n + 'x') + (l.acr ? ' · acréscimo ' + brl(l.acr) : '') + '<br>Emprestado em ' + fd(l.inicio) + (l.ren ? ' · ' + plural(l.ren, 'renovação', 'renovações') : '') + (l.tel ? '<br>WhatsApp ' + esc(l.tel) : '') + '</p>' + rows +
          '<div class="acts">' + (lh && lh.tipo === 'juros' ? '<button class="btn g" type="button" data-p="rr">Desfazer última renovação</button>' : '') + '<button class="btn g" type="button" data-p="ed">Editar nome e WhatsApp</button><button class="btn d" type="button" data-p="del">Excluir empréstimo</button><button class="btn t" type="button" data-p="x">Fechar</button></div>';
      },
      onAct: function (k, b2, api) {
        var l = find(S().loans, id); if (!l) return api.close();
        if (k === 'x') return api.close();
        api.close();
        if (k[0] === 'p') payI(id, +k.slice(1));
        else if (k[0] === 'u') guard(function () { var n = +k.slice(1), x = l.ins.find(function (i) { return i.n === n; }); if (!x) return; x.paidAt = null; x.fee = 0; for (var i = l.hist.length - 1; i >= 0; i--) if (l.hist[i].tipo === 'parcela' && l.hist[i].n === n) { l.hist.splice(i, 1); break; } Ln.recomp(l); A.save(); ui.toast('Pagamento desfeito'); });
        else if (k === 'rr') guard(function () { var h = l.hist[l.hist.length - 1]; if (!h || h.tipo !== 'juros' || !h.ref) return; l.ins[0].due = h.ref; l.ren = Math.max(0, (l.ren || 0) - 1); l.hist.pop(); Ln.recomp(l); A.save(); ui.toast('Renovação desfeita'); });
        else if (k === 'ed') guard(async function () {
          var r = await ui.dialog({ title: 'Editar cliente', fields: [{ l: 'Nome', k: 'n', v: l.nome, max: 60 }, { l: 'WhatsApp', k: 't', t: 'tel', v: l.tel || '', m: 'tel', max: 24 }], actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: function (v) { return v.n ? '' : 'Informe o nome.'; } });
          if (r) { l.nome = r.v.n; l.tel = r.v.t; A.save(); }
        });
        else if (k === 'del') guard(async function () {
          if (await ui.confirm({ title: 'Excluir ' + l.nome + '?', msg: 'O histórico deste empréstimo também será apagado. Isso não pode ser desfeito.', yes: 'Excluir', danger: true, no: 'Voltar' })) { S().loans = S().loans.filter(function (x) { return x.id !== id; }); A.save(); ui.toast('Empréstimo excluído'); }
        });
      }
    });
  };

  /* =================== PAINEL =================== */
  function chart(arr, cls, label) {
    var mx = Math.max.apply(null, arr) || 1, sh = function (v) { return v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v)); };
    return '<div class="chart ' + cls + '" role="img" aria-label="' + esc(label + ': ' + arr.map(function (v, i) { return MN[i] + ' ' + brl(v); }).join(', ')) + '">' + arr.map(function (v, i) { return '<div>' + (v ? '<em>' + sh(v) + '</em>' : '') + '<i data-h="' + Math.max(2, v / mx * 78) + '"></i>' + MN[i][0] + '</div>'; }).join('') + '</div>';
  }
  view.pn = function () {
    var s = S(), y = s.ano, cxm = [], em = []; for (var m = 0; m < 12; m++) { cxm.push(r2(u.sum(s.cxs.map(function (c) { return K.received(c, y, m) + K.mulTot(c, y, m); })))); em.push(0); }
    s.loans.forEach(function (l) { l.hist.forEach(function (h) { if (h.data.slice(0, 4) === String(y)) em[+h.data.slice(5, 7) - 1] += h.valor; }); });
    var ab = s.loans.filter(function (l) { return !l.quit; }), at = u.sum(s.cxs.map(function (c) { return u.sum(c.pess.map(function (p) { var t = 0; for (var m2 = 0; m2 < 12; m2++) t += K.cnt(c, p, y, m2).a; return t; })); })), mulL = 0;
    s.loans.forEach(function (l) { l.hist.forEach(function (h) { if (h.multa && h.data.slice(0, 4) === String(y)) mulL += h.multa; }); });
    return yearBar('ano-', 'ano+') + '<div class="stats"><div class="stat"><b>' + brl(u.sum(cxm)) + '</b><span>caixinhas</span></div><div class="stat"><b>' + brl(r2(u.sum(em))) + '</b><span>empréstimos</span></div><div class="stat w"><b>' + brl(r2(u.sum(ab.map(Ln.outP)))) + '</b><span>na rua</span></div></div>' +
      '<div class="card"><h2 class="h2">Caixinhas: recebido por mês</h2>' + chart(cxm, '', 'Caixinhas recebido por mês em ' + y) + '<p class="note sm-top">' + plural(at, 'cota atrasada', 'cotas atrasadas') + ' em ' + y + ' · multas de empréstimos: ' + brl(r2(mulL)) + '</p></div>' +
      '<div class="card"><h2 class="h2">Empréstimos: recebido por mês</h2>' + chart(em.map(r2), 'gold', 'Empréstimos recebido por mês em ' + y) + '</div>';
  };

  /* =================== AGENDA =================== */
  function hojeCard() {
    var s = S(), H = CX.hoje(s), LS = Ln.watch(s), n = H.length + LS.length,
      h = '<div class="card"><div class="row sp"><div><h2 class="h2 mb0">Hoje</h2><div class="note">' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div></div>' + (n ? '<span class="tag wn">' + n + ' para ver</span>' : '<span class="tag">' + ic('check', 's') + 'Tudo em dia</span>') + '</div>' +
        (n ? '' : '<p class="note sm-top">Nenhuma cobrança para hoje. ' + (s.cxs.some(function (c) { return c.venc; }) ? '' : 'Defina o dia de vencimento da caixinha para ativar os avisos. <button class="lnk" type="button" data-a="cxedit">Definir agora</button>') + '</p>') + '</div>';
    H.forEach(function (g) {
      var tg = g.ph === 'atr' ? '<span class="tag lt">' + ic('alert', 's') + 'Atrasada</span>' : g.ph === 'hoje' ? '<span class="tag wn">Vence hoje</span>' : '<span class="tag">Vence em ' + plural(g.d, 'dia', 'dias') + '</span>';
      h += '<div class="card"><div class="row sp"><div class="grow"><b class="wrap-any">' + esc(g.c.nome) + '</b><div class="note">Cota de ' + MN[g.m] + ' · vence dia ' + (+g.due.slice(8)) + '</div></div>' + tg + '</div><button class="btn big sm-top" type="button" data-a="wg" data-c="' + esc(g.c.id) + '" data-ym="' + g.ym + '">' + ic('msg', 's') + (g.ph === 'atr' ? 'Cobrar o grupo no WhatsApp' : g.ph === 'hoje' ? 'Avisar o grupo: hoje é o dia' : 'Lembrar o grupo no WhatsApp') + '</button><p class="note sm-top">' + plural(g.pend.length, 'membro pendente', 'membros pendentes') + '. Use o botão ao lado do nome para falar só com ele.</p>' +
        g.pend.map(function (e) { return '<div class="pe"><div class="grow"><div class="nm">' + esc(e.p.nome) + '</div><div class="sb">' + plural(e.n, 'cota', 'cotas') + ' · ' + brl(e.n * g.c.valor) + (e.p.tel ? '' : ' · sem WhatsApp salvo') + '</div></div><button class="btn g sm" type="button" data-a="wp" data-c="' + esc(g.c.id) + '" data-ym="' + g.ym + '" data-p="' + esc(e.p.id) + '">' + (g.ph === 'atr' ? 'Cobrar' : 'Avisar') + '</button></div>'; }).join('') + '</div>';
    });
    if (LS.length) h += '<div class="card"><h2 class="h2">Empréstimos</h2>' + LS.map(function (l) { var x = Ln.next(l); return '<div class="pe"><div class="grow"><div class="nm">' + esc(l.nome) + '</div><div class="sb ' + (Ln.isLate(l) ? 'late' : '') + '">' + Ln.dueTxt(l.venc) + ' · ' + (l.n > 1 ? 'parcela ' + x.n + '/' + l.n + ' ' : 'total ') + brl(x.amount) + '</div></div><button class="btn g sm" type="button" data-a="wl" data-id="' + esc(l.id) + '">' + ic('msg', 's') + 'Cobrar</button></div>'; }).join('') + '</div>';
    return h;
  }
  view.ca = function () {
    var s = S(), CA = A.CA, o = new Date(CA.y, CA.m, 1).getDay(), n = new Date(CA.y, CA.m + 1, 0).getDate(), c = '', t = u.today(), cxs = s.cxs.filter(function (x) { return x.venc; }), cd = cxs.map(function (x) { return u.dueIso(CA.y, CA.m, x.venc); });
    ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(function (x) { c += '<div class="h" aria-hidden="true">' + x + '</div>'; }); for (var i = 0; i < o; i++) c += '<span></span>';
    for (var d = 1; d <= n; d++) {
      var iso = CA.y + '-' + u.p2(CA.m + 1) + '-' + u.p2(d), lo = s.loans.some(function (l) { return Ln.dues(l).indexOf(iso) > -1; }), cc = cd.indexOf(iso) > -1;
      c += '<button type="button" data-a="dia" data-d="' + iso + '" aria-pressed="' + (iso === CA.d) + '" class="' + (iso === t ? 't' : '') + '" aria-label="' + d + ' de ' + MN[CA.m] + (iso === t ? ', hoje' : '') + (cc || lo ? ', com vencimento' : '') + '">' + d + ((lo || cc) ? '<span class="dt">' + (cc ? '<i class="c"></i>' : '') + (lo ? '<i class="' + (iso < t ? 'l' : '') + '"></i>' : '') + '</span>' : '') + '</button>';
    }
    var ls = s.loans.filter(function (l) { return Ln.dues(l).indexOf(CA.d) > -1; }), cxl = [];
    cxs.forEach(function (x) { if (u.dueIso(CA.y, CA.m, x.venc) === CA.d) cxl.push({ nome: x.nome, q: K.pending(x, CA.y, CA.m).length, t: x.pess.length }); });
    return hojeCard() + '<div class="card"><div class="year"><button class="ibtn" type="button" data-a="cm-" aria-label="Mês anterior">' + ic('left') + '</button><b>' + MN[CA.m] + ' ' + CA.y + '</b><button class="ibtn" type="button" data-a="cm+" aria-label="Próximo mês">' + ic('right') + '</button></div><div class="cal">' + c + '</div><div class="legend"><span><i></i>cota da caixinha</span><span><i class="g"></i>empréstimo</span></div></div>' +
      '<div class="card"><h2 class="h2">Vencimentos em ' + fd(CA.d) + '</h2>' + cxl.map(function (x) { return '<div class="pe"><div class="grow"><div class="nm">' + esc(x.nome) + '</div><div class="sb">Cota de ' + MN[CA.m] + ' · ' + x.q + ' de ' + x.t + ' pendentes</div></div></div>'; }).join('') +
      ls.map(function (l) { return '<div class="pe"><div class="grow"><div class="nm">' + esc(l.nome) + '</div><div class="sb">' + brl(l.principal) + ' a ' + cmaTxt(l.taxa) + '%</div></div><b>' + brl(Ln.amtOn(l, CA.d)) + '</b></div>'; }).join('') + ((cxl.length || ls.length) ? '' : '<p class="note">Nada vence neste dia.</p>') + '</div>';
  };
  ACT['cm-'] = function () { var C = A.CA; C.m--; if (C.m < 0) { C.m = 11; C.y--; } A.render(); };
  ACT['cm+'] = function () { var C = A.CA; C.m++; if (C.m > 11) { C.m = 0; C.y++; } A.render(); };
  ACT.dia = function (b) { A.CA.d = b.getAttribute('data-d'); A.render(); };
  function secOf(cid, ym) { return CX.hoje(S()).find(function (x) { return x.c.id === cid && x.ym === ym; }); }
  ACT.wg = function (b) { var g = secOf(b.getAttribute('data-c'), b.getAttribute('data-ym')); if (g) ui.openLink(CX.msg.waUrl('', CX.msg.fill(CX.msg.tpl(S(), 'g' + g.ph), CX.msg.vars(g, null)))); };
  ACT.wp = function (b) { var g = secOf(b.getAttribute('data-c'), b.getAttribute('data-ym')); if (!g) return; var e = g.pend.find(function (x) { return x.p.id === b.getAttribute('data-p'); }); if (e) ui.openLink(CX.msg.waUrl(e.p.tel, CX.msg.fill(CX.msg.tpl(S(), g.ph), CX.msg.vars(g, e)))); };

  /* =================== AJUSTES =================== */
  function secCard() {
    var h = '<div class="card"><h2>Segurança</h2>';
    if (!V.supported) return h + '<div class="alert wn">' + ic('alert') + '<span>O PIN e a criptografia só funcionam em endereço https (ou localhost). Abra a versão publicada do app.</span></div></div>';
    if (!V.hasVault()) return h + '<p class="lead">Crie um PIN de 6 dígitos. Com ele, os dados deste aparelho ficam <b>criptografados</b>.</p><div class="alert wn">' + ic('alert') + '<span>Sem PIN, qualquer pessoa com acesso ao navegador deste aparelho consegue ler os dados.</span></div><button class="btn" type="button" data-a="pinon">' + ic('shield', 's') + 'Criar PIN</button></div>';
    var weak = V.pinLen() < 6;
    return h + '<p class="tag">' + ic('lock', 's') + 'PIN ativo · dados criptografados</p>' + (weak ? '<div class="alert wn sm-top">' + ic('alert') + '<span>Seu PIN tem ' + V.pinLen() + ' dígitos. Troque por um de 6 para proteger melhor.</span></div>' : '') +
      '<p class="lead sm-top">O app bloqueia sozinho depois de 2 minutos fora da tela ou 5 minutos sem uso. Excluir, desfazer e remover o PIN pedem a confirmação do PIN.</p><div class="row"><button class="btn g" type="button" data-a="lock">' + ic('lock', 's') + 'Bloquear agora</button><button class="btn g" type="button" data-a="pinnew">Trocar PIN</button><button class="btn d" type="button" data-a="pinoff">Remover PIN</button></div></div>';
  }
  function tplCard() {
    var b = function (k, l) { return '<button class="btn g sm" type="button" data-a="tpl" data-k="' + k + '">' + l + '</button>'; };
    return '<div class="card"><h2>Mensagens do WhatsApp</h2><p class="lead">Textos usados nos botões da aba Agenda. Toque para editar.</p><div class="sec mb0">Para o grupo</div><div class="row">' + b('glem', 'Lembrete') + b('ghoje', 'Dia do pagamento') + b('gatr', 'Cobrar atraso') + '</div><div class="sec mb0">Para um membro</div><div class="row">' + b('lem', 'Lembrete') + b('hoje', 'Dia do pagamento') + b('atr', 'Cobrar atraso') + '</div><div class="sec mb0">Empréstimos</div><div class="row">' + b('emp', 'Cobrança de pagamento') + '</div></div>';
  }
  view.cf = function () {
    var s = S();
    return secCard() + '<div class="card">' + CX.drive.box() + '</div>' +
      '<div class="card"><h2>Multa por atraso</h2><div class="set-row"><div><div class="t">Valor sugerido</div><div class="d">Em reais. É sugerido ao receber depois do vencimento; ajuste aqui.</div></div><button class="btn g" type="button" data-a="multa">' + brl(s.multaRs || 0) + '</button></div></div>' + tplCard() +
      '<div class="card"><h2>Backup</h2>' + (A.backupStale() ? '<div class="alert wn">' + ic('alert') + '<span><b>Faz mais de 10 dias sem backup.</b> Exporte um arquivo ou conecte o Google Drive.</span></div>' : '') + '<p class="lead">Tudo é salvo neste aparelho a cada toque. Exporte um arquivo de segurança de vez em quando. O arquivo normal contém os dados reais em texto aberto: guarde em lugar seguro ou use a opção com senha.</p><div class="row"><button class="btn" type="button" data-a="exp">' + ic('down2', 's') + 'Exportar backup</button><button class="btn g" type="button" data-a="expenc">' + ic('lock', 's') + 'Exportar com senha</button><button class="btn g" type="button" data-a="imp">' + ic('up2', 's') + 'Importar backup</button></div></div>' + (view.rfEntry ? view.rfEntry() : '');
  };
  ACT.multa = async function () {
    var r = await ui.dialog({ title: 'Multa padrão por atraso', msg: 'Valor em reais sugerido quando o pagamento vem depois do vencimento (nas cotas, vale por cota). Use 0 para não sugerir.', fields: [{ l: 'Multa (R$)', k: 'v', v: moneyStr(S().multaRs), m: 'decimal', max: 12 }], actions: [{ l: 'Salvar', k: 'ok' }, { l: 'Cancelar', k: null, c: 'g' }], check: function (v) { return num(v.v) < 0 ? 'O valor não pode ser negativo.' : ''; } });
    if (r) { S().multaRs = Math.min(1e9, Math.max(0, r2(num(r.v.v)))); A.save(); }
  };
  ACT.tpl = function (b) {
    var k = b.getAttribute('data-k'), s = S(), kd = k === 'emp' ? 'e' : k.charAt(0) === 'g' ? 'g' : 'i',
      PH = { g: '{caixinha}, {mes}, {dia}, {valor} e {lista} (quem ainda falta)', i: '{nome}, {caixinha}, {mes}, {dia}, {valor}, {cotas} e {total}', e: '{nome}, {valor}, {situacao}, {parcela} e {principal}' },
      ex = { nome: 'Ana', caixinha: 'Caixinha', mes: 'novembro', dia: '10', valor: 'R$ 50,00', cotas: '2', total: 'R$ 100,00', lista: '• Ana – 1 cota (R$ 50,00)\n• Bruno – 2 cotas (R$ 100,00)', situacao: 'vence hoje', parcela: '3/12', principal: 'R$ 1.000,00' };
    ui.panel({
      title: CX.msg.TN[k],
      render: function () { return '<p class="msg">Use ' + PH[kd] + '.</p><label for="tt">Mensagem</label><textarea id="tt" data-f="tt" rows="8" maxlength="1500">' + esc(CX.msg.tpl(s, k)) + '</textarea><div class="tpl-ex" id="tx" aria-live="polite"></div><div class="acts"><button class="btn" type="button" data-p="s">Salvar</button><button class="btn g" type="button" data-p="d">Restaurar padrão</button><button class="btn t" type="button" data-p="x">Cancelar</button></div>'; },
      onInput: function (t) { if (t.id === 'tt') document.getElementById('tx').textContent = 'Exemplo:\n' + CX.msg.fill(t.value, ex); },
      onAct: function (a, b2, api) {
        if (a === 'x') return api.close();
        var ta = document.getElementById('tt'); s.msgs = s.msgs || {};
        if (a === 's') { var v = ta.value.trim().slice(0, 1500); if (v && v !== CX.msg.TD[k]) s.msgs[k] = v; else delete s.msgs[k]; } else delete s.msgs[k];
        api.close(); A.save(); ui.toast('Mensagem salva');
      }
    });
    var t = document.getElementById('tt'); if (t) document.getElementById('tx').textContent = 'Exemplo:\n' + CX.msg.fill(t.value, ex);
  };
})();
