/* Testes do núcleo (sem navegador):  node tests/core.test.js */
'use strict';
const assert = require('assert');
require('../js/core.js');
const CX = globalThis.CX;
CX.clock = () => new Date(2026, 10, 24, 12, 0, 0); // 24/11/2026
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('sanitize: backup malicioso não injeta HTML nem chaves perigosas', () => {
  const evil = JSON.parse('{"__proto__":{"x":1},"cxs":[{"id":"\\"><img src=x onerror=alert(1)>","nome":"<b>x</b>","valor":"abc","pess":[{"id":"p\\"1","nome":"A","cotas":"9999999","tel":"<script>1"}],"pag":{"__proto__":"p","p\\"1|2026-01":"p","bad":"p"},"mul":{"x":1}}],"loans":[{"id":"l\\"x","nome":"N","principal":"1000","taxa":"<img>","ins":[{"due":"2026-12-01","amount":"1150"}]}]}');
  const S = CX.sanitize(evil);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(S.cxs[0].id));
  assert.ok(/^[A-Za-z0-9_-]+$/.test(S.cxs[0].pess[0].id));
  assert.strictEqual(S.cxs[0].pess[0].cotas, 1000);
  assert.strictEqual(S.cxs[0].pess[0].tel, '1');
  assert.strictEqual(S.cxs[0].valor, 50);
  assert.strictEqual(Object.keys(S.cxs[0].pag).length, 1, 'chave remapeada preservada, lixo descartado');
  assert.ok(Object.keys(S.cxs[0].pag)[0].startsWith(S.cxs[0].pess[0].id + '|2026-01'));
  assert.strictEqual(({}).x, undefined, 'sem poluição de protótipo');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(S.loans[0].id));
  assert.strictEqual(S.loans[0].taxa, 0);
  assert.strictEqual(typeof S.loans[0].ins[0].amount, 'number');
});

t('sanitize: rejeita formatos inválidos e lixo', () => {
  assert.strictEqual(CX.sanitize(null).cxs.length, 1);
  assert.throws(() => CX.parseBackup('{"foo":1}'));
  assert.throws(() => CX.parseBackup('nao json'));
  assert.throws(() => CX.parseBackup('x'.repeat(5e6 + 1)));
});

t('migração: estado antigo (pess/pag no topo) vira uma caixinha', () => {
  const old = { ano: 2026, mes: 10, valor: 50, pess: [{ id: 'a1', nome: 'Ana', cotas: 2 }], pag: { 'a1|2026-11': 'p' }, loans: [] };
  const S = CX.sanitize(old);
  assert.strictEqual(S.cxs[0].pess[0].nome, 'Ana');
  assert.strictEqual(S.cxs[0].pag['a1|2026-11'], 'p');
  assert.strictEqual(CX.cx.received(S.cxs[0], 2026, 10), 100);
});

t('migração: empréstimo antigo de juros (1x) mantém vencimento e valor', () => {
  const old = { cxs: [], pess: [], loans: [{ id: 'L1', nome: 'Maria', principal: 1000, taxa: 15, inicio: '2026-10-01', venc: '2026-12-01', quit: false, hist: [{ data: '2026-11-01', tipo: 'juros', valor: 150, ref: '2026-11-01' }] }] };
  const S = CX.sanitize(old);
  const l = S.loans[0];
  assert.strictEqual(l.n, 1); assert.strictEqual(l.ins[0].amount, 1150); assert.strictEqual(l.venc, '2026-12-01');
  assert.strictEqual(l.ren, 1); assert.strictEqual(l.quit, false);
  assert.strictEqual(CX.loan.lrec(l), 150);
});

t('migração: empréstimo antigo parcelado preserva parcelas pagas e restantes', () => {
  const old = { pess: [], loans: [{ id: 'L2', nome: 'João', principal: 600, p0: 900, taxa: 10, par: 3, pago: 1, acr: 0, inicio: '2026-09-01', venc: '2026-11-01', quit: false,
    hist: [{ data: '2026-10-01', tipo: 'parcela', n: 1, valor: 390, multa: 0, ref: '2026-10-01', amort: 300, jur: 90 }] }] };
  const l = CX.sanitize(old).loans[0];
  assert.strictEqual(l.n, 3);
  assert.ok(l.ins[0].paidAt); assert.strictEqual(l.ins[0].amount, 390);
  assert.ok(!l.ins[1].paidAt); assert.strictEqual(l.ins[1].due, '2026-11-01'); assert.strictEqual(l.ins[1].amount, 360);
  assert.strictEqual(l.ins[2].amount, 330); assert.strictEqual(l.venc, '2026-11-01');
});

