/**
 * Comandos de voz no modo slides.
 * No Electron usa Vosk offline (processo principal + microfone do sistema).
 * Fora do Electron tenta Web Speech API (Chrome).
 */

import { LS_VOZ_SLIDES_ATIVO } from './chavesArmazenamentoLocal.js';
import { normalizarTextoVoz } from './textoVoz.js';

/** Máximo de slide-cards reconhecíveis por voz (número falado ou dígito). */
export const MAX_SLIDE_NUMERO_VOZ = 35;

const NUMEROS_PALAVRAS = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  vinteum: 21,
  'vinte e um': 21,
  vintedois: 22,
  'vinte e dois': 22,
  vintetres: 23,
  'vinte e tres': 23,
  vinteetres: 24,
  'vinte e quatro': 24,
  vintecinco: 25,
  'vinte e cinco': 25,
  vinteseis: 26,
  'vinte e seis': 26,
  vintesete: 27,
  'vinte e sete': 27,
  vinteoito: 28,
  'vinte e oito': 28,
  vintenove: 29,
  'vinte e nove': 29,
  trinta: 30,
  trintaum: 31,
  'trinta e um': 31,
  trintadois: 32,
  'trinta e dois': 32,
  trintatres: 33,
  'trinta e tres': 33,
  trintaquatro: 34,
  'trinta e quatro': 34,
  trintacinco: 35,
  'trinta e cinco': 35,
};

/** O Vosk costuma confundir números curtos — sobretudo «um» / slide 1. */
const ALIASES_PALAVRA_SLIDE = {
  hum: 1,
  hun: 1,
  humm: 1,
  ome: 1,
  ohm: 1,
  uno: 1,
  do: 2,
  du: 2,
  dous: 2,
  tre: 3,
  tres: 3,
  trer: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

function parseNumeroSlide(fragmento) {
  const t = normalizarTextoVoz(fragmento);
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 1 && n <= MAX_SLIDE_NUMERO_VOZ ? n : null;
  }
  if (Object.prototype.hasOwnProperty.call(NUMEROS_PALAVRAS, t)) {
    const n = NUMEROS_PALAVRAS[t];
    return n >= 1 && n <= MAX_SLIDE_NUMERO_VOZ ? n : null;
  }
  if (Object.prototype.hasOwnProperty.call(ALIASES_PALAVRA_SLIDE, t)) {
    return ALIASES_PALAVRA_SLIDE[t];
  }
  return null;
}

function extrairNumeroSlideDeFraseCurta(texto) {
  const t = normalizarTextoVoz(texto);
  if (!t) return null;
  for (const [frase, n] of Object.entries(NUMEROS_PALAVRAS)) {
    if (n >= 21 && n <= MAX_SLIDE_NUMERO_VOZ && frase.includes(' ') && t.includes(frase)) {
      return n;
    }
  }
  const partes = t.split(/\s+/).filter(Boolean);
  if (partes.length === 0 || partes.length > 4) return null;
  for (let i = partes.length - 1; i >= 0; i--) {
    const n = parseNumeroSlide(partes[i]);
    if (n != null) return n;
  }
  return null;
}

/**
 * @param {string} texto
 * @returns {{ tipo: string, slide?: number } | null}
 */
