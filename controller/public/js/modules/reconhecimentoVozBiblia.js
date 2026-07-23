/**
 * Comandos de voz no modo Bíblia (Vosk offline no Electron).
 * Padrão: «[livro] capítulo N versículo M» → navega e projeta o versículo.
 * Independente do reconhecimento do modo Slides.
 */

import { LS_VOZ_BIBLIA_ATIVO } from './chavesArmazenamentoLocal.js';
import { normalizarTextoVoz } from './textoVoz.js';

/**
 * Reconhecimento de voz DESATIVADO no modo Bíblia (igual Home e Mídias):
 * botão de voz fica desabilitado e o ícone flutuante não aparece.
 * Para reativar no futuro, basta voltar esta flag para `true`.
 */
const VOZ_BIBLIA_ATIVA = false;

/**
 * Números falados em português (0–199), gerados uma única vez.
 * Cobre capítulos e versículos altos (ex.: Salmo 119, versículo 176) — o mapa
 * fixo anterior parava nas dezenas e falhava em muitos casos. `TOKENS_NUMEROS_VOZ`
 * reúne as palavras isoladas para a gramática do Vosk.
 */
const UNIDADES_VOZ = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const ESPECIAIS_VOZ = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS_VOZ = { 20: 'vinte', 30: 'trinta', 40: 'quarenta', 50: 'cinquenta', 60: 'sessenta', 70: 'setenta', 80: 'oitenta', 90: 'noventa' };

const NUMEROS_PALAVRAS = {};
const TOKENS_NUMEROS_VOZ = new Set();

(function construirNumerosPortugues() {
  const add = (frase, n) => {
    const f = String(frase).trim().replace(/\s+/g, ' ');
    if (!f) return;
    if (!(f in NUMEROS_PALAVRAS)) NUMEROS_PALAVRAS[f] = n;
    for (const w of f.split(' ')) TOKENS_NUMEROS_VOZ.add(w);
  };
  const nomeNumero = (n) => {
    if (n < 10) return UNIDADES_VOZ[n];
    if (n < 20) return ESPECIAIS_VOZ[n - 10];
    const d = Math.floor(n / 10) * 10;
    const u = n % 10;
    return u === 0 ? DEZENAS_VOZ[d] : `${DEZENAS_VOZ[d]} e ${UNIDADES_VOZ[u]}`;
  };
  UNIDADES_VOZ.forEach((w, i) => add(w, i));
  add('uma', 1);
  add('duas', 2);
  add('catorze', 14);
  ESPECIAIS_VOZ.forEach((w, i) => add(w, 10 + i));
  for (const [dez, palavra] of Object.entries(DEZENAS_VOZ)) {
    const d = Number(dez);
    add(palavra, d);
    for (let u = 1; u <= 9; u++) {
      add(`${palavra} e ${UNIDADES_VOZ[u]}`, d + u); // "vinte e dois"
      add(`${palavra}${UNIDADES_VOZ[u]}`, d + u); // "vintedois" (o Vosk às vezes junta)
    }
  }
  add('cem', 100);
  add('cento', 100);
  for (let n = 1; n <= 99; n++) add(`cento e ${nomeNumero(n)}`, 100 + n);
  TOKENS_NUMEROS_VOZ.add('e');
})();