t('migração: empréstimo antigo quitado fica quitado', () => {
  const l = CX.sanitize({ pess: [], loans: [{ id: 'L3', nome: 'Z', principal: 500, taxa: 15, venc: '2026-11-05', quit: true, hist: [{ data: '2026-11-03', tipo: 'quitação', valor: 575, multa: 0 }] }] }).loans[0];
  assert.strictEqual(l.quit, true); assert.strictEqual(CX.loan.outP(l), 0);
});

t('calcL: parcelas somam o total e a última absorve o centavo', () => {
  const c = CX.loan.calc({ principal: 1000, rate: 15, type: 'fixed', surv: 0, count: 3 });
  assert.strictEqual(c.total, 1150);
  assert.strictEqual(CX.u.r2(c.amounts.reduce((a, b) => a + b, 0)), 1150);
  assert.deepStrictEqual(c.amounts, [383.33, 383.33, 383.34]);
  const m = CX.loan.calc({ principal: 1000, rate: 10, type: 'monthly', surv: 30, count: 4 });
  assert.strictEqual(m.interest, 400); assert.strictEqual(m.total, 1430);
  assert.strictEqual(CX.loan.calc({ principal: 100, rate: 10, type: 'fixed', surv: 50, count: 1 }).surcharge, 0, 'acréscimo só a partir de 2x');
});

t('caixinha: atraso automático depois do vencimento e contagem mista', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'X', valor: 50, venc: 10, pess: [{ id: 'p1', nome: 'A', cotas: 3 }], pag: { 'p1|2026-11': { p: 1, pa: 1, a: 0 } }, mul: { 'p1|2026-11': 5 } }], loans: [] });
  const c = S.cxs[0], p = c.pess[0];
  assert.deepStrictEqual(CX.cx.cnt(c, p, 2026, 10), { np: 0, p: 1, pa: 1, a: 1 }); // 24/11 > dia 10: a cota restante vira atrasada
  assert.deepStrictEqual(CX.cx.cnt(c, p, 2026, 11), { np: 3, p: 0, pa: 0, a: 0 }); // dezembro ainda não venceu
  assert.strictEqual(CX.cx.received(c, 2026, 10), 100);
  assert.strictEqual(CX.cx.mulTot(c, 2026, 10), 5);
});

t('datas: addM respeita fim de mês e anos bissextos', () => {
  assert.strictEqual(CX.u.addM('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(CX.u.addM('2028-01-31', 1), '2028-02-29');
  assert.strictEqual(CX.u.addM('2026-12-15', 1), '2027-01-15');
  assert.strictEqual(CX.u.addM('2026-03-31', -1), '2026-02-28');
});

t('num: formatos brasileiros e internacionais', () => {
  assert.strictEqual(CX.u.num('1.234,56'), 1234.56);
  assert.strictEqual(CX.u.num('1234.56'), 1234.56);
  assert.strictEqual(CX.u.num('R$ 10,5'), 10.5);
  assert.strictEqual(CX.u.num('1.000'), 1000);
  assert.strictEqual(CX.u.num('abc'), 0);
});

t('CSV: neutraliza injeção de fórmula', () => {
  assert.strictEqual(CX.rep.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.strictEqual(CX.rep.csvCell('Ana'), '"Ana"');
  assert.strictEqual(CX.rep.csvCell('@x'), '"\'@x"');
});

t('esc: escapa aspas simples e duplas', () => {
  assert.strictEqual(CX.u.esc('<a href="x" onclick=\'y\'>&'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
});

t('hoje: avisa só quando faltam ≤ N dias, hoje ou atrasado', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'X', valor: 50, venc: 25, aviso: 2, pess: [{ id: 'p1', nome: 'A', cotas: 1 }] }, { id: 'c2', nome: 'Y', valor: 10, venc: 30, aviso: 2, pess: [{ id: 'p2', nome: 'B', cotas: 1 }] }], loans: [] });
  const h = CX.hoje(S);
  assert.strictEqual(h.length, 1); assert.strictEqual(h[0].c.id, 'c1'); assert.strictEqual(h[0].ph, 'lem');
});

t('backup: ida e volta preserva o estado', () => {
  const S = CX.sanitize({ pess: [{ id: 'a', nome: 'Ana', cotas: 1 }], pag: { 'a|2026-11': 'p' }, loans: [] });
  const S2 = CX.parseBackup(CX.backupText(S));
  assert.deepStrictEqual(S2.cxs[0].pag, S.cxs[0].pag); assert.strictEqual(S2.cxs[0].pess[0].nome, 'Ana');
});

