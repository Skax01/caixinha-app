/* drive.js — backup opcional no Google Drive (escopo drive.file: o app só enxerga os arquivos que ele mesmo criou).
   O token de acesso fica apenas na memória; nada de credencial é gravado no aparelho além do ID do cliente
   (que é público) e de dois marcadores ("conectado" e "backup pendente"). */
(function () {
  'use strict';
  var CX = window.CX, esc = CX.u.esc, p2 = CX.u.p2, ui = CX.ui, GK = 'caixinha:google';
  var CID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i, API = 'https://www.googleapis.com/';
  function gget(k) { try { return localStorage.getItem(GK + ':' + k) || ''; } catch (e) { return ''; } }
  function gset(k, v) { try { if (v) localStorage.setItem(GK + ':' + k, v === true ? '1' : v); else localStorage.removeItem(GK + ':' + k); } catch (e) { /* sem acesso */ } }
  var cfg = (CX.config && CX.config.googleClientId) || '';
  var G = { cid: CID_RE.test(cfg) ? cfg : (CID_RE.test(gget('cid')) ? gget('cid') : ''), tok: null, exp: 0, folder: null, linked: gget('linked') === '1', pend: gget('pend') === '1', ok: false, at: null, err: '', busy: false, timer: null };
  var D = CX.drive = { G: G, changed: 0 };
  var app = function () { return CX.app; };

  D.https = function () { return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; };
  D.linkedNow = function () { return G.linked && !!G.cid; };

  function load() {
    return new Promise(function (ok, no) {
      if (window.google && google.accounts && google.accounts.oauth2) return ok();
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.referrerPolicy = 'no-referrer';
      s.onload = ok; s.onerror = function () { no(new Error('net')); }; document.head.appendChild(s);
    });
  }
  function token(prompt) {
    return new Promise(function (ok, no) {
      function go() {
        try {
          var tc = google.accounts.oauth2.initTokenClient({
            client_id: G.cid, scope: 'https://www.googleapis.com/auth/drive.file',
            callback: function (r) { if (r && r.access_token) { G.tok = r.access_token; G.exp = Date.now() + ((+r.expires_in || 3600) - 90) * 1000; ok(G.tok); } else no(new Error((r && r.error) || 'auth')); },
            error_callback: function (e) { no(new Error('popup ' + ((e && e.type) || ''))); }
          });
          tc.requestAccessToken({ prompt: prompt || '' });
        } catch (e) { no(e); }
      }
      if (window.google && google.accounts && google.accounts.oauth2) go(); else load().then(go, no);
    });
  }
  async function api(url, opt) {
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + G.tok }, opt.headers);
    opt.credentials = 'omit'; opt.referrerPolicy = 'no-referrer';
    var r = await fetch(url, opt);
    if (r.status === 401) { G.tok = null; G.exp = 0; }
    if (!r.ok) throw new Error('http ' + r.status);
    return r;
  }
  async function folder() {
    if (G.folder) return G.folder;
    var q = encodeURIComponent("name='save Caixinha' and mimeType='application/vnd.google-apps.folder' and trashed=false"),
      r = await (await api(API + 'drive/v3/files?q=' + q + '&fields=files(id)')).json();
    if (r.files && r.files.length) G.folder = r.files[0].id;
    else G.folder = (await (await api(API + 'drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'save Caixinha', mimeType: 'application/vnd.google-apps.folder' }) })).json()).id;
    return G.folder;
  }
  async function put(name, txt) {
    var f = await folder(), q = encodeURIComponent("name='" + name + "' and '" + f + "' in parents and trashed=false"),
      l = await (await api(API + 'drive/v3/files?q=' + q + '&fields=files(id)')).json(), id = l.files && l.files[0] && l.files[0].id,
      b = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(12)), function (x) { return p2(x.toString(16)); }).join(''),
      meta = id ? { name: name } : { name: name, parents: [f] },
      body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + txt + '\r\n--' + b + '--';
    await api(API + 'upload/drive/v3/files' + (id ? '/' + id : '') + '?uploadType=multipart&fields=id', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
  }

  /* chamado a cada alteração: marca "pendente" e envia em 1,5 s se já houver sessão do Google */
  D.soon = function () {
    if (!D.linkedNow()) return;
    D.changed++; G.pend = true; gset('pend', true); D.refresh();
    clearTimeout(G.timer); G.timer = setTimeout(function () { D.sync(false); }, 1500);
  };
  /* reenvio a cada 20 minutos: só age se o envio de 1,5 s falhou (ou não pôde sair) e ainda há alteração pendente */
  D.EVERY = 20 * 60 * 1000;
  G.cycle = setInterval(function () { if (D.linkedNow() && G.pend) D.sync(false); }, D.EVERY);
  /* estado "vazio": sem cotistas, empréstimos, rifas nem pagamentos (aparelho novo ou dados apagados) */
  function emptyLocal() {
    var S = app().S; if (!S) return true;
    return !(S.loans && S.loans.length) && !(S.rifas && S.rifas.length) && !S.cxs.some(function (c) { return c.pess.length || Object.keys(c.pag || {}).length; });
  }
  function fmtWhen(iso) { var m = new Date(iso); return m.toLocaleDateString('pt-BR') + ' às ' + p2(m.getHours()) + ':' + p2(m.getMinutes()); }
  async function remoteAtual() {
    var f = await folder(), q = encodeURIComponent("name='caixinha-atual.json' and '" + f + "' in parents and trashed=false");
    var l = (await (await api(API + 'drive/v3/files?q=' + q + '&fields=files(id,modifiedTime)')).json()).files || [];
    return l[0] || null;
  }
  async function readBackup(id) {
    var txt = await (await api(API + 'drive/v3/files/' + encodeURIComponent(id) + '?alt=media')).text();
    return CX.parseBackup(txt);   // lança se inválido
  }
  async function restoreFrom(id) {
    var st; try { st = await readBackup(id); } catch (x) { ui.toast('Backup do Drive inválido. Nada foi alterado.'); return false; }
    await app().replace(st);
    ui.toast('Restaurados ' + st.cxs.reduce(function (s, c) { return s + c.pess.length; }, 0) + ' membros e ' + st.loans.length + ' empréstimos');
    return true;
  }
  D.sync = async function (manual) {
    if (!G.cid || G.busy) return;
    if ((!G.tok || Date.now() > G.exp) && !manual) return;
    var txt = app().backup(); if (!txt) return;
    G.busy = true; var c = D.changed; D.refresh();
    try {
      if (!G.tok || Date.now() > G.exp) await token();
      /* proteção: primeira conexão ou aparelho vazio nunca sobrescrevem um backup existente sem perguntar */
      var first = !G.linked, empty = emptyLocal();
      if (first || empty) {
        var ri = await remoteAtual();
        if (ri) {
          if (!manual) return;   // envio automático não decide sozinho
          var r = await ui.menu('Já existe um backup no Drive', 'Backup de ' + fmtWhen(ri.modifiedTime) + (empty ? '. Este aparelho está vazio.' : '. Este aparelho também tem dados.'),
            [{ l: 'Restaurar o backup do Drive', k: 'res', c: '' }, { l: empty ? 'Enviar mesmo assim (apaga o backup)' : 'Substituir o backup pelos dados deste aparelho', k: 'rep', c: 'd' }]);
          if (!r) return;
          if (r.act === 'res') { if (await restoreFrom(ri.id)) { G.linked = true; gset('linked', true); G.ok = true; G.at = new Date(); G.pend = false; gset('pend', false); } return; }
          if (!(await ui.confirm({ title: 'Substituir o backup do Drive?', msg: 'O backup de ' + fmtWhen(ri.modifiedTime) + ' em caixinha-atual.json será trocado pelos dados deste aparelho. As cópias diárias antigas continuam na pasta.', yes: 'Substituir', danger: true }))) return;
        }
      }
      await put('caixinha-atual.json', txt); await put('caixinha-' + CX.u.today() + '.json', txt);
      G.linked = true; gset('linked', true); G.ok = true; G.at = new Date(); G.err = '';
      if (D.changed === c) { G.pend = false; gset('pend', false); }
      if (manual) ui.toast('Backup enviado ao Google Drive');
    } catch (e) {
      G.ok = false; var m = String((e && e.message) || e);
      if (/404/.test(m)) G.folder = null;
      if (/popup|access_denied|auth|401/.test(m)) { G.err = ''; if (manual) ui.toast('Não foi possível entrar no Google. Permita a janela de login e tente de novo.'); }
      else G.err = 'Não foi possível enviar ao Google Drive. Confira a conexão e tente de novo.';
    } finally { G.busy = false; D.refresh(); }
  };
  D.restore = async function () {
    try {
      if (!G.tok || Date.now() > G.exp) await token();
      var f = await folder(), q = encodeURIComponent("name contains 'caixinha-' and name contains '.json' and '" + f + "' in parents and trashed=false"),
        l = (await (await api(API + 'drive/v3/files?q=' + q + '&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id,name,modifiedTime)')).json()).files || [];
      if (!l.length) return ui.toast('Nenhum backup encontrado na pasta do Drive');
      var pick = l[0];
      if (l.length > 1) {
        var r = await ui.menu('Restaurar do Drive', 'Escolha a cópia. Os dados deste aparelho serão substituídos.', l.map(function (x, i) { return { l: (x.name === 'caixinha-atual.json' ? 'Atual · ' : 'Cópia do dia · ') + fmtWhen(x.modifiedTime), k: String(i), c: i ? 'g' : '' }; }));
        if (!r) return; pick = l[+r.act];
      }
      if (await ui.confirm({ title: 'Restaurar do Drive?', msg: 'Backup de ' + fmtWhen(pick.modifiedTime) + '. Os dados deste aparelho serão substituídos pelos do Drive.', yes: 'Restaurar', danger: true })) await restoreFrom(pick.id);
    } catch (e) { ui.toast('Não foi possível ler o Drive. Tente de novo.'); }
  };
  D.disconnect = function () {
    try { if (G.tok && window.google) google.accounts.oauth2.revoke(G.tok, function () { }); } catch (e) { /* sem acesso */ }
    G.tok = null; G.exp = 0; G.linked = false; G.pend = false; G.ok = false; G.folder = null; gset('linked', false); gset('pend', false); gset('acct', false); gset('mail', false);
    D.refresh(); ui.toast('Google Drive desconectado');
  };
  D.saveId = function (v) {
    v = String(v || '').trim();
    if (!CID_RE.test(v)) { ui.toast('Esse ID não parece válido. Ele termina com .apps.googleusercontent.com'); return false; }
    G.cid = v; gset('cid', v); load().catch(function () { }); return true;
  };
  D.preload = function () { if (G.cid && location.protocol === 'https:') load().catch(function () { }); };
  D.refresh = function () { if (app()) app().driveChanged(); };

  /* texto curto para o selo do topo */
  D.badge = function () {
    if (!D.linkedNow()) return ''; if (G.busy) return ' · enviando…';
    return G.pend || G.err ? ' · Drive pendente' : ' · Drive ✓';
  };
  D.warn = function () { return D.linkedNow() && (G.pend || G.err); };

  D.box = function () {
    var h = '<h2>Google Drive</h2>';
    if (!D.https()) return h + '<p class="lead">O backup pelo Google só funciona na versão publicada em endereço https.</p>';
    if (!G.cid) return h + '<p class="lead">Cole o ID do cliente Google (OAuth) para ativar o backup na nuvem. Ele é criado no Google Cloud Console.</p><label for="gid">ID do cliente</label><input id="gid" autocomplete="off" spellcheck="false" maxlength="120" placeholder="000000-xxxx.apps.googleusercontent.com"><div class="row sm-top"><button class="btn" type="button" data-a="gsave">Salvar ID</button></div>';
    if (!G.linked) return h + '<p class="lead">Entre com a conta Google. O app cria a pasta “save Caixinha” no seu Drive e guarda o backup lá a cada alteração. Ele só vê os arquivos que criou.</p><button class="btn" type="button" data-a="gsync">' + ui.icon('cloud', 's') + 'Conectar ao Google Drive</button>';
    var st = G.err ? '<div class="alert" role="alert">' + ui.icon('alert') + '<span>' + esc(G.err) + '</span></div>'
      : G.pend ? '<div class="alert wn">' + ui.icon('alert') + '<span><b>Backup pendente.</b> Toque em Sincronizar agora (o login do Google expira em cerca de 1 hora).</span></div>'
        : G.ok ? '<p class="tag">✓ Enviado às ' + p2(G.at.getHours()) + ':' + p2(G.at.getMinutes()) + '</p>' : '<p class="tag mu">Conectado</p>';
    return h + '<p class="lead">Pasta <b>save Caixinha</b>: guarda o arquivo atual e uma cópia por dia. O backup no Drive não é cifrado pelo PIN: ele fica protegido pela sua conta Google.</p>' + st +
      '<div class="row sm-top"><button class="btn" type="button" data-a="gsync"' + (G.busy ? ' disabled' : '') + '>' + ui.icon('cloud', 's') + 'Sincronizar agora</button><button class="btn g" type="button" data-a="gres">Restaurar do Drive</button><button class="btn t" type="button" data-a="gout">Desconectar</button></div>';
  };
})();