/** Aliases de pronúncia → nome canônico em `LIVROS`. */
const ALIASES_LIVRO_VOZ = {
  genesis: 'Gênesis',
  genesi: 'Gênesis',
  exodo: 'Êxodo',
  levitico: 'Levítico',
  numeros: 'Números',
  deuteronomio: 'Deuteronômio',
  josue: 'Josué',
  juizes: 'Juízes',
  rute: 'Rute',
  samuel: '1 Samuel',
  '1 samuel': '1 Samuel',
  '2 samuel': '2 Samuel',
  reis: '1 Reis',
  '1 reis': '1 Reis',
  '2 reis': '2 Reis',
  cronicas: '1 Crônicas',
  '1 cronicas': '1 Crônicas',
  '2 cronicas': '2 Crônicas',
  esdras: 'Esdras',
  neemias: 'Neemias',
  ester: 'Ester',
  job: 'Jó',
  salmos: 'Salmos',
  salmo: 'Salmos',
  proverbios: 'Provérbios',
  eclesiastes: 'Eclesiastes',
  cantares: 'Cantares',
  isaias: 'Isaías',
  jeremias: 'Jeremias',
  lamentacoes: 'Lamentações',
  ezequiel: 'Ezequiel',
  daniel: 'Daniel',
  oseias: 'Oséias',
  joel: 'Joel',
  amos: 'Amós',
  obadias: 'Obadias',
  jonas: 'Jonas',
  miqueias: 'Miquéias',
  naum: 'Naum',
  habacuque: 'Habacuque',
  sofonias: 'Sofonias',
  ageu: 'Ageu',
  zacarias: 'Zacarias',
  malaquias: 'Malaquias',
  mateus: 'Mateus',
  marcos: 'Marcos',
  lucas: 'Lucas',
  joao: 'João',
  jo: 'João',
  atos: 'Atos',
  romanos: 'Romanos',
  corintios: '1 Coríntios',
  '1 corintios': '1 Coríntios',
  '2 corintios': '2 Coríntios',
  galatas: 'Gálatas',
  efesios: 'Efésios',
  filipenses: 'Filipenses',
  colossenses: 'Colossenses',
  tessalonicenses: '1 Tessalonicenses',
  '1 tessalonicenses': '1 Tessalonicenses',
  '2 tessalonicenses': '2 Tessalonicenses',
  timoteo: '1 Timóteo',
  '1 timoteo': '1 Timóteo',
  '2 timoteo': '2 Timóteo',
  tito: 'Tito',
  filemom: 'Filemom',
  hebreus: 'Hebreus',
  tiago: 'Tiago',
  pedro: '1 Pedro',
  '1 pedro': '1 Pedro',
  '2 pedro': '2 Pedro',
  '1 joao': '1 João',
  '2 joao': '2 João',
  '3 joao': '3 João',
  judas: 'Judas',
  apocalipse: 'Apocalipse',
  ap: 'Apocalipse',
};

function parseNumeroBiblia(fragmento) {
  const t = normalizarTextoVoz(fragmento);
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 1 && n <= 200 ? n : null;
  }
  if (Object.prototype.hasOwnProperty.call(NUMEROS_PALAVRAS, t)) {
    const n = NUMEROS_PALAVRAS[t];
    return n >= 1 && n <= 200 ? n : null;
  }
  return null;
}

function indicePorNomeCanonico(livros, nome) {
  return livros.findIndex((l) => l.nome === nome);
}

/** Cache: sigla normalizada → livro (ex.: gn, dn, 1co, 1sm). */
let cacheIndiceSiglas = null;
let cacheIndiceSiglasLivros = null;

function obterIndiceSiglas(livros) {
  if (cacheIndiceSiglasLivros === livros && cacheIndiceSiglas) return cacheIndiceSiglas;
  const map = new Map();
  for (const l of livros) {
    const s = normalizarTextoVoz(l.sigla);
    if (!s) continue;
    if (!map.has(s)) map.set(s, l);
    const semPontuacao = s.replace(/[^a-z0-9]/g, '');
    if (semPontuacao && !map.has(semPontuacao)) map.set(semPontuacao, l);
  }
  cacheIndiceSiglas = map;
  cacheIndiceSiglasLivros = livros;
  return map;
}

/**
 * Vosk pode ouvir siglas soletradas: «g n» → gn, «1 co» → 1co, «d n» → dn.
 */
function compactarTrechoSiglaFalada(trecho) {
  const partes = normalizarTextoVoz(trecho).split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  const pareceSiglaSoletrada = partes.every(
    (p) => /^\d+$/.test(p) || (p.length >= 1 && p.length <= 3 && /^[a-z]+$/.test(p))
  );
  if (!pareceSiglaSoletrada) return partes.join(' ');
  return partes.join('');
}

function variantesTrechoLivro(trecho) {
  const base = normalizarTextoVoz(trecho);
  if (!base) return [];
  const compacto = compactarTrechoSiglaFalada(trecho);
  const lista = [base];
  if (compacto && compacto !== base) lista.push(compacto);
  return lista;
}