export function interpretarComandoVozSlides(texto) {
  const t = normalizarTextoVoz(texto);
  if (!t) return null;

  if (t.includes('tela preta')) return { tipo: 'tela_preta' };

  if (/\b(encerrar|encerra|fecha|fechar|sair|cancelar|limpar tela|limpar)\b/.test(t)) {
    return { tipo: 'encerrar' };
  }

  if (/\bmidia\b/.test(t)) return { tipo: 'modo_apresentacao' };
  if (/modo\s+slides?/.test(t)) return { tipo: 'modo_slides' };
  if (/\bbiblia\b/.test(t)) return { tipo: 'modo_biblia' };
  if (/modo\s+home/.test(t) || /pagina\s+inicial/.test(t)) {
    return { tipo: 'modo_completo' };
  }

  if (/\b(proximo|proxima|proximos|avancar|avanca|seguinte|passar|passa)\b/.test(t)) return { tipo: 'proximo' };
  if (/\b(voltar|anterior|retroceder|volta|volte)\b/.test(t)) return { tipo: 'voltar' };
  if (/\b(primeiro|primeira|inicio|comeco)\b/.test(t)) return { tipo: 'primeiro' };
  if (/\b(ultimo|ultima)\b/.test(t) && !t.includes('tela')) return { tipo: 'ultimo' };

  const mSlide = t.match(/\bslide\s+(\d+|[a-z]+)\b/);
  if (mSlide) {
    const n = parseNumeroSlide(mSlide[1]);
    if (n != null) return { tipo: 'slide', slide: n };
  }

  /** Só o número do slide-card: "1", "2", "um", "dois", "três"… */
  if (!/\s/.test(t)) {
    const n = parseNumeroSlide(t);
    if (n != null) return { tipo: 'slide', slide: n };
  }

  const nFrase = extrairNumeroSlideDeFraseCurta(t);
  if (nFrase != null) return { tipo: 'slide', slide: nFrase };

  for (const [frase, n] of Object.entries(NUMEROS_PALAVRAS)) {
    if (n < 21 || n > MAX_SLIDE_NUMERO_VOZ || !frase.includes(' ')) continue;
    if (t === frase || t.endsWith(` ${frase}`)) return { tipo: 'slide', slide: n };
  }

  return null;
}

/** Texto é apenas um número de slide (para execução rápida em resultado parcial). */
function ehSomenteNumeroSlide(texto) {
  const t = normalizarTextoVoz(texto);
  if (!t) return false;
  if (!/\s/.test(t)) return parseNumeroSlide(t) != null;
  return extrairNumeroSlideDeFraseCurta(t) != null;
}

/** Frases fixas aceleram o Vosk (menos hipóteses = resposta mais rápida). */
function montarGramaticaVoskComandos() {
  const frases = [
    'próximo',
    'proximo',
    'voltar',
    'primeiro',
    'último',
    'ultimo',
    'tela preta',
    'avançar',
    'avancar',
    'seguinte',
    'passar',
    'encerrar',
    'encerra',
    'fechar',
    'fecha',
    'sair',
    'cancelar',
    'limpar',
    'modo midia',
    'modo mídia',
    'midia',
    'mídia',
    'modo slides',
    'modo slide',
    'modo biblia',
    'modo bíblia',
    'biblia',
    'bíblia',
    'modo home',
    'pagina inicial',
    'página inicial',
  ];
  for (let n = 1; n <= MAX_SLIDE_NUMERO_VOZ; n++) {
    frases.push(String(n));
    frases.push(`slide ${n}`);
  }
  for (const [palavra, n] of Object.entries(NUMEROS_PALAVRAS)) {
    if (n >= 1 && n <= MAX_SLIDE_NUMERO_VOZ && !palavra.includes(' ')) {
      frases.push(palavra);
      frases.push(`slide ${palavra}`);
    }
  }
  for (const [frase, n] of Object.entries(NUMEROS_PALAVRAS)) {
    if (n >= 21 && n <= MAX_SLIDE_NUMERO_VOZ && frase.includes(' ')) {
      frases.push(frase);
    }
  }
  for (const alias of Object.keys(ALIASES_PALAVRA_SLIDE)) {
    frases.push(alias);
  }
  /* Reforço do slide 1 — palavra mais curta e mais confundida pelo modelo. */
  for (const ref of ['um', 'uma', 'hum', '1', 'slide um', 'slide uma', 'slide 1', 'numero um']) {
    frases.push(ref);
    frases.push(ref);
  }
  return JSON.stringify(frases);
}

const URL_VOSK_LIB = 'http://127.0.0.1:3001/vendor/vosk-browser/vosk.js';
/** Buffer menor ≈ menos latência (~128 ms @ 16 kHz). */
const TAMANHO_BUFFER_AUDIO = 2048;
/** Intervalo mínimo entre comandos distintos (ex.: slide 3 → slide 4). */
const COOLDOWN_COMANDO_MS = 400;
/**
 * Navegação relativa (próximo/voltar) precisa de janela maior:
 * o Vosk emite o mesmo comando em partialresult e depois em result;
 * com 400 ms o final ainda passava e saltava 2–3 slides.
 */
const COOLDOWN_NAVEGACAO_MS = 1200;

