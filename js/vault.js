/* vault.js — armazenamento local e criptografia em repouso.
   Sem PIN: o estado fica em localStorage como JSON.
   Com PIN: o estado é cifrado com AES-GCM (chave derivada do PIN por PBKDF2-SHA-256, 600 mil iterações)
   e o JSON em texto puro é apagado. A chave só existe na memória enquanto o app está destravado.
   Observação honesta: um PIN numérico curto sempre pode ser descoberto por força bruta offline por quem
   copiar o armazenamento do aparelho; as 600 mil iterações encarecem isso, mas a proteção real contra um
   atacante dedicado é o bloqueio do próprio aparelho. */
(function () {
  'use strict';
  var CX = window.CX, KS = 'caixinha:v1', KV = 'caixinha:vault', KL = 'caixinha:pin', KF = 'caixinha:pinfail', KB = 'caixinha:bio', KPRE = 'caixinha:antes-da-v2';
  var IT = 600000, subtle = window.crypto && crypto.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  var key = null, chain = Promise.resolve();

  function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < a.length; i++) a[i] = b.charCodeAt(i); return a; }
  function rnd(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* sem acesso */ } }
  function json(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }

  async function derive(secret, salt, it) {
    var base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(k, text) {
    var iv = rnd(12), ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(k, iv, ct) { return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct))); }
  function validRec(r) { return r && typeof r.s === 'string' && typeof r.iv === 'string' && typeof r.ct === 'string' && r.it >= 100000 && r.it <= 2e6; }

  var V = CX.vault = {
    supported: !!(subtle && window.isSecureContext !== false),
    hasVault: function () { return validRec(json(KV)); },
    hasPlain: function () { return !!lsGet(KS); },
    legacy: function () { var p = json(KL); return p && p.s && p.h ? p : null; },
    pinLen: function () { var r = json(KV); return r && r.len ? r.len : (V.legacy() ? 4 : 6); },
    unlocked: function () { return !!key; },
    lock: function () { key = null; },

    /* PIN antigo (hash de 4 dígitos): só para migrar quem já usava o app. */
    legacyCheck: async function (pin) {
      var p = V.legacy(); if (!p) return false;
      var base = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      var h = b64(await subtle.deriveBits({ name: 'PBKDF2', salt: unb64(p.s), iterations: 150000, hash: 'SHA-256' }, base, 256));
      var d = 0; for (var i = 0; i < Math.max(h.length, p.h.length); i++) d |= (h.charCodeAt(i) || 0) ^ (p.h.charCodeAt(i) || 0);
      return d === 0;
    },
    /* Lê o estado em texto puro (sem PIN, ou durante a migração). */
    readPlain: function () { var t = lsGet(KS); if (!t) return null; try { return JSON.parse(t); } catch (e) { return null; } },

    /* Liga a criptografia: guarda o estado cifrado e apaga o texto puro. */
    enable: async function (pin, state) {
      var salt = rnd(16), k = await derive(pin, salt, IT), s = await seal(k, JSON.stringify(state));
      var ok = lsSet(KV, JSON.stringify({ v: 1, len: pin.length, it: IT, s: b64(salt), iv: s.iv, ct: s.ct }));
      if (!ok) throw new Error('storage');
      key = k; lsDel(KS); lsDel(KL); lsDel(KB); lsDel(KF); lsDel(KPRE);
    },
    unlock: async function (pin) {
      var r = json(KV); if (!validRec(r)) throw new Error('sem cofre');
      var k = await derive(pin, unb64(r.s), r.it), txt;
      try { txt = await open(k, r.iv, r.ct); } catch (e) { throw new Error('pin'); }
      key = k; return JSON.parse(txt);
    },
    /* Confere o PIN sem alterar a sessão (para confirmar ações sensíveis). */
    verify: async function (pin) {
      var r = json(KV); if (!validRec(r)) return false;
      try { await open(await derive(pin, unb64(r.s), r.it), r.iv, r.ct); return true; } catch (e) { return false; }
    },
    disable: function (state) {
      if (!lsSet(KS, JSON.stringify(state))) throw new Error('storage');
      lsDel(KV); key = null;
    },
    /* Grava o estado (sempre em fila, para as gravações não se atropelarem). */
    persist: function (state) {
      var text = JSON.stringify(state), r = json(KV);
      if (!r) return Promise.resolve(lsSet(KS, text));
      if (!key) return Promise.resolve(false);
      var k = key;
      chain = chain.then(async function () {
        var s = await seal(k, text), cur = json(KV);
        r.iv = s.iv; r.ct = s.ct; r.s = cur ? cur.s : r.s;
        return lsSet(KV, JSON.stringify({ v: 1, len: r.len, it: r.it, s: r.s, iv: r.iv, ct: r.ct }));
      }).catch(function () { return false; });
      return chain;
    },
    wipe: function () {
      try { Object.keys(localStorage).filter(function (k) { return k.indexOf('caixinha') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* sem acesso */ }
      key = null;
    },

    /* Backup com senha própria (exportação cifrada). */
    encryptText: async function (text, pass) {
      var salt = rnd(16), k = await derive(pass, salt, IT), s = await seal(k, text);
      return JSON.stringify({ app: 'caixinha', enc: 1, it: IT, s: b64(salt), iv: s.iv, ct: s.ct });
    },
    isEncrypted: function (text) { try { var d = JSON.parse(text); return !!(d && d.enc === 1 && validRec(d)); } catch (e) { return false; } },
    decryptText: async function (text, pass) {
      var d = JSON.parse(text);
      try { return await open(await derive(pass, unb64(d.s), d.it), d.iv, d.ct); } catch (e) { throw new Error('senha'); }
    },

    /* PIN do administrador (área de rifas): guarda só sal + hash PBKDF2, nunca o PIN. */
    adminHash: async function (pin) {
      var salt = rnd(16), it = 310000, base = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      return { s: b64(salt), h: b64(await subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: it, hash: 'SHA-256' }, base, 256)), it: it };
    },
    adminCheck: async function (pin, rec) {
      if (!rec || !subtle) return false;
      var base = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      var h = b64(await subtle.deriveBits({ name: 'PBKDF2', salt: unb64(rec.s), iterations: rec.it, hash: 'SHA-256' }, base, 256)), d = 0;
      for (var i = 0; i < Math.max(h.length, rec.h.length); i++) d |= (h.charCodeAt(i) || 0) ^ (rec.h.charCodeAt(i) || 0);
      return d === 0;
    },

    /* Limite de tentativas do PIN (dificulta chute na tela; não substitui a criptografia). */
    waitLeft: function () { var f = json(KF) || {}; return f.until && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; },
    failed: function () {
      var f = json(KF) || {}, n = (f.n || 0) + 1, o = { n: n };
      if (n >= 5) o.until = Date.now() + Math.min(30 * Math.pow(2, n - 5), 900) * 1000;
      lsSet(KF, JSON.stringify(o));
    },
    passed: function () { lsDel(KF); }
  };
})();
