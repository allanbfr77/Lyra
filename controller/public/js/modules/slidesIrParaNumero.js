/**
 * Atalho «ir direto ao slide N» do modo Slides (como no Holyrics): o operador digita o número
 * em qualquer lugar da tela e confirma com Enter. O campo do painel direito só mostra o que foi
 * digitado — não precisa de foco.
 */

export const IR_PARA_SLIDE_MAX_DIGITOS = 4;
/** Sem digitar por este tempo, o número pendente é descartado (o Enter volta a ser «próximo»). */
export const IR_PARA_SLIDE_VALIDADE_MS = 5000;

/**
 * Número digitado → índice (0-based) do slide, ou null se for inválido.
 * Válidos: 1 … totalEstrofes. O slide preto final não tem número.
 */
export function indiceSlidePorNumero(texto, totalEstrofes) {
  const s = String(texto ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  const total = Number(totalEstrofes);
  if (!Number.isFinite(n) || !Number.isFinite(total)) return null;
  if (n < 1 || n > total) return null;
  return n - 1;
}

/** O foco está num lugar onde a digitação pertence ao próprio elemento (busca, editor…)? */
export function alvoEhCampoDeDigitacao(alvo, idCampoProprio) {
  if (!alvo || !alvo.tagName) return false;
  if (idCampoProprio && alvo.id === idCampoProprio) return false;
  const tag = String(alvo.tagName).toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!alvo.isContentEditable;
}

/**
 * @param {object} d
 * @param {() => boolean} d.ehModoSlides
 * @param {() => number} d.totalEstrofes  Nº de slides com letra da música atual (0 se não houver).
 * @param {(indice: number) => void} d.projetar
 * @param {() => boolean} [d.interfaceBloqueada]  Modal / painel por cima: não captura teclas.
 * @param {string} [d.idCampo]
 */
export function criarIrParaSlideNumero(d) {
  const idCampo = d.idCampo || 'slides-ir-slide-input';
  let digitos = '';
  let timer = null;

  function campo() {
    return document.getElementById(idCampo);
  }

  function pintar() {
    const el = campo();
    if (!el) return;
    el.value = digitos;
    el.classList.toggle('com-numero', digitos !== '');
  }

  function limpar() {
    digitos = '';
    clearTimeout(timer);
    timer = null;
    pintar();
  }

  function reiniciarValidade() {
    clearTimeout(timer);
    timer = digitos ? setTimeout(limpar, IR_PARA_SLIDE_VALIDADE_MS) : null;
  }

  function confirmar() {
    const idx = indiceSlidePorNumero(digitos, d.totalEstrofes());
    limpar();
    if (idx != null) d.projetar(idx);
    /* Inválido: só limpa — o slide atual fica como está. */
  }

  /**
   * Tecla pressionada (fase de captura). Devolve true se foi consumida.
   * Só pega dígitos, e Enter/Backspace/Escape enquanto houver número pendente.
   */
  function tratarKeydown(e) {
    if (!d.ehModoSlides()) {
      if (digitos) limpar();
      return false;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
    if (alvoEhCampoDeDigitacao(e.target, idCampo)) return false;
    if (d.interfaceBloqueada && d.interfaceBloqueada()) return false;

    if (/^[0-9]$/.test(e.key)) {
      if (digitos.length < IR_PARA_SLIDE_MAX_DIGITOS) digitos += e.key;
      pintar();
      reiniciarValidade();
      return true;
    }
    if (!digitos) return false;

    if (e.key === 'Enter') {
      confirmar();
      return true;
    }
    if (e.key === 'Backspace') {
      digitos = digitos.slice(0, -1);
      pintar();
      reiniciarValidade();
      return true;
    }
    if (e.key === 'Escape') {
      /* Esc continua sendo «encerrar» — aqui só descarta o número pendente. */
      limpar();
    }
    return false;
  }

  function ligar() {
    document.addEventListener(
      'keydown',
      (e) => {
        if (!tratarKeydown(e)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
  }

  return { ligar, limpar, tratarKeydown, getDigitos: () => digitos };
}