function resolverLivroPorTrecho(trecho, livros) {
  if (!trecho) return null;
  const indiceSiglas = obterIndiceSiglas(livros);

  for (const t of variantesTrechoLivro(trecho)) {
    if (!t) continue;

    if (indiceSiglas.has(t)) return indiceSiglas.get(t);

    if (ALIASES_LIVRO_VOZ[t]) {
      const idx = indicePorNomeCanonico(livros, ALIASES_LIVRO_VOZ[t]);
      if (idx >= 0) return livros[idx];
    }

    const porSigla = livros.filter((l) => normalizarTextoVoz(l.sigla) === t);
    if (porSigla.length === 1) return porSigla[0];

    const porNomeExato = livros.filter((l) => normalizarTextoVoz(l.nome) === t);
    if (porNomeExato.length === 1) return porNomeExato[0];
  }

  const t = normalizarTextoVoz(trecho);
  const porPrefixo = livros.filter(
    (l) =>
      normalizarTextoVoz(l.nome).startsWith(t) ||
      normalizarTextoVoz(l.nome).includes(` ${t}`) ||
      normalizarTextoVoz(l.sigla).startsWith(t)
  );
  if (porPrefixo.length === 1) return porPrefixo[0];

  const porAliasParcial = Object.entries(ALIASES_LIVRO_VOZ).filter(
    ([alias]) => alias.startsWith(t) || t.startsWith(alias)
  );
  if (porAliasParcial.length === 1) {
    const idx = indicePorNomeCanonico(livros, porAliasParcial[0][1]);
    if (idx >= 0) return livros[idx];
  }

  return null;
}

/** Palavras opcionais entre livro e números (removidas antes de interpretar). */
const PALAVRAS_OMITIDAS_REF = new Set([
  'capitulo',
  'cap',
  'versiculo',
  'vers',
  'verso',
  'ver',
  'vs',
  'v',
]);

/**
 * Lê um número no fim da lista de tokens (ex.: «22» ou «vinte e dois»).
 * @returns {{ n: number, len: number } | null}
 */
function parseNumeroNoFinal(tokens, maxPalavras = 5) {
  const lim = Math.min(maxPalavras, tokens.length);
  for (let len = lim; len >= 1; len--) {
    const frag = tokens.slice(-len).join(' ');
    const n = parseNumeroBiblia(frag);
    if (n != null) return { n, len };
  }
  return null;
}

/**
 * Formato compacto: «genesis 2 22», «joao cap 3 ver 16», «salmos capitulo 23 1»…
 * @param {string[]} tokens
 */
function interpretarTokensReferenciaBiblia(tokens, livros) {
  let partes = tokens.filter((p) => p && !PALAVRAS_OMITIDAS_REF.has(p));
  if (partes.length < 3) return null;

  const verRes = parseNumeroNoFinal(partes, 5);
  if (!verRes) return null;
  partes = partes.slice(0, -verRes.len);

  const capRes = parseNumeroNoFinal(partes, 5);
  if (!capRes) return null;
  partes = partes.slice(0, -capRes.len);

  if (!partes.length) return null;

  const livro = resolverLivroPorTrecho(partes.join(' '), livros);
  if (!livro) return null;

  return { livro: livro.nome, capitulo: capRes.n, versiculo: verRes.n };
}

/**
 * @param {string} texto
 * @param {{ nome: string, sigla: string }[]} livros
 * @returns {{ livro: string, capitulo: number, versiculo: number } | null}
 */
export function interpretarVersiculoVozBiblia(texto, livros) {
  const t = normalizarTextoVoz(texto);
  if (!t || !Array.isArray(livros) || !livros.length) return null;

  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  return interpretarTokensReferenciaBiblia(tokens, livros);
}

/**
 * Gramática do Vosk para o modo Bíblia: restringe o vocabulário aos nomes de
 * livros, números (0–199) e conectores. Sem isto o Vosk decodifica com o
 * dicionário aberto e erra muito — obrigando a repetir a referência.
 */
