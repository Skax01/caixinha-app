/* core.js — lógica pura (sem DOM): utilidades, validação do estado, migração e cálculos.
   Tudo que vem de fora (localStorage, arquivo de backup, Google Drive) passa por CX.sanitize()
   antes de virar estado: tipos, limites e IDs são forçados, então um backup adulterado não
   consegue injetar HTML nem chaves perigosas. */
(function (root) {
  'use strict';
  var CX = root.CX = root.CX || {};

  /* ---------- utilidades ---------- */
  var MN = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var r2 = function (v) { v = +v; return isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var brl = function (n) { return (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var comma = function (n) { return String(n).replace('.', ','); };
  var clock = function () { return CX.clock ? CX.clock() : new Date(); };

  function today() { var t = clock(); return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()); }
  function isoOk(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
    var a = s.slice(0, 10).split('-').map(Number), d = new Date(Date.UTC(a[0], a[1] - 1, a[2]));
    return a[0] > 1999 && a[0] < 2200 && d.getUTCMonth() === a[1] - 1 && d.getUTCDate() === a[2];
  }
  function fd(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }
  function addM(iso, m) {
    var a = iso.split('-').map(Number), t = a[1] - 1 + m, ny = a[0] + Math.floor(t / 12), nm = ((t % 12) + 12) % 12,
      last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return ny + '-' + p2(nm + 1) + '-' + p2(Math.min(a[2], last));
  }
  function dueIso(y, m, d) { return y + '-' + p2(m + 1) + '-' + p2(Math.min(d, new Date(y, m + 1, 0).getDate())); }
  function daysTo(iso) { return Math.round((new Date(iso + 'T12:00') - new Date(today() + 'T12:00')) / 864e5); }
  /* aceita "1.234,56", "1234.56", "R$ 10", etc. */
  function num(s) {
    s = String(s == null ? '' : s).replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    var c = s.lastIndexOf(','), p = s.lastIndexOf('.'), v;
    if (c > -1 && p > -1) v = c > p ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s.replace(/,/g, ''));
    else if (c > -1) v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) v = parseFloat(s.replace(/\./g, ''));
    else v = parseFloat(s);
    return isFinite(v) ? v : 0;
  }
  function uid() {
    var c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var a = new Uint8Array(16); c.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return p2(b.toString(16)); }).join('');
  }
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }

  /* ---------- sanitização ---------- */
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/, YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
  function sstr(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 80); }
  function smsg(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max || 1500); }
  function sint(v, lo, hi, d) { v = Math.floor(+v); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); }
  function sflt(v, lo, hi, d) { v = +v; if (!isFinite(v)) v = d; return r2(Math.min(hi, Math.max(lo, v))); }
  function smoney(v) { return sflt(v, 0, 1e9, 0); }
  function sdate(v, d) { return isoOk(v) ? v.slice(0, 10) : d; }
  function sid(v) { return typeof v === 'string' && ID_RE.test(v) ? v : null; }
  function stel(v) { return String(v == null ? '' : v).replace(/[^\d+()\-\s]/g, '').trim().slice(0, 24); }
  var HIST = { juros: 1, parcela: 1, 'quitação': 1, 'amortização': 1 };

  function spag(v) {
    if (v === 'p' || v === 'pa' || v === 'a') return v;
    if (obj(v)) { var o = { p: sint(v.p, 0, 1000, 0), pa: sint(v.pa, 0, 1000, 0), a: sint(v.a, 0, 1000, 0) }; return o.p || o.pa || o.a ? o : null; }
    return null;
  }

  function sanitizeCx(raw, usedIds) {
    var c = { id: sid(raw.id), nome: sstr(raw.nome, 60) || 'Caixinha', valor: sflt(raw.valor, 0.01, 1e7, 50), venc: sint(raw.venc, 0, 31, 0), aviso: sint(raw.aviso, 0, 10, 2), pess: [], pag: {}, mul: {} };
    if (!c.id || usedIds[c.id]) c.id = uid();
    usedIds[c.id] = 1;
    var remap = Object.create(null), seen = Object.create(null);
    (Array.isArray(raw.pess) ? raw.pess : []).slice(0, 500).forEach(function (p) {
      if (!obj(p)) return;
      var old = typeof p.id === 'string' ? p.id : '', id = sid(p.id);
      if (!id || seen[id]) { id = uid(); if (old && !seen[old] && !remap[old]) remap[old] = id; }
      seen[id] = 1;
      c.pess.push({ id: id, nome: sstr(p.nome, 60) || 'Sem nome', apelido: sstr(p.apelido, 30), cotas: sint(p.cotas, 0, 1000, 1), tel: stel(p.tel), desde: /^\d{4}-(0[1-9]|1[0-2])$/.test(p.desde) ? p.desde : '' });
    });
    var ids = Object.create(null); c.pess.forEach(function (p) { ids[p.id] = 1; });
    function key(k) {
      var i = k.lastIndexOf('|'), m = i > 0 && YM_RE.exec(k.slice(i + 1)); if (!m) return null;
      var raw = k.slice(0, i), pid = remap[raw] || raw; if (!ids[pid]) return null;
      return pid + '|' + m[1] + '-' + m[2];
    }
    if (obj(raw.pag)) Object.keys(raw.pag).forEach(function (k) { var kk = key(k), v = spag(raw.pag[k]); if (kk && v) c.pag[kk] = v; });
    if (obj(raw.mul)) Object.keys(raw.mul).forEach(function (k) { var kk = key(k), v = smoney(raw.mul[k]); if (kk && v > 0) c.mul[kk] = v; });
    return c;
  }

  /* Empréstimos do modelo antigo (juros por ciclo / parcelas) viram o modelo atual (lista de parcelas). */
  function legacySched(l) {
    var n = l.par, out = [], sal = l.principal, am = r2((l.p0 || l.principal) / n), ac = l.acr || 0, acp = r2(ac / n),
      used = l.hist.reduce(function (s, h) { return s + (+h.acr || 0); }, 0), got = 0;
    for (var i = (l.pago || 0) + 1; i <= n; i++) {
      var a = i === n ? sal : Math.min(am, sal), j = r2(sal * l.taxa / 100), c = i === n ? Math.max(0, r2(ac - used - got)) : acp;
      got += c; out.push({ i: i, total: r2(a + j + c) }); sal = r2(sal - a);
    }
    return out;
  }
  function legacyToNew(l) {
    var prin = smoney(l.principal), taxa = sflt(l.taxa, 0, 1000, 0), par = sint(l.par, 1, 12, 1), acr = smoney(l.acr),
      inicio = sdate(l.inicio, today()), venc = sdate(l.venc, addM(inicio, 1)), quit = !!l.quit,
      hist = (Array.isArray(l.hist) ? l.hist : []).filter(obj),
      out = { id: l.id, nome: l.nome, tel: l.tel, taxa: taxa, tipo: 'fixed', acr: acr, inicio: inicio, venc: venc, quit: quit, ren: 0, hist: hist, ins: [] };
    var lastD = hist.length ? sdate(hist[hist.length - 1].data, today()) : today();
    if (par > 1) {
      var p0 = smoney(l.p0) || prin, pago = sint(l.pago, 0, par, 0), byN = {};
      hist.forEach(function (h) { if (h.tipo === 'parcela') byN[sint(h.n, 1, par, 0)] = h; });
      var rest = quit ? [] : legacySched({ principal: prin, p0: p0, taxa: taxa, acr: acr, par: par, pago: pago, hist: hist });
      out.principal = p0;
      for (var i = 1; i <= par; i++) {
        var due = addM(venc, i - pago - 1);
        if (i <= pago || quit) {
          var h = byN[i], fee = h ? smoney(h.multa) : 0;
          out.ins.push({ n: i, due: h && isoOk(h.ref) ? h.ref : due, amount: h ? r2(Math.max(0, smoney(h.valor) - fee)) : 0, paidAt: h ? sdate(h.data, lastD) : lastD, fee: fee });
        } else out.ins.push({ n: i, due: due, amount: rest[i - pago - 1].total, paidAt: null, fee: 0 });
      }
    } else {
      out.principal = prin; out.ren = hist.filter(function (h) { return h.tipo === 'juros'; }).length;
      var q = hist.filter(function (h) { return h.tipo === 'quitação'; }).pop();
      out.ins.push({ n: 1, due: venc, amount: q ? r2(Math.max(0, smoney(q.valor) - smoney(q.multa))) : r2(prin + prin * taxa / 100 + acr), paidAt: quit ? lastD : null, fee: q ? smoney(q.multa) : 0 });
    }
    return out;
  }

  function sanitizeLoan(raw) {
    if (!obj(raw)) return null;
    if (!Array.isArray(raw.ins)) raw = legacyToNew(raw);
    var l = {
      id: sid(raw.id) || uid(), nome: sstr(raw.nome, 60) || 'Sem nome', tel: stel(raw.tel),
      principal: smoney(raw.principal), taxa: sflt(raw.taxa, 0, 1000, 0), tipo: raw.tipo === 'monthly' ? 'monthly' : 'fixed',
      acr: smoney(raw.acr), inicio: sdate(raw.inicio, today()), venc: sdate(raw.venc, today()), quit: false, ren: sint(raw.ren, 0, 999, 0), hist: [], ins: []
    };
    raw.ins.slice(0, 36).forEach(function (x, i) {
      if (!obj(x)) return;
      l.ins.push({ n: i + 1, due: sdate(x.due, l.venc), amount: smoney(x.amount), paidAt: x.paidAt ? sdate(x.paidAt, today()) : null, fee: smoney(x.fee) });
    });
    if (!l.ins.length) return null;
    (Array.isArray(raw.hist) ? raw.hist : []).slice(0, 500).forEach(function (h) {
      if (!obj(h) || !HIST[h.tipo]) return;
      var o = { data: sdate(h.data, today()), tipo: h.tipo, valor: smoney(h.valor), multa: smoney(h.multa) };
      if (h.n != null) o.n = sint(h.n, 1, 36, 1);
      if (isoOk(h.ref)) o.ref = h.ref.slice(0, 10);
      l.hist.push(o);
    });
    l.n = l.ins.length;
    recomp(l);
    return l;
  }

  /* ---------- rifas ---------- */
  function sanitizeRifa(raw, cxById, used) {
    if (!obj(raw)) return null;
    var r = { id: sid(raw.id), cx: null, nome: sstr(raw.nome, 60) || 'Rifa', data: sdate(raw.data, today()), valor: smoney(raw.valor), ini: sint(raw.ini, 0, 9999, 1), total: sint(raw.total, 2, 2000, 2),
      prem: [], uni: !!raw.uni, mult: sint(raw.mult, 1, 50, 2), st: 'a', vend: [], ganh: [], hash: /^[0-9a-f]{64}$/.test(raw.hash) ? raw.hash : '', criadoEm: sdate(raw.criadoEm, today()) };
    if (!r.id || used[r.id]) r.id = uid();
    used[r.id] = 1;
    var cx = typeof raw.cx === 'string' && cxById[raw.cx] ? cxById[raw.cx] : null, pess = Object.create(null);
    r.cx = cx ? cx.id : null;
    if (cx) cx.pess.forEach(function (p) { pess[p.id] = p; });
    (Array.isArray(raw.prem) ? raw.prem : []).slice(0, 10).forEach(function (p) { p = sstr(p, 60); if (p) r.prem.push(p); });
    if (!r.prem.length) r.prem = ['Prêmio'];
    var seen = Object.create(null), end = r.ini + r.total;
    (Array.isArray(raw.vend) ? raw.vend : []).slice(0, 2000).forEach(function (v) {
      if (!obj(v)) return;
      var n = Math.floor(+v.n); if (!isFinite(n) || n < r.ini || n >= end || seen[n]) return;
      var pid = typeof v.pid === 'string' && pess[v.pid] ? v.pid : null, nm = sstr(v.nm, 60) || (pid ? pess[pid].nome : '');
      if (!pid && !nm) return;
      seen[n] = 1;
      r.vend.push({ n: n, pid: pid, nm: nm, tel: stel(v.tel), ext: !pid, resp: typeof v.resp === 'string' && pess[v.resp] ? v.resp : pid });
    });
    r.vend.sort(function (a, b) { return a.n - b.n; });
    var sold = Object.create(null), pos = Object.create(null), who = Object.create(null); r.vend.forEach(function (v) { sold[v.n] = v; });
    (Array.isArray(raw.ganh) ? raw.ganh : []).slice(0, 10).forEach(function (g) {
      if (!obj(g)) return;
      var n = Math.floor(+g.n), ps = Math.floor(+g.pos), v = sold[n];
      if (!v || !isFinite(ps) || ps < 1 || ps > r.prem.length || pos[ps] || r.ganh.some(function (x) { return x.n === n; })) return;
      var key = v.pid || v.nm.toLowerCase(); if (r.uni && who[key]) return;
      pos[ps] = 1; who[key] = 1;
      r.ganh.push({ pos: ps, n: n, pid: v.pid, nm: v.nm, premio: sstr(g.premio, 60) || r.prem[ps - 1], at: sstr(g.at, 30), rnd: sint(g.rnd, 0, 4294967295, 0), pool: sint(g.pool, 0, 2000, 0) });
    });
    r.ganh.sort(function (a, b) { return a.pos - b.pos; });
    r.st = r.ganh.length >= r.prem.length ? 's' : raw.st === 'e' ? 'e' : 'a';
    return r;
  }

  var MSG_KEYS = { lem: 1, hoje: 1, atr: 1, glem: 1, ghoje: 1, gatr: 1, emp: 1 };

  function blank() {
    var t = clock(), id = uid();
    return { v: 2, ano: t.getFullYear(), mes: t.getMonth(), multaRs: 0, msgs: {}, cur: id, loans: [], rifas: [], adm: null,
      cxs: [{ id: id, nome: 'Minha caixinha', valor: 50, venc: 0, aviso: 2, pess: [], pag: {}, mul: {} }] };
  }

  function sanitize(raw) {
    var t = clock(), S = blank();
    if (!obj(raw)) return S;
    var used = Object.create(null), list = [];
    if (Array.isArray(raw.cxs) && raw.cxs.length) list = raw.cxs.filter(obj);
    else if (Array.isArray(raw.pess)) list = [{ id: raw.cx, nome: 'Minha caixinha', valor: raw.valor, venc: raw.venc, aviso: raw.aviso, pess: raw.pess, pag: raw.pag, mul: raw.mul }];
    var oldCur = raw.cur || raw.cx;
    if (list.length) {
      S.cxs = list.slice(0, 20).map(function (c) { var n = sanitizeCx(c, used); n._old = c.id; return n; });
      var cur = S.cxs.find(function (c) { return c._old === oldCur; }) || S.cxs[0];
      S.cur = cur.id; var byOld = Object.create(null);
      S.cxs.forEach(function (c) { if (typeof c._old === 'string') byOld[c._old] = c; byOld[c.id] = byOld[c.id] || c; delete c._old; });
      var usedR = Object.create(null);
      S.rifas = (Array.isArray(raw.rifas) ? raw.rifas : []).slice(0, 100).map(function (r) { return sanitizeRifa(r, byOld, usedR); }).filter(Boolean);
    }
    S.ano = sint(raw.ano, 2000, 2199, t.getFullYear()); S.mes = sint(raw.mes, 0, 11, t.getMonth());
    S.multaRs = smoney(raw.multaRs);
    var A0 = raw.adm; /* registro do PIN do administrador: só o hash (sal + PBKDF2), nunca o PIN */
    if (obj(A0) && /^[A-Za-z0-9+\/=]{16,64}$/.test(A0.s) && /^[A-Za-z0-9+\/=]{32,88}$/.test(A0.h)) S.adm = { s: A0.s, h: A0.h, it: sint(A0.it, 100000, 2000000, 310000) };
    if (obj(raw.msgs)) Object.keys(raw.msgs).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(MSG_KEYS, k)) { var m = smsg(raw.msgs[k]); if (m) S.msgs[k] = m; } });
    S.loans = (Array.isArray(raw.loans) ? raw.loans : []).slice(0, 500).map(sanitizeLoan).filter(Boolean);
    return S;
  }

  /* Lê um arquivo de backup (texto) e devolve o estado já validado. Lança erro se não for um backup. */
  function parseBackup(txt) {
    if (typeof txt !== 'string' || txt.length > 5e6) throw new Error('tamanho');
    var d = JSON.parse(txt), s = obj(d) && obj(d.state) ? d.state : d;
    if (!obj(s) || !(Array.isArray(s.cxs) || Array.isArray(s.pess)) || !Array.isArray(s.loans)) throw new Error('formato');
    return sanitize(s);
  }
  /* O hash do PIN do administrador não vai para o arquivo de backup (um PIN de 6 dígitos é fácil de quebrar a partir do hash). */
  function backupText(S) { var st = Object.assign({}, S); delete st.adm; return JSON.stringify({ app: 'caixinha', version: 2, exportedAt: new Date().toISOString(), state: st }, null, 1); }

  /* ---------- caixinha: cotas, status, multas ---------- */
  function pk(pid, y, m) { return pid + '|' + y + '-' + p2(m + 1); }
  function autoLate(c, y, m) { return c.venc > 0 && dueIso(y, m, c.venc) < today(); }
  /* a pessoa já fazia parte da caixinha nesse mês? (sem "desde" = sempre, como nos dados antigos) */
  function ativo(p, y, m) { return !p.desde || (y + '-' + p2(m + 1)) >= p.desde; }
  function cnt(c, p, y, m) {
    var v = c.pag[pk(p.id, y, m)], n = ativo(p, y, m) ? p.cotas : 0, o = { np: 0, p: 0, pa: 0, a: 0 };
    if (v && typeof v === 'object') { o.p = Math.min(n, v.p || 0); o.pa = Math.min(n - o.p, v.pa || 0); o.a = Math.min(n - o.p - o.pa, v.a || 0); o.np = n - o.p - o.pa - o.a; }
    else if (v) o[v] = n; else o.np = n;
    if (o.np > 0 && autoLate(c, y, m)) { o.a += o.np; o.np = 0; }
    return o;
  }
  function stOf(c, p, y, m) { var v = c.pag[pk(p.id, y, m)]; return v && typeof v === 'object' ? 'mix' : (v || (autoLate(c, y, m) ? 'a' : 'np')); }
  function cotas(c, y, m) { return sum(c.pess.map(function (p) { return y == null || ativo(p, y, m) ? p.cotas : 0; })); }
  function received(c, y, m) { return r2(sum(c.pess.map(function (p) { var k = cnt(c, p, y, m); return (k.p + k.pa) * c.valor; }))); }
  function mulOf(c, p, y, m) { var v = c.mul[pk(p.id, y, m)]; return v > 0 && cnt(c, p, y, m).pa > 0 ? v : 0; }
  function mulTot(c, y, m) { return r2(sum(c.pess.map(function (p) { return mulOf(c, p, y, m); }))); }
  function pending(c, y, m) { return c.pess.filter(function (p) { var k = cnt(c, p, y, m); return k.np + k.a > 0; }); }
  function lateP(c, y, m) { return c.pess.filter(function (p) { return cnt(c, p, y, m).a > 0; }); }

  /* ---------- empréstimos ---------- */
  function calcL(o) {
    var n = sint(o.count, 1, 12, 1), rt = (o.rate || 0) / 100 * (o.type === 'monthly' ? n : 1), interest = r2(o.principal * rt),
      sur = n >= 2 ? r2(o.surv || 0) : 0, total = r2(o.principal + interest + sur), per = Math.floor(total / n * 100) / 100, am = [];
    for (var i = 0; i < n; i++) am.push(i === n - 1 ? r2(total - per * (n - 1)) : per);
    return { n: n, interest: interest, surcharge: sur, total: total, per: per, amounts: am };
  }
  function nextI(l) { return l.ins.find(function (i) { return !i.paidAt; }) || null; }
  function insSum(l, paid) { return r2(sum(l.ins.filter(function (i) { return paid ? !!i.paidAt : !i.paidAt; }).map(function (i) { return i.amount; }))); }
  function recomp(l) {
    var x = nextI(l); l.quit = !x;
    l.venc = x ? x.due : (l.ins.length ? l.ins[l.ins.length - 1].due : l.venc);
  }
  function outP(l) { if (l.quit) return 0; var a = insSum(l, true), b = insSum(l, false); return a + b ? r2(l.principal * b / (a + b)) : 0; }
  function lrec(l) { return r2(sum(l.hist.map(function (h) { return h.valor; }))); }
  function isLate(l) { return !l.quit && l.venc < today(); }
  function dues(l) { return l.quit ? [] : l.ins.filter(function (i) { return !i.paidAt; }).map(function (i) { return i.due; }); }
  function amtOn(l, iso) { var x = l.ins.find(function (i) { return !i.paidAt && i.due === iso; }); return x ? x.amount : 0; }
  function dueTxt(iso) {
    var d = daysTo(iso);
    return d < 0 ? 'Venceu há ' + (-d) + (d === -1 ? ' dia' : ' dias') : d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : 'Vence em ' + d + ' dias';
  }
  function loansToWatch(S) { return S.loans.filter(function (l) { return !l.quit && daysTo(l.venc) <= 2; }); }

  /* ---------- avisos de hoje ---------- */
  function hoje(S) {
    var t = clock(), y0 = t.getFullYear(), m0 = t.getMonth(), out = [];
    S.cxs.forEach(function (c) {
      if (!c.venc) return;
      for (var back = 3; back >= 0; back--) {          // até 3 meses anteriores ainda em aberto + o mês atual
        var mm = m0 - back, y = y0; while (mm < 0) { mm += 12; y--; }
        var ym = y + '-' + p2(mm + 1);
        /* mês anterior só entra se alguém já foi lançado nele (evita cobrar meses em que o app ainda não era usado) */
        if (back > 0 && !Object.keys(c.pag).some(function (k) { return k.slice(-7) === ym; })) continue;
        var due = dueIso(y, mm, c.venc), d = daysTo(due), ph = d < 0 ? 'atr' : d === 0 ? 'hoje' : d <= c.aviso ? 'lem' : null;
        if (!ph) continue;
        var pend = c.pess.map(function (p) { var q = cnt(c, p, y, mm); return { p: p, n: q.np + q.a }; }).filter(function (x) { return x.n > 0; });
        if (pend.length) out.push({ c: c, ph: ph, d: d, due: due, m: mm, y: y, ym: ym, pend: pend });
      }
    });
    return out;
  }

  /* ---------- mensagens do WhatsApp ---------- */
  var TN = { lem: 'Membro · lembrete antes do vencimento', hoje: 'Membro · dia do pagamento', atr: 'Membro · cobrança de atraso',
    glem: 'Grupo · lembrete antes do vencimento', ghoje: 'Grupo · dia do pagamento', gatr: 'Grupo · cobrança de atraso', emp: 'Empréstimo · cobrança' };
  var TD = {
    lem: 'Oi, {nome}! 👋 Lembrete da {caixinha}: a cota de {mes} ({valor} por cota) vence dia {dia}. Se ainda não pagou, aproveite para se organizar. Obrigado! 🙏',
    hoje: 'Bom dia, {nome}! ☀️ Hoje, dia {dia}, é o dia de pagar a cota de {mes} da {caixinha}: {valor} por cota. Depois de pagar, é só avisar por aqui. Obrigado! 🙏',
    atr: 'Oi, {nome}! Tudo bem? A cota de {mes} da {caixinha} ({total}) venceu dia {dia} e ainda não consta como paga. Consegue acertar hoje? Qualquer dúvida me avisa. 🙏',
    glem: 'Pessoal, lembrete! 👋 A cota de {mes} da {caixinha} ({valor} por cota) vence dia {dia}.\n\nAinda não consta pagamento de:\n{lista}\n\nQuem puder, já se organize. Obrigado! 🙏',
    ghoje: 'Bom dia, pessoal! ☀️ Hoje, dia {dia}, é o dia de pagar a cota de {mes} da {caixinha}: {valor} por cota.\n\nAinda faltam:\n{lista}\n\nDepois de pagar, é só avisar por aqui. Obrigado! 🙏',
    gatr: 'Pessoal, atenção! 📢 A cota de {mes} da {caixinha} venceu dia {dia} e ainda faltam:\n{lista}\n\nQuem puder acertar hoje, me avise por aqui. Obrigado! 🙏',
    emp: 'Oi, {nome}! Passando para lembrar do pagamento ({valor}) do empréstimo, que {situacao}. Pode me confirmar quando fizer? Obrigado! 🙏'
  };
  function tpl(S, k) { return (S.msgs && S.msgs[k]) || TD[k]; }
  function fill(t, v) { return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  function msgVars(s, e) {
    return { nome: e ? e.p.nome.split(' ')[0] : 'pessoal', caixinha: s.c.nome, mes: MN[s.m].toLowerCase(), dia: String(+s.due.slice(8)), valor: brl(s.c.valor),
      cotas: e ? e.n : '', total: brl(e ? e.n * s.c.valor : s.c.valor),
      lista: s.pend.map(function (x) { return '• ' + x.p.nome + ' – ' + x.n + (x.n === 1 ? ' cota' : ' cotas') + ' (' + brl(x.n * s.c.valor) + ')'; }).join('\n') };
  }
  function waUrl(tel, txt) {
    var d = String(tel || '').replace(/\D/g, ''); if (d && d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(txt);
  }

  /* ---------- relatório ---------- */
  var RC = ['Pagas em dia', 'Pagas c/ atraso', 'Multas', 'Total recebido', 'Atrasado', 'Não pago'];
  function rlin(c, p, y, m) {
    var k = cnt(c, p, y, m), v = c.valor, t = clock(), fut = y > t.getFullYear() || (y === t.getFullYear() && m > t.getMonth());
    return [k.p * v, k.pa * v, mulOf(c, p, y, m), 0, k.a * v, fut ? 0 : k.np * v];
  }
  function racc(c, ps, y, ms) {
    var v = [0, 0, 0, 0, 0, 0];
    ps.forEach(function (p) { ms.forEach(function (m) { var x = rlin(c, p, y, m); for (var i = 0; i < 6; i++) v[i] += x[i]; }); });
    v[3] = v[0] + v[1] + v[2]; return v.map(r2);
  }
  function rdata(S, R) {
    var c = curCx(S), y = S.ano, all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ms = R.mode === 'mes' || R.scope === 'ano' ? all : [S.mes],
      ps = R.mode === 'mes' && R.f ? c.pess.filter(function (p) { return p.id === R.f; }) : c.pess.filter(function (p) { return p.cotas > 0; }), rows = [];
    if (R.mode === 'mes') ms.forEach(function (m) { rows.push({ l: MN[m], v: racc(c, ps, y, [m]) }); });
    else ps.forEach(function (p) { rows.push({ l: p.nome + (p.cotas > 1 ? ' (' + p.cotas + ' cotas)' : ''), v: racc(c, [p], y, ms) }); });
    return { rows: rows, tot: racc(c, ps, y, ms) };
  }
  function rtit(S, R) {
    var c = curCx(S), p = c.pess.find(function (x) { return x.id === R.f; });
    return (R.mode === 'mes' ? 'Mês a mês · ' + S.ano + (p ? ' · ' + p.nome : ' · todos os membros') : 'Por membro · ' + (R.scope === 'mes' ? MN[S.mes] + ' ' + S.ano : 'ano ' + S.ano)) + ' · ' + c.nome;
  }
  /* CSV: neutraliza células que começariam com = + - @ (injeção de fórmula no Excel/Sheets) */
  function csvCell(s) { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function rcsv(S, R) {
    var d = rdata(S, R), f = function (n) { return n.toFixed(2).replace('.', ','); },
      L = [csvCell('Relatório da Caixinha') + ';' + csvCell(rtit(S, R)), '', [csvCell(R.mode === 'mes' ? 'Mês' : 'Membro')].concat(RC.map(csvCell)).join(';')];
    d.rows.concat([{ l: 'TOTAL', v: d.tot }]).forEach(function (r) { L.push([csvCell(r.l)].concat(r.v.map(f)).join(';')); });
    return '﻿' + L.join('\r\n');
  }

  /* Balanço do ano (caixinha selecionada + empréstimos). Os valores de empréstimo "na rua" e "a receber" são de hoje. */
  function balance(S) {
    var c = curCx(S), y = S.ano, t = racc(c, c.pess, y, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      open = S.loans.filter(function (l) { return !l.quit; }), rec = 0, mul = 0, late = open.filter(isLate);
    S.loans.forEach(function (l) { l.hist.forEach(function (h) { if (h.data.slice(0, 4) === String(y)) { rec += h.valor; mul += h.multa; } }); });
    return {
      ano: y, nome: c.nome,
      cx: { emDia: t[0], comAtraso: t[1], multas: t[2], total: t[3], atrasado: t[4], naoPago: t[5] },
      loans: { abertos: open.length, quitados: S.loans.length - open.length, naRua: r2(sum(open.map(outP))), aReceber: r2(sum(open.map(function (l) { return insSum(l, false); }))),
        recebido: r2(rec), multas: r2(mul), atrasados: late.length, valorAtrasado: r2(sum(late.map(function (l) { var x = nextI(l); return x ? x.amount : 0; }))) },
      geral: r2(t[3] + rec)
    };
  }
  /* Planilha formatada (SpreadsheetML 2003: abre no Excel e no LibreOffice, com cores e formatos). Células são texto/número
     tipados, então nada é interpretado como fórmula. */
  function xmlEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function rxls(S, R, withBal) {
    var d = rdata(S, R), c = curCx(S), span = ' ss:MergeAcross="6"', now = clock().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }),
      T = function (id, v, ex) { return '<Cell ss:StyleID="' + id + '"' + (ex || '') + '><Data ss:Type="String">' + xmlEsc(v) + '</Data></Cell>'; },
      N = function (id, v) { return '<Cell ss:StyleID="' + id + '"><Data ss:Type="Number">' + (+v).toFixed(2) + '</Data></Cell>'; },
      row = function (cells, h) { return '<Row' + (h ? ' ss:Height="' + h + '"' : '') + '>' + cells + '</Row>'; }, blank = row(''),
      rows = [row(T('brand', 'CAIXINHA E EMPRÉSTIMOS', span), 20), row(T('title', 'Relatório da caixinha', span), 40), row(T('band', c.nome + ' · cota de ' + brl(c.valor), span), 22),
        row(T('sub', rtit(S, R).replace(/ · [^·]*$/, ''), span), 24), blank,
        row(T('th0', R.mode === 'mes' ? 'Mês' : 'Membro') + RC.map(function (x) { return T('th', x); }).join(''), 26)];
    d.rows.forEach(function (r, i) { var z = i % 2 ? 'z' : ''; rows.push(row(T('td' + z, r.l) + r.v.map(function (x) { return N('n' + z, x); }).join(''), 20)); });
    rows.push(row(T('tt', 'Total') + d.tot.map(function (x) { return N('tn', x); }).join(''), 24), blank,
      row(T('note', 'Como ler: multas entram no total recebido. Atrasado e não pago são valores ainda a receber.', span), 22));
    if (withBal) {
      var b = balance(S), kv = function (l, v, bold) { return row(T(bold ? 'bl' : 'bk', l) + N(bold ? 'bvb' : 'bv', v), 20); };
      rows.push(blank, row(T('sec', 'Balanço de ' + b.ano + ' · caixinha e empréstimos', span), 28),
        row(T('subsec', 'Caixinha · ' + b.nome, span), 22), kv('Pagas em dia', b.cx.emDia), kv('Pagas com atraso', b.cx.comAtraso), kv('Multas', b.cx.multas), kv('Total recebido na caixinha', b.cx.total, 1), kv('Atrasado (a receber)', b.cx.atrasado), kv('Não pago (a receber)', b.cx.naoPago),
        row(T('subsec', 'Empréstimos', span), 22), kv('Emprestado em aberto (na rua)', b.loans.naRua), kv('A receber (parcelas restantes)', b.loans.aReceber), kv('Recebido em ' + b.ano, b.loans.recebido, 1), kv('Multas recebidas', b.loans.multas),
        kv('Em atraso (' + b.loans.atrasados + ')', b.loans.valorAtrasado), row(T('subsec', 'Resultado', span), 22), kv('Total recebido em ' + b.ano + ' (caixinha + empréstimos)', b.geral, 1));
    }
    rows.push(blank, row(T('foot', 'Gerado em ' + now + ' · Caixinha e Empréstimos', span)));
    var NONE = '', fmt = '<NumberFormat ss:Format="&quot;R$&quot;\\ #,##0.00;\\-&quot;R$&quot;\\ #,##0.00;&quot;–&quot;"/>',
      bd = function (pos, col) { return '<Border ss:Position="' + pos + '" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="' + col + '"/>'; },
      st = function (id, font, fill, extra) { return '<Style ss:ID="' + id + '">' + (extra || NONE) + font + (fill ? '<Interior ss:Color="' + fill + '" ss:Pattern="Solid"/>' : NONE) + '</Style>'; },
      F = function (sz, col, bold, name) { return '<Font ss:FontName="' + (name || 'Calibri') + '" ss:Size="' + sz + '" ss:Color="' + col + '"' + (bold ? ' ss:Bold="1"' : NONE) + '/>'; },
      A = function (h, wrap) { return '<Alignment ss:Horizontal="' + h + '" ss:Vertical="Center"' + (wrap ? ' ss:WrapText="1"' : NONE) + '/>'; },
      B = function (pos, col) { return '<Borders>' + bd(pos, col) + '</Borders>'; };
    var styles = '<Styles><Style ss:ID="Default" ss:Name="Normal">' + A('Left') + F(11, '#17231B') + '</Style>' +
      st('brand', F(10, '#F3CF6A', 1), '#1B6B45', A('Left')) + st('title', F(24, '#FFFFFF', 1, 'Georgia'), '#1B6B45', A('Left')) + st('band', F(12, '#FFFFFF', 1), '#14573A', A('Left')) +
      st('sub', F(11, '#566252', 1), '#FFFFFF', A('Left')) + st('th0', F(10, '#FFFFFF', 1), '#1B6B45', A('Left')) + st('th', F(10, '#FFFFFF', 1), '#1B6B45', A('Right', 1)) +
      st('td', F(11, '#17231B'), NONE, A('Left') + B('Bottom', '#EEE9D6')) + st('tdz', F(11, '#17231B'), '#FAF8EF', A('Left') + B('Bottom', '#EEE9D6')) +
      st('n', F(11, '#17231B'), NONE, A('Right') + B('Bottom', '#EEE9D6') + fmt) + st('nz', F(11, '#17231B'), '#FAF8EF', A('Right') + B('Bottom', '#EEE9D6') + fmt) +
      st('tt', F(11, '#0D3F2A', 1), '#E3F1E8', A('Left') + B('Top', '#1B6B45')) + st('tn', F(11, '#0D3F2A', 1), '#E3F1E8', A('Right') + B('Top', '#1B6B45') + fmt) +
      st('note', F(10, '#566252'), '#FFFAF0', A('Left', 1)) + st('sec', F(16, '#FFFFFF', 1, 'Georgia'), '#1B6B45', A('Left')) + st('subsec', F(11, '#1B6B45', 1), '#E3F1E8', A('Left')) +
      st('bk', F(11, '#17231B'), NONE, A('Left') + B('Bottom', '#EEE9D6')) + st('bv', F(11, '#17231B'), NONE, A('Right') + B('Bottom', '#EEE9D6') + fmt) +
      st('bl', F(11, '#0D3F2A', 1), '#FAF8EF', A('Left') + B('Bottom', '#EEE9D6')) + st('bvb', F(11, '#0D3F2A', 1), '#FAF8EF', A('Right') + B('Bottom', '#EEE9D6') + fmt) +
      st('foot', F(9, '#8A937F'), NONE, A('Left')) + '</Styles>';
    var cols = '<Column ss:Width="190"/><Column ss:Width="92"/><Column ss:Width="104"/><Column ss:Width="80"/><Column ss:Width="104"/><Column ss:Width="92"/><Column ss:Width="92"/>';
    return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>Relatório da Caixinha</Title><Author>Caixinha e Empréstimos</Author></DocumentProperties>' + styles +
      '<Worksheet ss:Name="Relatório"><Table>' + cols + rows.join('') + '</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DoNotDisplayGridlines/><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><FitToPage/></WorksheetOptions></Worksheet></Workbook>';
  }

  /* ---------- motor das rifas (funções puras) ---------- */
  var hkey = function (v, alive) { return v.pid && alive[v.pid] ? 'p:' + v.pid : 'e:' + String(v.nm || '').toLowerCase() + '|' + String(v.tel || '').replace(/\D/g, ''); };
  function rNums(r) { var a = []; for (var i = 0; i < r.total; i++) a.push(r.ini + i); return a; }
  function rSold(r) { var m = Object.create(null); r.vend.forEach(function (v) { m[v.n] = v; }); return m; }
  function rFree(r) { var m = rSold(r); return rNums(r).filter(function (n) { return !m[n]; }); }
  function rLocked(r) { return r.st !== 'a' || r.ganh.length > 0 || !!r.hash; }
  var defRng = function () { var a = new Uint32Array(1); root.crypto.getRandomValues(a); return a[0]; };
  /* Sorteio sem viés: amostragem por rejeição sobre um Uint32 (evita o "viés de módulo"). */
  function rRand(n, rng) { rng = rng || defRng; var lim = 4294967296 - (4294967296 % n), x; do { x = rng(); } while (x >= lim); return { v: x % n, x: x }; }
  function rDraw(r, rng) {
    var won = Object.create(null), people = Object.create(null);
    r.ganh.forEach(function (g) { won[g.n] = 1; people[g.pid || String(g.nm).toLowerCase()] = 1; });
    var pool = r.vend.filter(function (v) { return !won[v.n] && !(r.uni && people[v.pid || v.nm.toLowerCase()]); }).sort(function (a, b) { return a.n - b.n; });
    if (!pool.length) return null;
    var k = rRand(pool.length, rng), w = pool[k.v];
    return { pos: r.ganh.length + 1, n: w.n, pid: w.pid, nm: w.nm, rnd: k.x, pool: pool.length, numbers: pool.map(function (v) { return v.n; }) };
  }
  function rPoolText(r) { return r.vend.slice().sort(function (a, b) { return a.n - b.n; }).map(function (v) { return v.n + ';' + v.nm; }).join('\n'); }
  function rStats(r) { return { vendidos: r.vend.length, livres: r.total - r.vend.length, arrecadado: r2(r.vend.length * r.valor), total: r.total }; }
  function rByHolder(r, alive) {
    var m = Object.create(null), out = [];
    r.vend.forEach(function (v) { var k = hkey(v, alive); if (!m[k]) { m[k] = { key: k, pid: v.pid && alive[v.pid] ? v.pid : null, nm: v.nm, tel: v.tel, resp: v.resp, ext: !(v.pid && alive[v.pid]), nums: [] }; out.push(m[k]); } m[k].nums.push(v.n); });
    return out;
  }

  /* vendas agrupadas por membro responsável (quem vendeu); externos sem responsável ficam por nome */
  function rByResp(r) {
    var m = Object.create(null), out = [];
    r.vend.forEach(function (v) { var k = v.resp || v.pid || 'e:' + String(v.nm).toLowerCase(); if (!m[k]) { m[k] = { key: k, resp: v.resp || v.pid || null, items: [] }; out.push(m[k]); } m[k].items.push(v); });
    return out;
  }
  function cotistas(c) { return c.pess.filter(function (p) { return p.cotas > 0; }); }

  function curCx(S) { return S.cxs.find(function (c) { return c.id === S.cur; }) || S.cxs[0]; }

  CX.u = { MN: MN, p2: p2, r2: r2, esc: esc, brl: brl, comma: comma, today: today, isoOk: isoOk, fd: fd, addM: addM, dueIso: dueIso, daysTo: daysTo, num: num, uid: uid, sum: sum, sint: sint };
  CX.sanitize = sanitize; CX.blank = blank; CX.parseBackup = parseBackup; CX.backupText = backupText; CX.curCx = curCx;
  CX.cx = { cotistas: cotistas, pk: pk, cnt: cnt, stOf: stOf, cotas: cotas, ativo: ativo, received: received, mulOf: mulOf, mulTot: mulTot, pending: pending, lateP: lateP, autoLate: autoLate };
  CX.loan = { calc: calcL, next: nextI, insSum: insSum, recomp: recomp, outP: outP, lrec: lrec, isLate: isLate, dues: dues, amtOn: amtOn, dueTxt: dueTxt, watch: loansToWatch };
  CX.rifa = { hkey: hkey, nums: rNums, sold: rSold, free: rFree, locked: rLocked, randInt: function (n, rng) { return rRand(n, rng).v; }, draw: rDraw, poolText: rPoolText, stats: rStats, byHolder: rByHolder, byResp: rByResp };
  CX.hoje = hoje;
  CX.msg = { TN: TN, TD: TD, tpl: tpl, fill: fill, vars: msgVars, waUrl: waUrl };
  CX.rep = { RC: RC, data: rdata, title: rtit, csv: rcsv, csvCell: csvCell, balance: balance, xls: rxls };
})(typeof window !== 'undefined' ? window : globalThis);