t('balanço: soma caixinha + empréstimos do ano', () => {
  const S = CX.sanitize({
    cxs: [{ id: 'c1', nome: 'Grupo', valor: 50, venc: 10, pess: [{ id: 'p1', nome: 'A', cotas: 2 }, { id: 'p2', nome: 'B', cotas: 1 }], pag: { 'p1|2026-11': 'p', 'p2|2026-11': 'pa' }, mul: { 'p2|2026-11': 10 } }],
    loans: [{ id: 'l1', nome: 'X', principal: 1000, taxa: 15, venc: '2026-12-01', ins: [{ due: '2026-12-01', amount: 1150 }], hist: [{ data: '2026-11-02', tipo: 'juros', valor: 160, multa: 10, ref: '2026-11-01' }] }]
  });
  const b = CX.rep.balance(S);
  assert.strictEqual(b.cx.emDia, 100); assert.strictEqual(b.cx.comAtraso, 50); assert.strictEqual(b.cx.multas, 10); assert.strictEqual(b.cx.total, 160);
  assert.strictEqual(b.loans.recebido, 160); assert.strictEqual(b.loans.multas, 10); assert.strictEqual(b.loans.naRua, 1000); assert.strictEqual(b.loans.aReceber, 1150);
  assert.strictEqual(b.geral, 320);
});

t('planilha: escapa XML, usa números tipados e inclui balanço só quando pedido', () => {
  const S = CX.sanitize({ pess: [{ id: 'a', nome: 'Ana & <Cia> "x"', cotas: 1 }], pag: { 'a|2026-11': 'p' }, loans: [] });
  const R = { mode: 'cot', scope: 'mes', f: '' };
  const x = CX.rep.xls(S, R, false), y = CX.rep.xls(S, R, true);
  assert.ok(x.startsWith('<?xml')); assert.ok(x.includes('Ana &amp; &lt;Cia&gt; &quot;x&quot;')); assert.ok(!x.includes('<Cia>'));
  assert.ok(x.includes('<Data ss:Type="Number">50.00</Data>'));
  assert.ok(!x.includes('Balanço de')); assert.ok(y.includes('Balanço de 2026'));
  assert.strictEqual((x.match(/<Row/g) || []).length, (x.match(/<\/Row>/g) || []).length);
});

/* ---------- rifas ---------- */
const mkR = (extra) => CX.sanitize({
  cxs: [{ id: 'c1', nome: 'G', valor: 50, pess: [{ id: 'p1', nome: 'Ana', cotas: 2 }, { id: 'p2', nome: 'Bruno', cotas: 1 }, { id: 'p3', nome: 'Carla', cotas: 3 }] }], loans: [],
  rifas: [Object.assign({ id: 'r1', cx: 'c1', nome: 'Rifa', ini: 1, total: 10, valor: 10, prem: ['Cesta', 'Vale'], vend: [] }, extra || {})]
}).rifas[0];

t('rifas: backup antigo sem rifas vira lista vazia', () => {
  assert.deepStrictEqual(CX.sanitize({ pess: [], loans: [] }).rifas, []);
  assert.deepStrictEqual(CX.parseBackup(JSON.stringify({ pess: [], loans: [] })).rifas, []);
});

t('rifas: sanitização neutraliza HTML, __proto__, números fora do intervalo, duplicados e pessoas inexistentes', () => {
  const r = mkR({ nome: '<img src=x onerror=1>', prem: ['<b>x</b>', '', 'Y'], vend: [
    { n: 1, pid: 'p1' }, { n: 1, pid: 'p2' }, { n: 99, pid: 'p1' }, { n: 2, pid: 'fantasma', nm: 'Ext', tel: '<x>21 9' }, { n: 3 }, { n: 4, pid: 'p2', resp: 'zzz' }, { n: '5', pid: 'p3' }, null, { n: 6, nm: '__proto__' }] });
  assert.deepStrictEqual(r.vend.map(v => v.n), [1, 2, 4, 5, 6]);
  assert.strictEqual(r.vend.find(v => v.n === 1).pid, 'p1'); assert.strictEqual(r.vend.find(v => v.n === 2).pid, null); assert.strictEqual(r.vend.find(v => v.n === 2).tel, '21 9');
  assert.strictEqual(r.vend.find(v => v.n === 4).resp, 'p2', 'responsável inválido cai no próprio membro'); assert.strictEqual(r.prem.length, 2); assert.strictEqual(({}).polluted, undefined);
  assert.ok(!/[<>]/.test(r.vend.find(v => v.n === 2).tel));
});

