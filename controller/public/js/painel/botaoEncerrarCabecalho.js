/**
 * Botão «Encerrar projeção» do cabeçalho: só vale para a projeção do modo em que está.
 *
 * O botão é um só, mas age por modo (Slides, Bíblia, Mídias, DOCS). Habilitá-lo noutro modo
 * dava a ilusão de que encerrava a projeção que se vê — e encerrava a errada, ou nada. Aqui
 * a decisão sai do ESTADO REAL da projeção (quem está no ar), e não só do ecrã aberto:
 *
 *   modo aberto == dono da projeção activa  →  habilitado
 *   qualquer outro caso                      →  cinza e sem acção
 *
 * Navegar não toca na projeção; o Esc é global e não passa por aqui.
 */
import { estadoPainel } from './estadoPainel.js';
import { bibliaHaParteProjetada } from './biblia.js';
import { docsHaPaginaProjetada } from './docs.js';
import { hayProjecaoApresentacaoModoAtiva } from './rotasMonitores.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoDocsOperador, ehModoSlidesOperador } from './modosUi.js';

function linhasNoAr(e) {
  return !!(e && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length);
}

/** Modo que é dono da projeção que o botão encerraria no modo aberto agora. */
export function modoAbertoTemProjecaoParaEncerrar() {
  const e = estadoPainel.estadoServidor;
  if (ehModoDocsOperador()) return !!docsHaPaginaProjetada();
  if (ehModoApresentacaoOperador()) return !!hayProjecaoApresentacaoModoAtiva();
  if (ehModoBibliaOperador()) {
    return !!(bibliaHaParteProjetada() || (e && e.projecaoBibliaMinistrante) || (e && e.tipo === 'biblia' && linhasNoAr(e)));
  }
  if (ehModoSlidesOperador()) {
    return !!(
      estadoPainel.projecaoMusicaEmitidaNoServidor ||
      (e && e.tipo === 'musica' && (linhasNoAr(e) || e.slidePretoFinal))
    );
  }
  /* Home e demais ecrãs: não são dono de nenhuma projeção. */
  return false;
}

/** «Encerrar» ao lado de «Tela preta» no modo Slides: mesma regra, só vale com música no ar. */
function atualizarBtnEncerrarSlides(ativoNoModo) {
  const b = document.getElementById('btn-slides-encerrar');
  if (!b) return;
  const ativo = ehModoSlidesOperador() && ativoNoModo;
  if (b.disabled === !ativo) return;
  b.disabled = !ativo;
  b.setAttribute('aria-disabled', ativo ? 'false' : 'true');
}

export function atualizarBtnEncerrarProjecaoCabecalho() {
  try {
    atualizarBtnEncerrarSlides(modoAbertoTemProjecaoParaEncerrar());
  } catch (_) {
    // intencional — erro ignorado
  }
  const btn = document.getElementById('hdr-encerrar-projecao');
  if (!btn) return;
  let ativo = false;
  try {
    ativo = modoAbertoTemProjecaoParaEncerrar();
  } catch (_) {
    ativo = false;
  }
  if (btn.disabled === !ativo) return;
  btn.disabled = !ativo;
  btn.setAttribute('aria-disabled', ativo ? 'false' : 'true');
  btn.title = ativo ? 'Encerrar projeção' : 'Sem projeção deste modo para encerrar';
}

let iniciado = false;
/** Liga a actualização automática: mudança de modo (classe do body) e mudança de estado da projeção. */
export function iniciarBotaoEncerrarProjecaoCabecalho() {
  if (iniciado) return;
  iniciado = true;
  atualizarBtnEncerrarProjecaoCabecalho();
  try {
    new MutationObserver(() => atualizarBtnEncerrarProjecaoCabecalho()).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  } catch (_) {
    // intencional — o intervalo abaixo cobre
  }
  /* Iniciar/encerrar/substituir projeção não tem um único evento: lê-se o estado real, barato. */
  setInterval(atualizarBtnEncerrarProjecaoCabecalho, 250);
}