function montarGramaticaVozBiblia(livros) {
  const frases = new Set();
  for (const tk of TOKENS_NUMEROS_VOZ) frases.add(tk);
  for (let n = 1; n <= 199; n++) frases.add(String(n));
  for (const w of ['capitulo', 'cap', 'versiculo', 'vers', 'verso', 'ver', 'vs', 'v']) frases.add(w);
  for (const l of livros || []) {
    for (const w of normalizarTextoVoz(l.nome).split(' ')) if (w) frases.add(w);
  }
  for (const alias of Object.keys(ALIASES_LIVRO_VOZ)) {
    for (const w of alias.split(' ')) if (w) frases.add(w);
  }
  return JSON.stringify([...frases]);
}

const URL_VOSK_LIB = 'http://127.0.0.1:3001/vendor/vosk-browser/vosk.js';
const TAMANHO_BUFFER_AUDIO = 2048;
const COOLDOWN_COMANDO_MS = 1200;

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
 * @param {() => boolean} opts.ehModoBiblia
 * @param {{ nome: string, sigla: string }[]} opts.livros
 * @param {(ref: { livro: string, capitulo: number, versiculo: number }) => Promise<boolean>} opts.navegarEProjetarVersiculo
 */
export function criarReconhecimentoVozBiblia(opts) {
  const { ehModoBiblia, livros, navegarEProjetarVersiculo } = opts;

  const voskApi = apiVoskElectron();
  const usaVosk = !!voskApi;

  let desejadoAtivo = false;
  let fase = 'parado';
  let mensagemErro = '';
  let ultimoComando = '';
  let streamMic = null;
  let ctxAudio = null;
  let nodeProcessador = null;
  let modeloVosk = null;
  let reconhecedorVosk = null;
  let ultimoComandoExecutadoEm = 0;
  let ultimaRefChave = '';
  let processandoVersiculo = false;
  const TAXA_VOSK = 16000;

  /** Reconhecedor com gramática restrita; se o modelo recusar, cai no vocabulário aberto. */
  function criarReconhecedorVoskBiblia() {
    try {
      const gramatica = montarGramaticaVozBiblia(livros);
      return new modeloVosk.KaldiRecognizer(TAXA_VOSK, gramatica);
    } catch (err) {
      console.warn('[voz-biblia] gramática recusada; usando vocabulário aberto', err);
      return new modeloVosk.KaldiRecognizer(TAXA_VOSK);
    }
  }

  function reamostrarPara16kHz(canal, sampleRateOrigem) {
    if (sampleRateOrigem === TAXA_VOSK) return canal;
    const ratio = sampleRateOrigem / TAXA_VOSK;
    const n = Math.max(1, Math.floor(canal.length / ratio));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = canal[Math.floor(i * ratio)] ?? 0;
    return out;
  }

  /* O widget de voz é partilhado com o modo slides: em modo Bíblia o módulo de
     slides esconde-o (uiVozDisponivel() === false) e este assume o comando. */
  const elBtnConn = () => document.getElementById('btn-voz-slides-toggle');
  const elWidget = () => document.getElementById('voz-slides-widget');
  const elBtnFloat = () => document.getElementById('btn-voz-slides-float');
  const elEstado = () => document.getElementById('voz-slides-estado');
  const elCmd = () => document.getElementById('voz-slides-ultimo-cmd');

  function lerPreferenciaArmazenada() {
    try {
      return localStorage.getItem(LS_VOZ_BIBLIA_ATIVO) === '1';
    } catch (_) {
      return false;
    }
  }

  function gravarPreferencia(ativo) {
    try {
      if (ativo) localStorage.setItem(LS_VOZ_BIBLIA_ATIVO, '1');
      else localStorage.removeItem(LS_VOZ_BIBLIA_ATIVO);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  function suportado() {
    return usaVosk;
  }

  function estaOuvindo() {
    return fase === 'ouvindo';
  }

  function atualizarUi() {
    const btnConn = elBtnConn();
    const btnFloat = elBtnFloat();
    const widget = elWidget();
    const estado = elEstado();
    const cmdEl = elCmd();
    const noModo = VOZ_BIBLIA_ATIVA && ehModoBiblia();
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
        ? 'Desativar voz — Bíblia'
        : 'Ativar voz — Bíblia (ex.: Gn 2 4, genesis 2 22, João 3 16)';

    for (const btn of [btnConn, btnFloat]) {
      if (!btn) continue;
      btn.disabled = !disp || !noModo;
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
      else if (fase === 'ouvindo') estado.textContent = 'Ouvindo referência…';
      else if (fase === 'erro') estado.textContent = mensagemErro || 'Erro no microfone';
      else estado.textContent = 'A ligar…';
    }

    if (cmdEl) {
      if (ultimoComando) {
        cmdEl.textContent = `«${ultimoComando}»`;
        cmdEl.hidden = false;
      } else {
        cmdEl.textContent = '—';
        cmdEl.hidden = true;
      }
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
      streamMic.getTracks().forEach((tr) => {
        try {
          tr.stop();
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
  }

  async function tentarNavegarVersiculo(ref) {
    if (!ref || processandoVersiculo) return;
    processandoVersiculo = true;
    try {
      const ok = await navegarEProjetarVersiculo(ref);
      if (ok) {
        ultimoComando = `${ref.livro} ${ref.capitulo}:${ref.versiculo}`;
        atualizarUi();
      }
    } finally {
      processandoVersiculo = false;
    }
  }

  function processarTextoFalado(texto) {
    const ref = interpretarVersiculoVozBiblia(texto, livros);
    if (!ref) return;
    const chave = `${ref.livro} ${ref.capitulo}:${ref.versiculo}`;
    const agora = Date.now();
    // Bloqueia só a mesma referência dentro do cooldown (evita parcial+final
    // reprojetarem); uma referência diferente é aceita de imediato.
    if (chave === ultimaRefChave && agora - ultimoComandoExecutadoEm < COOLDOWN_COMANDO_MS) return;
    ultimaRefChave = chave;
    ultimoComandoExecutadoEm = agora;
    void tentarNavegarVersiculo(ref);
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
      reconhecedorVosk = criarReconhecedorVoskBiblia();
      reconhecedorVosk.on('result', (message) => {
        const t = message?.result?.text;
        if (t) processarTextoFalado(t);
      });
      // Resultado parcial: dispara assim que a referência já é válida, sem
      // esperar a pausa final — evita ter de repetir. O dedupe abaixo impede
      // que o resultado final reprojete a mesma referência.
      reconhecedorVosk.on('partialresult', (message) => {
        const p = message?.result?.partial;
        if (p) processarTextoFalado(p);
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
      atualizarUi();
    } catch (err) {
      console.error('[voz-biblia]', err);
      fase = 'erro';
      mensagemErro =
        err?.message ||
        'Falha ao iniciar voz. Confirme o microfone como entrada padrão do Windows.';
      desejadoAtivo = false;
      gravarPreferencia(false);
      desligarVosk();
      atualizarUi();
    }
  }

  async function definirAtivo(ativo, optsInternos = {}) {
    const { persistir = true } = optsInternos;
    desejadoAtivo = VOZ_BIBLIA_ATIVA && !!ativo && suportado();
    if (persistir) gravarPreferencia(desejadoAtivo);

    if (!desejadoAtivo) {
      desligarVosk();
      fase = 'parado';
      mensagemErro = '';
    } else {
      await ligarVosk();
    }
    atualizarUi();
  }

  function alternarAtivo() {
    void definirAtivo(!desejadoAtivo);
  }

  function aoEntrarModoBiblia() {
    ultimoComando = '';
    if (lerPreferenciaArmazenada()) void definirAtivo(true, { persistir: false });
    else atualizarUi();
  }

  function aoSairModoBiblia() {
    void definirAtivo(false, { persistir: false });
    ultimoComando = '';
    atualizarUi();
  }

  function initDom() {
    atualizarUi();
  }

  return {
    initDom,
    suportado,
    alternarAtivo,
    definirAtivo,
    aoEntrarModoBiblia,
    aoSairModoBiblia,
    atualizarUi,
    interpretarVersiculoVozBiblia: (texto) => interpretarVersiculoVozBiblia(texto, livros),
  };
}
