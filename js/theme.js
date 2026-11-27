/* Aplica o tema antes da primeira pintura (evita o "flash" claro em quem usa modo escuro). */
(function () {
  'use strict';
  var t = null;
  try { t = localStorage.getItem('caixinha:theme'); } catch { /* sem acesso */ }
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'dark' ? '#0e1215' : '#1b6b45');
})();
