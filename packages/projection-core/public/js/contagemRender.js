'use strict';

/**
 * Desenho da contagem regressiva numa tela de projeção.
 *
 * Vive num módulo próprio porque duas telas o usam: o telão (`display.html`) e o monitor
 * do ministrante (`display-operator.html`), quando o operador escolhe mostrar a contagem
 * nos dois. São páginas com estruturas muito diferentes — uma desenha slides, a outra
 * desenha «atual + próximo» —, mas a contagem tem de ser o MESMO desenho e, sobretudo, os
 * mesmos dígitos no mesmo instante. Duas cópias deste código seriam duas telas a discordar
 * sobre quando «04:59» vira «04:58», lado a lado na mesma sala.
 *
 * Cada tela traz os seus elementos e o seu `document`; o módulo não procura nada no DOM
 * global nem assume nomes de `id`.
 */

/* A regra da contagem — formato, limites, arredondamento — vive no Core e é a mesma que
   o host usa para decidir o que enviar. Aqui só se desenha o que ela devolve. */
const contagemLib = require('../../src/contagemRegressiva');

/**
 * @param {object} ctx
 * @param {Document} ctx.document Documento da tela (para as custom properties do fundo).
 * @param {Performance} [ctx.performance] Relógio monotónico; `Date.now()` é o fallback.
 * @param {HTMLElement} ctx.elBox Caixa da contagem.
 * @param {HTMLElement} ctx.elDigitos Onde os dígitos são escritos.
 * @param {HTMLElement} [ctx.elMsgTopo] Mensagem acima dos dígitos.
 * @param {HTMLElement} [ctx.elMsgRodape] Mensagem abaixo dos dígitos.
 * @returns {{ mostrar: (dados: object) => void, limpar: () => void }}
 */