/** UMD expõe `window.Vosk`; `import()` dinâmico não funciona no Electron. */
function carregarBibliotecaVosk() {
  if (window.Vosk?.createModel) return Promise.resolve(window.Vosk);
  const existente = document.querySelector('script[data-lyra-vosk="1"]');
  if (existente) {
    return new Promise((resolve, reject) => {
      existente.addEventListener('load', () => {
        if (window.Vosk?.createModel) resolve(window.Vosk);
        else reject(new Error('Biblioteca Vosk carregou mas createModel não existe'));
      }, { once: true });
      existente.addEventListener('error', () => reject(new Error('Falha ao carregar Vosk')), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = URL_VOSK_LIB;
    s.async = true;
    s.dataset.lyraVosk = '1';
    s.onload = () => {
      if (window.Vosk?.createModel) resolve(window.Vosk);
      else reject(new Error('Biblioteca Vosk indisponível'));
    };
    s.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de voz'));
    document.head.appendChild(s);
  });
}

function criarModeloVoskComTimeout(Vosk, urlModelo, ms = 180000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Tempo esgotado ao carregar o modelo de voz'));
    }, ms);
    Vosk.createModel(urlModelo)
      .then((m) => {
        clearTimeout(timer);
        resolve(m);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err || new Error('Motor de voz recusou o modelo'));
      });
  });
}