t('rifas: ganhadores só valem se o número foi vendido e sem posição repetida; status é recalculado', () => {
  const r = mkR({ vend: [{ n: 1, pid: 'p1' }, { n: 2, pid: 'p2' }, { n: 3, pid: 'p3' }], ganh: [{ pos: 1, n: 1 }, { pos: 1, n: 2 }, { pos: 2, n: 9 }, { pos: 5, n: 3 }, { pos: 2, n: 3 }], st: 'a' });
  assert.deepStrictEqual(r.ganh.map(g => g.pos + ':' + g.n), ['1:1', '2:3']); assert.strictEqual(r.st, 's');
  const u = mkR({ uni: true, vend: [{ n: 1, pid: 'p1' }, { n: 2, pid: 'p1' }], ganh: [{ pos: 1, n: 1 }, { pos: 2, n: 2 }] });
  assert.strictEqual(u.ganh.length, 1, 'uma pessoa só ganha uma vez quando uni');
});

t('rifas: caixinha removida deixa cx = null e mantém a rifa', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'G', valor: 50, pess: [] }], loans: [], rifas: [{ id: 'r', cx: 'sumiu', total: 5, prem: ['A'] }] });
  assert.strictEqual(S.rifas.length, 1); assert.strictEqual(S.rifas[0].cx, null);
});

t('rifas: números por cota (mult) tem padrão 2 e limites', () => {
  assert.strictEqual(mkR({}).mult, 2); assert.strictEqual(mkR({ mult: 5 }).mult, 5); assert.strictEqual(mkR({ mult: 999 }).mult, 50); assert.strictEqual(mkR({ mult: 0 }).mult, 1);
});

t('rifas: randInt rejeita valores que causariam viés e é aproximadamente uniforme', () => {
  const seq = [4294967295, 7]; let i = 0;
  assert.strictEqual(CX.rifa.randInt(3, () => seq[i++]), 1, 'rejeitou 4294967295 e usou 7 % 3');
  const cnt = [0, 0, 0]; for (let k = 0; k < 90000; k++) cnt[CX.rifa.randInt(3)]++;
  cnt.forEach(c => assert.ok(c > 29000 && c < 31000, 'distribuição: ' + cnt));
});

t('rifas: sorteio nunca repete número nem pessoa (quando uni) e devolve null sem pool', () => {
  const r = mkR({ uni: true, prem: ['A', 'B', 'C'], vend: [{ n: 1, pid: 'p1' }, { n: 2, pid: 'p1' }, { n: 3, pid: 'p2' }, { n: 4, pid: 'p3' }] });
  for (let k = 0; k < 200; k++) {
    const q = JSON.parse(JSON.stringify(r)); q.ganh = [];
    for (let j = 0; j < 3; j++) { const d = CX.rifa.draw(q); assert.ok(d); q.ganh.push({ pos: d.pos, n: d.n, pid: d.pid, nm: d.nm }); }
    assert.strictEqual(new Set(q.ganh.map(g => g.n)).size, 3); assert.strictEqual(new Set(q.ganh.map(g => g.pid)).size, 3);
    assert.strictEqual(CX.rifa.draw(q), null, 'acabou o pool');
  }
  assert.strictEqual(CX.rifa.draw(mkR({})), null);
});

t('rifas: código de conferência é determinístico e muda se a venda muda', () => {
  const a = mkR({ vend: [{ n: 2, pid: 'p2' }, { n: 1, pid: 'p1' }] }), b = mkR({ vend: [{ n: 1, pid: 'p1' }, { n: 2, pid: 'p2' }] }), c = mkR({ vend: [{ n: 1, pid: 'p1' }, { n: 3, pid: 'p2' }] });
  assert.strictEqual(CX.rifa.poolText(a), CX.rifa.poolText(b)); assert.notStrictEqual(CX.rifa.poolText(a), CX.rifa.poolText(c));
});

t('rifas: ida e volta de backup preserva a rifa', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'G', valor: 50, pess: [{ id: 'p1', nome: 'Ana', cotas: 1 }] }], loans: [], rifas: [{ id: 'r1', cx: 'c1', nome: 'X', total: 5, valor: 10, prem: ['A'], vend: [{ n: 1, pid: 'p1' }] }] });
  const S2 = CX.parseBackup(CX.backupText(S));
  assert.deepStrictEqual(S2.rifas[0].vend, S.rifas[0].vend);
});

