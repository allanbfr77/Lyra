'use strict';
/* Splash — só recebe eventos do processo principal e anima. Nenhum trabalho acontece aqui. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var janela = $('janela'), fill = $('fill'), indet = $('indet');
  var elLabel = $('label'), elDetalhe = $('detalhe');

  var versao = new URLSearchParams(location.search).get('v');
  $('versao').textContent = versao ? 'Versão ' + versao : '';

  /* A barra nunca retrocede. */
  var mostrado = 0;
  function setProgresso(p) {
    p = Math.max(0, Math.min(1, p));
    if (p <= mostrado) return;
    mostrado = p;
    fill.style.width = (p * 100).toFixed(2) + '%';
    indet.style.left = (p * 100).toFixed(2) + '%';
  }
  function setIndeterminado(on) { indet.classList.toggle('ativo', !!on); }

  var grupoAtual = null, rotuloAtual = null, grupoAviso = null, travaIndet = null, travado = false;

  function trocarRotulo(texto) {
    if (texto === rotuloAtual) return;
    rotuloAtual = texto;
    elLabel.classList.add('troca');
    setTimeout(function () {
      if (travado) return;
      elLabel.textContent = texto;
      elLabel.classList.remove('troca');
    }, 130);
  }

  window.splash.onProgress(function (d) {
    if (travado) return;
    var total = d.totalUnits || 11;
    var concluidas = Math.max(0, (d.unit || 1) - 1);
    var mensuravel = typeof d.value === 'number' && typeof d.max === 'number' && d.max > 0;
    var frac = mensuravel ? Math.min(1, d.value / d.max) : 0;
    setProgresso((concluidas + frac) / total);

    clearTimeout(travaIndet);
    setIndeterminado(!mensuravel);
    /* Unidade mensurável parada há mais de 3 s também mostra o indeterminado. */
    if (mensuravel) travaIndet = setTimeout(function () { setIndeterminado(true); }, 3000);

    if (d.group !== grupoAtual) {
      grupoAtual = d.group;
      if (grupoAviso !== d.group) { janela.classList.remove('aviso'); grupoAviso = null; }
    }
    trocarRotulo(d.label || '');
    if (grupoAviso !== d.group) elDetalhe.textContent = d.detail || '';
  });

  window.splash.onWarn(function (d) {
    if (travado) return;
    grupoAviso = d.group;
    janela.classList.add('aviso');
    elDetalhe.textContent = d.message + (d.detail ? ' · ' + d.detail : '');
  });

  window.splash.onError(function (d) {
    travado = true;
    clearTimeout(travaIndet);
    setIndeterminado(false);
    janela.classList.remove('aviso');
    janela.classList.add('erro');
    elLabel.classList.remove('troca');
    elLabel.textContent = d.message || 'Falha ao iniciar o Lyra.';
    elDetalhe.textContent = [d.code, d.detail].filter(Boolean).join(' · ');
    $('meta').hidden = true;
    $('acoes').hidden = false;
    $('btn-reiniciar').focus();
  });

  window.splash.onDone(function () {
    if (travado) return;
    clearTimeout(travaIndet);
    setIndeterminado(false);
    setProgresso(1);
    janela.classList.remove('aviso');
    rotuloAtual = 'Pronto';
    elLabel.classList.remove('troca');
    elLabel.textContent = 'Pronto';
    elDetalhe.textContent = '';
    janela.classList.add('saindo');
  });

  $('btn-reiniciar').addEventListener('click', function () { window.splash.relaunch(); });
  $('btn-sair').addEventListener('click', function () { window.splash.quit(); });
})();