function apiVoskElectron() {
  const api = window.lyraElectron?.vozSlides;
  return api?.obterUrlModelo ? api : null;
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.ehModoSlides
 * @param {() => { estrofes?: string[] } | null} opts.obterMusicaAtiva
 * @param {(index: number) => void} opts.projecionarEstrofe
 * @param {(dir: number) => void} opts.navegarDirecao
 * @param {() => void} opts.encerrarComoEsc — mesmo efeito que ESC no modo slides
 * @param {() => boolean} [opts.ehModoApresentacao]
 * @param {() => boolean} [opts.painelVozVisivel] — slides, apresentação ou completo com voz ligada
 * @param {() => void} [opts.mudarModoApresentacao]
 * @param {() => void} [opts.mudarModoSlides]
 * @param {() => void} [opts.mudarModoCompleto]
 * @param {() => void} [opts.mudarModoBiblia]
 */
export function criarReconhecimentoVozSlides(opts) {
  const {
    ehModoSlides,
    ehModoApresentacao = () => false,
    painelVozVisivel,
    obterMusicaAtiva,
    projecionarEstrofe,
    navegarDirecao,
    encerrarComoEsc,
    mudarModoApresentacao,
    mudarModoSlides,
    mudarModoCompleto,
    mudarModoBiblia,
  } = opts;

  function uiVozDisponivel() {
    if (typeof painelVozVisivel === 'function') return painelVozVisivel();
    return ehModoSlides() || ehModoApresentacao();
  }

  const voskApi = apiVoskElectron();
  const usaVosk = !!voskApi;

  const SpeechRecognition = !usaVosk
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

  let recognition = null;
  let desejadoAtivo = false;
  let fase = 'parado';
  let mensagemErro = '';
  let ultimoComando = '';
  let reinicioTimer = null;
  let falhasWebSpeech = 0;
  let streamMic = null;
  let ctxAudio = null;
  let nodeProcessador = null;
  let modeloVosk = null;
  let reconhecedorVosk = null;
  let ultimoTextoOuvido = '';
  let ultimoComandoExecutadoEm = 0;
  /** Chave do último comando executado (evita partialresult + result do mesmo enunciado). */
  let ultimoComandoChave = '';
  /**
   * Comando já consumido no parcial da utterance atual.
   * Limpa no result final — assim o final não reexecuta o mesmo «próximo»/«voltar».
   */
  let comandoParcialConsumido = null;
  const TAXA_VOSK = 16000;

  function chaveComando(cmd) {
    if (!cmd || !cmd.tipo) return '';
    if (cmd.tipo === 'slide') return `slide:${cmd.slide}`;
    return cmd.tipo;
  }

  function cooldownParaComando(cmd) {
    if (cmd?.tipo === 'proximo' || cmd?.tipo === 'voltar') return COOLDOWN_NAVEGACAO_MS;
    return COOLDOWN_COMANDO_MS;
  }

  /** Windows/Boya costuma entregar 48000 Hz; o modelo Vosk espera 16000 Hz. */
  function reamostrarPara16kHz(canal, sampleRateOrigem) {
    if (sampleRateOrigem === TAXA_VOSK) return canal;
    const ratio = sampleRateOrigem / TAXA_VOSK;
    const n = Math.max(1, Math.floor(canal.length / ratio));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = canal[Math.floor(i * ratio)] ?? 0;
    return out;
  }

  const elWidget = () => document.getElementById('voz-slides-widget');
  const elBtnConn = () => document.getElementById('btn-voz-slides-toggle');
  const elBtnFloat = () => document.getElementById('btn-voz-slides-float');
  const elEstado = () => document.getElementById('voz-slides-estado');
  const elCmd = () => document.getElementById('voz-slides-ultimo-cmd');

  function lerPreferenciaArmazenada() {
    return false;
  }

  function gravarPreferencia(ativo) {
    if (ativo) return;
    try {
      localStorage.removeItem(LS_VOZ_SLIDES_ATIVO);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  function suportado() {
    return usaVosk || !!SpeechRecognition;
  }

  function indiceUltimoComLetra(musica) {
    const n = (musica?.estrofes || []).length;
    return Math.max(0, n - 1);
  }

  function indiceTelaPreta(musica) {
    return (musica?.estrofes || []).length;
  }

  function executarComando(cmd) {
    if (cmd.tipo === 'encerrar') {
      if (typeof encerrarComoEsc === 'function') encerrarComoEsc();
      return true;
    }
    if (cmd.tipo === 'modo_apresentacao') {
      if (typeof mudarModoApresentacao === 'function') mudarModoApresentacao();
      return true;
    }
    if (cmd.tipo === 'modo_slides') {
      if (typeof mudarModoSlides === 'function') mudarModoSlides();
      return true;
    }
    if (cmd.tipo === 'modo_completo') {
      if (typeof mudarModoCompleto === 'function') mudarModoCompleto();
      return true;
    }
    if (cmd.tipo === 'modo_biblia') {
      if (typeof mudarModoBiblia === 'function') mudarModoBiblia();
      return true;
    }

    const musica = obterMusicaAtiva();
    if (!musica || !Array.isArray(musica.estrofes) || !musica.estrofes.length) return false;

    switch (cmd.tipo) {
      case 'proximo':
        navegarDirecao(1);
        return true;
      case 'voltar':
        navegarDirecao(-1);
        return true;
      case 'primeiro':
        projecionarEstrofe(0);
        return true;
      case 'ultimo':
        projecionarEstrofe(indiceUltimoComLetra(musica));
        return true;
      case 'tela_preta':
        projecionarEstrofe(indiceTelaPreta(musica));
        return true;
      case 'slide': {
        const idx = (cmd.slide || 1) - 1;
        if (idx < 0 || idx > indiceTelaPreta(musica)) return false;
        projecionarEstrofe(idx);
        return true;
      }
      default:
        return false;
    }
  }

  function rotuloComando(cmd) {
    switch (cmd.tipo) {
      case 'proximo':
        return 'próximo';
      case 'voltar':
        return 'voltar';
      case 'primeiro':
        return 'primeiro';
      case 'ultimo':
        return 'último';
      case 'tela_preta':
        return 'tela preta';
      case 'encerrar':
        return 'encerrar';
      case 'modo_apresentacao':
        return 'modo mídia';
      case 'modo_slides':
        return 'modo slides';
      case 'modo_completo':
        return 'modo home';
      case 'modo_biblia':
        return 'modo bíblia';
      case 'slide':
        return String(cmd.slide);
      default:
        return '';
    }
  }

  function mostrarTextoOuvido(texto) {
    const t = String(texto || '').trim();
    if (!t) return;
    ultimoTextoOuvido = t;
    const cmdEl = elCmd();
    if (cmdEl) {
      cmdEl.textContent = `«${t}»`;
      cmdEl.hidden = false;
    }
  }

  function tentarExecutarComando(texto, { parcial = false } = {}) {
    const t = String(texto || '').trim();
    if (!t) return;
    mostrarTextoOuvido(t);

    const cmd = interpretarComandoVozSlides(t);
    if (!cmd) {
      if (!parcial) comandoParcialConsumido = null;
      return;
    }

    if (parcial) {
      if (cmd.tipo === 'slide') {
        if (!ehSomenteNumeroSlide(t)) return;
      } else {
        const tNorm = normalizarTextoVoz(t);
        const curtos = new Set([
          'proximo',
          'proxima',
          'voltar',
          'primeiro',
          'ultimo',
          'tela preta',
          'avancar',
          'seguinte',
          'passar',
          'encerrar',
          'encerra',
          'fechar',
          'fecha',
          'sair',
          'cancelar',
          'limpar',
        ]);
        if (!curtos.has(tNorm) && !/[a-z]+\s+(proximo|voltar|primeiro|ultimo)$/.test(tNorm)) {
          return;
        }
      }
    }

    const chave = chaveComando(cmd);

    // Já executou este comando no parcial desta utterance → ignora o result final (e partials repetidos).
    if (comandoParcialConsumido && comandoParcialConsumido === chave) {
      if (!parcial) comandoParcialConsumido = null;
      return;
    }

    const agora = Date.now();
    const cooldown = cooldownParaComando(cmd);
    if (
      chave === ultimoComandoChave &&
      agora - ultimoComandoExecutadoEm < cooldown
    ) {
      if (!parcial) comandoParcialConsumido = null;
      return;
    }

    if (!executarComando(cmd)) {
      if (!parcial) comandoParcialConsumido = null;
      return;
    }

    ultimoComandoExecutadoEm = agora;
    ultimoComandoChave = chave;
    ultimoComando = rotuloComando(cmd);
    if (parcial) comandoParcialConsumido = chave;
    else comandoParcialConsumido = null;
    atualizarUi();
  }

  function processarTextoFalado(texto) {
    tentarExecutarComando(texto, { parcial: false });
  }

  function estaOuvindo() {
    if (usaVosk) return fase === 'ouvindo';
    return fase === 'ouvindo';
  }

  function atualizarUi() {
    const widget = elWidget();
    const btnConn = elBtnConn();
    const btnFloat = elBtnFloat();
    const estado = elEstado();
    const cmdEl = elCmd();
    const noModo = uiVozDisponivel();
    const ativo = desejadoAtivo && noModo;
    const disp = suportado();
    const ouvindo = ativo && estaOuvindo();

    if (widget) {
      widget.hidden = !noModo;
      widget.classList.toggle('voz-slides-widget--off', !ativo);
      widget.classList.toggle('voz-slides-widget--ouvindo', ouvindo);
      widget.classList.toggle('voz-slides-widget--erro', ativo && fase === 'erro');
    }

    const tituloBtn = !disp
      ? 'Reconhecimento de voz indisponível'
      : ativo
        ? 'Desativar comandos de voz'
        : 'Ativar comandos de voz (microfone)';

    for (const btn of [btnConn, btnFloat]) {
      if (!btn) continue;
      btn.disabled = !disp || !noModo;
      btn.classList.toggle('ativo', ativo);
      btn.classList.toggle('voz-mic--on', ativo);
      btn.classList.toggle('voz-mic--off', !ativo);
      btn.classList.toggle('voz-mic--ouvindo', ouvindo);
      btn.title = tituloBtn;
      btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    }

    if (estado) {
      if (!disp) estado.textContent = 'Voz indisponível';
      else if (!ativo && mensagemErro) estado.textContent = mensagemErro;
      else if (!ativo) estado.textContent = 'Microfone desligado';
      else if (fase === 'baixando') estado.textContent = mensagemErro || 'Baixando modelo…';
      else if (fase === 'preparando') estado.textContent = 'A preparar…';
      else if (fase === 'ouvindo') estado.textContent = 'Ouvindo…';
      else if (fase === 'erro') estado.textContent = mensagemErro || 'Erro no microfone';
      else estado.textContent = 'A ligar…';
    }

    if (cmdEl) {
      if (ultimoComando) {
        cmdEl.textContent = `«${ultimoComando}»`;
        cmdEl.hidden = false;
      } else if (ativo && ultimoTextoOuvido) {
        cmdEl.textContent = `«${ultimoTextoOuvido}»`;
        cmdEl.hidden = false;
      } else {
        cmdEl.textContent = '—';
        cmdEl.hidden = true;
      }
    }

  }

  function limparReinicioTimer() {
    if (reinicioTimer) {
      clearTimeout(reinicioTimer);
      reinicioTimer = null;
    }
  }

  function pararSomenteMicrofone() {
    try {
      if (nodeProcessador) {
        nodeProcessador.onaudioprocess = null;
        nodeProcessador.disconnect();
      }
    } catch (_) {
  // intencional — erro ignorado
}
    nodeProcessador = null;
    try {
      if (ctxAudio && ctxAudio.state !== 'closed') void ctxAudio.close();
    } catch (_) {
  // intencional — erro ignorado
}
    ctxAudio = null;
    if (streamMic) {
      streamMic.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {
  // intencional — erro ignorado
}
      });
    }
    streamMic = null;
  }

  function desligarVoskCompletamente() {
    pararSomenteMicrofone();
    try {
      if (reconhecedorVosk) reconhecedorVosk.remove();
    } catch (_) {
  // intencional — erro ignorado
}
    reconhecedorVosk = null;
    try {
      if (modeloVosk) modeloVosk.terminate();
    } catch (_) {
  // intencional — erro ignorado
}
    modeloVosk = null;
    comandoParcialConsumido = null;
    ultimoComandoChave = '';
  }

  async function iniciarCapturaMicVosk() {
    pararSomenteMicrofone();

    streamMic = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    ctxAudio = new AudioContext();
    if (!reconhecedorVosk) {
      const gramatica = montarGramaticaVoskComandos();
      reconhecedorVosk = new modeloVosk.KaldiRecognizer(TAXA_VOSK, gramatica);
      reconhecedorVosk.on('result', (message) => {
        const texto = message?.result?.text;
        if (texto) {
          processarTextoFalado(texto);
        } else {
          // Resultado final vazio: encerra a utterance sem reexecutar o parcial.
          comandoParcialConsumido = null;
        }
      });
      reconhecedorVosk.on('partialresult', (message) => {
        const parcial = message?.result?.partial;
        if (parcial) tentarExecutarComando(parcial, { parcial: true });
      });
    }

    const origem = ctxAudio.createMediaStreamSource(streamMic);
    nodeProcessador = ctxAudio.createScriptProcessor(TAMANHO_BUFFER_AUDIO, 1, 1);
    const taxaEntrada = ctxAudio.sampleRate;
    nodeProcessador.onaudioprocess = (ev) => {
      if (!desejadoAtivo || fase !== 'ouvindo' || !reconhecedorVosk) return;
      try {
        const canal = ev.inputBuffer.getChannelData(0);
        const mono16k = reamostrarPara16kHz(canal, taxaEntrada);
        reconhecedorVosk.acceptWaveformFloat(mono16k, TAXA_VOSK);
      } catch (_) {
  // intencional — erro ignorado
}
    };
    origem.connect(nodeProcessador);
    nodeProcessador.connect(ctxAudio.destination);
  }

  function desligarVosk() {
    desligarVoskCompletamente();
    fase = 'parado';
    mensagemErro = '';
  }

  async function ligarVosk() {
    if (!voskApi) return;
    fase = 'preparando';
    mensagemErro = 'A preparar modelo de voz…';
    atualizarUi();

    try {
      const meta = await voskApi.obterUrlModelo();
      if (!meta?.ok || !meta.url) {
        throw new Error(
          meta?.erro ||
            'Não foi possível obter o modelo de voz. Na primeira vez é necessária internet (≈50 MB).'
        );
      }

      fase = 'baixando';
      mensagemErro = 'A carregar modelo de voz (1ª vez ≈30 MB)…';
      atualizarUi();

      const Vosk = await carregarBibliotecaVosk();
      modeloVosk = await criarModeloVoskComTimeout(Vosk, meta.url);
      reconhecedorVosk = null;

      await iniciarCapturaMicVosk();
      fase = 'ouvindo';
      mensagemErro = '';
      falhasWebSpeech = 0;
      atualizarUi();
    } catch (err) {
      console.error('[voz-slides]', err);
      fase = 'erro';
      mensagemErro =
        err?.message ||
        'Falha ao iniciar voz. Confirme o microfone Boya V2 como entrada padrão do Windows.';
      desejadoAtivo = false;
      gravarPreferencia(false);
      desligarVosk();
      atualizarUi();
    }
  }

  function pararWebSpeech() {
    fase = 'parado';
    if (!recognition) return;
    try {
      recognition.onend = null;
      recognition.stop();
    } catch (_) {
  // intencional — erro ignorado
}
    recognition.onend = onEndWebSpeech;
  }

  function onResultWebSpeech(event) {
    let texto = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) texto += event.results[i][0].transcript;
    }
    texto = texto.trim();
    if (texto) processarTextoFalado(texto);
  }

  function onErrorWebSpeech(ev) {
    const err = ev?.error || '';
    fase = 'erro';
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      mensagemErro = 'Permissão de microfone negada';
      desejadoAtivo = false;
      gravarPreferencia(false);
      atualizarUi();
      return;
    }
    if (err === 'network') {
      falhasWebSpeech += 1;
      mensagemErro =
        'Voz online indisponível no Electron. Use o app controlador (.exe) com reconhecimento offline.';
      if (falhasWebSpeech >= 3) {
        desejadoAtivo = false;
        gravarPreferencia(false);
        atualizarUi();
        return;
      }
    } else if (err !== 'no-speech' && err !== 'aborted') {
      mensagemErro = `Erro: ${err}`;
    }
    atualizarUi();
    if (desejadoAtivo && ehModoSlides() && err !== 'aborted' && err !== 'not-allowed') {
      limparReinicioTimer();
      reinicioTimer = setTimeout(() => {
        reinicioTimer = null;
        if (desejadoAtivo) iniciarWebSpeech();
      }, err === 'network' ? 3000 : 800);
    }
  }

  function onEndWebSpeech() {
    if (!desejadoAtivo) {
      fase = 'parado';
      atualizarUi();
      return;
    }
    limparReinicioTimer();
    reinicioTimer = setTimeout(() => {
      reinicioTimer = null;
      iniciarWebSpeech();
    }, 600);
  }

  function onStartWebSpeech() {
    fase = 'ouvindo';
    falhasWebSpeech = 0;
    atualizarUi();
  }

  function criarInstanciaWebSpeech() {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.lang = 'pt-BR';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = onResultWebSpeech;
    r.onerror = onErrorWebSpeech;
    r.onend = onEndWebSpeech;
    r.onstart = onStartWebSpeech;
    return r;
  }

  function iniciarWebSpeech() {
    if (!desejadoAtivo || !ehModoSlides() || !SpeechRecognition) return;
    if (!recognition) recognition = criarInstanciaWebSpeech();
    if (!recognition) return;
    fase = 'preparando';
    atualizarUi();
    try {
      recognition.start();
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/already started/i.test(msg)) {
        fase = 'ouvindo';
        atualizarUi();
        return;
      }
      onErrorWebSpeech({ error: 'network' });
    }
  }

  async function definirAtivo(ativo, optsInternos = {}) {
    const { persistir = true } = optsInternos;
    desejadoAtivo = !!ativo && suportado();
    if (persistir) gravarPreferencia(desejadoAtivo);

    limparReinicioTimer();

    if (!desejadoAtivo) {
      if (usaVosk) desligarVosk();
      else pararWebSpeech();
      fase = 'parado';
      mensagemErro = '';
    } else if (usaVosk) {
      await ligarVosk();
    } else {
      iniciarWebSpeech();
    }
    atualizarUi();
  }

  function alternarAtivo() {
    void definirAtivo(!desejadoAtivo);
  }

  function aoEntrarModoSlides() {
    ultimoComando = '';
    if (lerPreferenciaArmazenada()) void definirAtivo(true, { persistir: false });
    else atualizarUi();
  }

  function aoSairModoSlides() {
    limparReinicioTimer();
    void definirAtivo(false, { persistir: false });
    ultimoComando = '';
    atualizarUi();
  }

  function aoEntrarModoApresentacao() {
    ultimoComando = '';
    if (lerPreferenciaArmazenada()) void definirAtivo(true, { persistir: false });
    else atualizarUi();
  }

  function initDom() {
    /* Ambos os botões (cabeçalho e flutuante) usam onclick="alternarVozSlides()",
       que despacha para o módulo do modo activo — slides ou Bíblia. Um listener
       directo aqui roubaria o clique ao módulo da Bíblia e anularia o toggle. */
    atualizarUi();
  }

  return {
    initDom,
    suportado,
    alternarAtivo,
    definirAtivo,
    aoEntrarModoSlides,
    aoSairModoSlides,
    aoEntrarModoApresentacao,
    atualizarUi,
  };
}