t('membros: cota 0 (só membro) é aceita, apelido é limpo e relatório lista só cotistas', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'G', valor: 50, pess: [{ id: 'a', nome: 'Ana', apelido: '<b>Aninha</b>' + 'x'.repeat(50), cotas: 0 }, { id: 'b', nome: 'Bia', cotas: 2 }] }], loans: [] });
  assert.strictEqual(S.cxs[0].pess[0].cotas, 0); assert.ok(S.cxs[0].pess[0].apelido.length <= 30);
  assert.deepStrictEqual(CX.cx.cotistas(S.cxs[0]).map(p => p.nome), ['Bia']);
  assert.deepStrictEqual(CX.rep.data(S, { mode: 'cot', scope: 'mes', f: '' }).rows.map(r => r.l), ['Bia (2 cotas)']);
  assert.strictEqual(CX.cx.pending(S.cxs[0], 2026, 10).length, 1, 'quem tem 0 cotas nunca fica pendente');
});

t('admin: registro do PIN é validado, e o hash não vai para o backup', () => {
  const ok = { s: 'AAAAAAAAAAAAAAAAAAAAAA==', h: 'A'.repeat(43) + '=', it: 310000 };
  assert.deepStrictEqual(CX.sanitize({ cxs: [], loans: [], adm: ok }).adm, ok);
  assert.strictEqual(CX.sanitize({ cxs: [], loans: [], adm: { s: '<x>', h: 'y', it: 5 } }).adm, null);
  assert.strictEqual(CX.sanitize({ cxs: [], loans: [], adm: 'x' }).adm, null);
  const S = CX.sanitize({ cxs: [], loans: [], adm: ok }); assert.ok(!CX.backupText(S).includes('"adm"'));
});

t('rifas: vendas agrupadas por membro responsável', () => {
  const r = mkR({ vend: [{ n: 1, pid: 'p1' }, { n: 2, nm: 'Ext', resp: 'p1' }, { n: 3, pid: 'p2' }, { n: 4, nm: 'Solto' }] });
  const g = CX.rifa.byResp(r);
  assert.deepStrictEqual(g.map(x => [x.resp, x.items.length]), [['p1', 2], ['p2', 1], [null, 1]]);
});

t('hoje: inclui mês anterior em aberto, mas só se já houve lançamentos nele', () => {
  const mk = (extra) => CX.sanitize({ cxs: [{ id: 'c1', nome: 'X', valor: 50, venc: 10, aviso: 2, pess: [{ id: 'p1', nome: 'A', cotas: 1 }, Object.assign({ id: 'p2', nome: 'B', cotas: 1 }, extra)], pag: { 'p1|2026-10': 'p', 'p2|2026-10': 'p', 'p1|2026-11': 'p', 'p2|2026-11': 'p', 'p1|2026-09': 'p' } }], loans: [] });
  const h = CX.hoje(mk({}));
  assert.deepStrictEqual(h.map(x => x.ym), ['2026-09']); assert.strictEqual(h[0].pend[0].p.id, 'p2'); assert.strictEqual(h[0].ph, 'atr');
  assert.strictEqual(CX.hoje(mk({ desde: '2026-10' })).length, 0);   // quem entrou depois não deve meses anteriores
});

t('desde: meses anteriores à entrada não contam cota nem pendência', () => {
  const S = CX.sanitize({ cxs: [{ id: 'c1', nome: 'X', valor: 50, venc: 10, pess: [{ id: 'p1', nome: 'A', cotas: 2, desde: '2026-06' }] }], loans: [] });
  const c = S.cxs[0], p = c.pess[0];
  assert.strictEqual(CX.cx.cnt(c, p, 2026, 4).np + CX.cx.cnt(c, p, 2026, 4).a, 0);   // maio
  assert.strictEqual(CX.cx.cnt(c, p, 2026, 5).a, 2);                                   // junho (já vencido)
  assert.strictEqual(CX.cx.cotas(c, 2026, 4), 0); assert.strictEqual(CX.cx.cotas(c, 2026, 5), 2); assert.strictEqual(CX.cx.cotas(c), 2);
  assert.strictEqual(CX.sanitize({ cxs: [{ id: 'c', nome: 'X', valor: 1, pess: [{ id: 'p', nome: 'A', desde: '<x>' }] }], loans: [] }).cxs[0].pess[0].desde, '');
});

console.log('\n' + n + ' testes passaram');