function criarRenderContagem(ctx) {
    /**
     * Cadência do redesenho.
     *
     * 200 ms e não 1000: com um tick de exactamente um segundo, o instante em que os
     * dígitos mudam fica à mercê de quando o comando chegou — uma contagem que arranca a
     * meio de um segundo salta de 05:00 para 04:58 na primeira mudança visível. Cinco
     * amostras por segundo custam nada e prendem a mudança ao segundo real.
     */
    const CONTAGEM_TICK_MS = 200;

    /** Últimos segundos em que os dígitos piscam, quando a config o pede. */
    const CONTAGEM_PISCA_SEGUNDOS = 10;

    let contagemTimer = null;
    /** @type {{restanteMs:number, excedenteMs:number, rodando:boolean, cfg:object, ancora:number}|null} */
    let contagemEmTela = null;

    /**
     * Relógio local do redesenho.
     *
     * `performance.now()` é monotónico: não anda para trás quando o Windows corrige a hora
     * pelo NTP a meio da contagem, coisa que `Date.now()` faz e que apareceria no telão
     * como dígitos a saltar. O `Date.now()` fica só como rede de segurança.
     */
    function agoraLocalMs() {
      if (ctx.performance && typeof ctx.performance.now === 'function') return ctx.performance.now();
      return Date.now();
    }

    function pararTickContagem() {
      if (contagemTimer) {
        clearInterval(contagemTimer);
        contagemTimer = null;
      }
    }

    /** Tira a contagem da tela. Chamada por todo caminho de `exibir` que não é contagem. */
    function limparContagem() {
      pararTickContagem();
      contagemEmTela = null;
      const box = ctx.elBox;
      if (!box) return;
      box.hidden = true;
      box.classList.remove('piscando', 'pos-top', 'pos-bottom');
      if (ctx.elDigitos) ctx.elDigitos.textContent = '';
      if (ctx.elMsgTopo) ctx.elMsgTopo.textContent = '';
      if (ctx.elMsgRodape) ctx.elMsgRodape.textContent = '';
    }

    function fundoCssContagem(cfg) {
      if (cfg.bgType === 'gradient') return cfg.bgGradient || '#000000';
      if (cfg.bgType === 'image' && cfg.bgImage) {
        return `url('${String(cfg.bgImage).replace(/'/g, "%27")}') center/cover no-repeat`;
      }
      return cfg.bgColor || '#000000';
    }

    /** Tipografia, cores e fundo — tudo o que não muda a cada tick. */
    function aplicarEstiloContagem(cfg) {
      const box = ctx.elBox;
      if (!box) return;

      ctx.document.documentElement.style.setProperty('--bg-contagem-projecao', fundoCssContagem(cfg));

      box.classList.toggle('pos-top', cfg.verticalPosition === 'top');
      box.classList.toggle('pos-bottom', cfg.verticalPosition === 'bottom');

      const dig = ctx.elDigitos;
      if (dig) {
        dig.style.fontFamily = cfg.fontFamily || 'CMG Sans, sans-serif';
        dig.style.fontSize = `${cfg.fontSize}vh`;
        dig.style.fontWeight = cfg.negrito ? '700' : '400';
        dig.style.letterSpacing = `${cfg.letterSpacing}em`;
      }

      const topo = ctx.elMsgTopo;
      if (topo) {
        topo.textContent = cfg.mensagemTopo || '';
        topo.style.fontFamily = cfg.fontFamily || 'CMG Sans, sans-serif';
        topo.style.fontSize = `${cfg.mensagemTopoFontSize}vh`;
        topo.style.color = cfg.mensagemTopoColor;
      }

      const rodape = ctx.elMsgRodape;
      if (rodape) {
        rodape.textContent = cfg.mensagemRodape || '';
        rodape.style.fontFamily = cfg.fontFamily || 'CMG Sans, sans-serif';
        rodape.style.fontSize = `${cfg.mensagemRodapeFontSize}vh`;
        rodape.style.color = cfg.mensagemRodapeColor;
      }
    }

    /**
     * Redesenha os dígitos a partir do tempo decorrido localmente.
     *
     * O host disse «faltam X ms» num instante que esta tela registou em `ancora`. Tudo o que
     * acontece a seguir é aritmética local — é isso que permite ao host calar-se durante
     * toda a contagem em vez de emitir um pacote por segundo.
     */
    function desenharContagem() {
      const s = contagemEmTela;
      const box = ctx.elBox;
      const dig = ctx.elDigitos;
      if (!s || !box || !dig) return;

      const decorrido = s.rodando ? Math.max(0, agoraLocalMs() - s.ancora) : 0;
      const restante = Math.max(0, s.restanteMs - decorrido);
      const excedente = s.rodando
        ? Math.max(0, s.excedenteMs + decorrido - s.restanteMs)
        : s.excedenteMs;
      const cfg = s.cfg;
      const zerou = restante <= 0;

      if (zerou && cfg.aoZerar === 'subir') {
        dig.textContent = `+${contagemLib.formatarContagem(excedente, cfg)}`;
      } else if (zerou && cfg.textoFinal) {
        /* O texto final ocupa o lugar dos dígitos, não o das mensagens: quem escreve
           «COMEÇAMOS!» quer isso em tamanho de telão, não em legenda. */
        dig.textContent = cfg.textoFinal;
      } else {
        dig.textContent = contagemLib.formatarContagem(restante, cfg);
      }

      const emAlerta = cfg.alertaSegundos > 0 && restante <= cfg.alertaSegundos * 1000;
      dig.style.color = emAlerta || zerou ? cfg.alertaColor : cfg.textColor;

      const piscar =
        cfg.piscarNoFinal &&
        (zerou || restante <= CONTAGEM_PISCA_SEGUNDOS * 1000) &&
        cfg.aoZerar !== 'subir';
      box.classList.toggle('piscando', !!piscar);

      /* Chegou a zero e não vai contar para cima: nada mais muda, o tick só gastaria CPU
         numa máquina que ainda tem um culto inteiro pela frente. */
      if (zerou && cfg.aoZerar !== 'subir') pararTickContagem();
    }

    /**
     * Recebe uma contagem do host e passa a desenhá-la.
     *
     * @param {object} dados `{ rodando, restanteMs, excedenteMs, contagemConfig }`
     */
    function renderizarContagem(dados) {
      const box = ctx.elBox;
      if (!box) return;
      const c = dados && typeof dados === 'object' ? dados : {};
      const cfg = contagemLib.normalizarCfgContagem(c.contagemConfig);

      contagemEmTela = {
        restanteMs: Math.max(0, Number(c.restanteMs) || 0),
        excedenteMs: Math.max(0, Number(c.excedenteMs) || 0),
        rodando: !!c.rodando,
        cfg,
        ancora: agoraLocalMs(),
      };

      aplicarEstiloContagem(cfg);
      box.hidden = false;
      desenharContagem();

      pararTickContagem();
      if (contagemEmTela.rodando) {
        contagemTimer = setInterval(desenharContagem, CONTAGEM_TICK_MS);
      }
    }

  return { mostrar: renderizarContagem, limpar: limparContagem };
}

module.exports = { criarRenderContagem };
