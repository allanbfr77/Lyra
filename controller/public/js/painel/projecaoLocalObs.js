/**
 * Modo «projetar nesta máquina» (IPC para o motor deste processo) e URLs de OBS. Movido verbatim do
 * núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasProjecaoLocalObs`.
 */
import { bibliaAplicarCfgExibicao } from './biblia.js';
import { criarMotorAudioLocal } from '../modules/motorAudioLocal.js';
import { criarTransporteLocal } from '../modules/projecaoPorta.js';
import { slidesAplicarCfgArmazenada } from './configExibicao.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { carregarRoteamentoTelasDoServidor } from './roteamentoTelas.js';
import { ehModoBibliaOperador } from './modosUi.js';
import { emitirEstadoMinistranteAoServidor } from './previewProjecao.js';
import { getServidorIp } from './servidorAlvo.js';
import { recordarIpsDestaMaquina, setStatusServidorRemoto } from './socketPainelApi.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasProjecaoLocalObs(d) {
  dep = d || {};
}
const atualizarUiConexao = (...a) => dep.atualizarUiConexao(...a);

/* ─── Modo «projetar nesta máquina» ─────────────────────────────────────────────
 *
 * O painel não muda: os mesmos comandos, pela mesma porta de projeção. O que muda é o
 * transporte por baixo dela — IPC para o motor deste processo, em vez de socket para o
 * Servidor. Nenhum call site sabe em qual dos dois está, que era o propósito da Peça 1.
 *
 * OBS e celular continuam a ligar-se à 5510, agora servida pelo Controlador. Quem impede
 * dois donos das mesmas telas é o próprio `listen`: com o Servidor aberto, a porta está
 * ocupada e o modo local recusa arrancar.
 */

/**
 * O modo de operação NÃO se guarda. Vive na sessão e morre com ela.
 *
 * Ligar ao Servidor é uma decisão sobre *este arranque*, não uma declaração permanente
 * sobre o PC. Quem opera duas máquinas hoje pode estar sozinho com uma amanhã, e um
 * Controlador que abrisse a apontar para um Servidor ausente ficava preso num
 * «conectando» sem nada projetável — para desfazer isso era preciso saber que existia um
 * menu que o desfazia. O padrão é o que funciona sempre: projeta-se nesta máquina.
 *
 * Por isso não há chave de preferência, nem em `localStorage`, nem em ficheiro de
 * configuração, nem em base de dados. A ligação ao Servidor é sempre um acto explícito do
 * operador — no badge ou em Ajustes › Conexão — repetido a cada abertura.
 *
 * Nota sobre `LS_IP_KEY`: o *endereço* pode ficar guardado (preferência «Lembrar IP»),
 * e isso não contradiz o acima. Guardar o IP poupa redigitação; não liga nada sozinho.
 * Quem decide ligar é o clique. Sem «Lembrar IP», o campo limpa-se no próximo arranque.
 *
 * A chave `lyra_projetar_nesta_maquina`, de versões que persistiam a escolha, é apagada no
 * arranque por `migrarChavesLegadoLocalStorage` — ver `CHAVES_OBSOLETAS` nesse módulo.
 */

/** Verdadeiro entre o clique no menu e a resposta do processo principal. */
let projecaoLocalEmCurso = false;

/**
 * Verdadeiro enquanto o motor local está mesmo de pé.
 *
 * Distinto da *intenção* de estar em modo local, e a distinção não é académica: enquanto o
 * modo local se derivava da intenção declarada, uma tentativa falhada — porta ocupada
 * porque o Servidor está aberto — deixava o painel a acreditar que projetava localmente.
 * E aí recusava-se a ligar ao Servidor, porque «está em modo local», e não projetava,
 * porque não está. Ficava preso entre os dois.
 */
let projecaoLocalActiva = false;

/**
 * Motor que toca o áudio quando a projeção corre nesta máquina.
 *
 * Criado só quando há ponte (dentro do aplicativo) e ligado só no modo local — no remoto
 * quem toca é a janela de controle do Servidor, e dois motores a tocar dariam eco.
 */
let motorAudioLocal = null;

function garantirMotorAudioLocal() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.audio) return null;
  if (!motorAudioLocal) motorAudioLocal = criarMotorAudioLocal(ponte.audio);
  return motorAudioLocal;
}

/**
 * O painel está — ou está a ficar — em modo local?
 *
 * Serve de guarda ao auto-reconectar e à resolução do endereço da projeção. Cobre a
 * janela entre o clique e o arranque (`emCurso`) e o período em que o motor está de facto
 * a correr (`activa`) — nunca a mera intenção gravada.
 */
export function emModoProjecaoLocal() {
  return projecaoLocalEmCurso || projecaoLocalActiva;
}

/** A ponte só existe dentro do Electron; no browser o modo local não se aplica. */
export function ponteProjecaoLocal() {
  return window.lyraElectron?.projecaoLocal || null;
}

/**
 * Liga o modo local e aponta a porta de projeção ao motor deste processo.
 *
 * @returns {Promise<{ ok: boolean, erro?: string }>}
 */
export async function ligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  if (!ponte) return { ok: false, erro: 'modo local indisponível fora do aplicativo' };

  setStatusServidorRemoto('ocioso');
  /* `projecaoLocalEmCurso` bloqueia o auto-reconectar enquanto isto decorre: abrir as
     janelas de projeção rouba o foco, o foco dispara `tentarAutoConectarSeDesconectado`,
     e o painel ia atrás de um Servidor no meio do arranque do modo local. */
  projecaoLocalEmCurso = true;
  let r;
  try {
    r = await ponte.ligar();
  } catch (e) {
    r = { ok: false, erro: e?.message || String(e) };
  } finally {
    projecaoLocalEmCurso = false;
  }
  if (!r?.ok) {
    projecaoLocalActiva = false;
    setStatusServidorRemoto('ocioso');
    atualizarUiConexao(false);
    return r || { ok: false, erro: 'falha desconhecida' };
  }
  projecaoLocalActiva = true;

  /* Desligar o socket antes de trocar de transporte: um Servidor ainda ligado continuaria
     a mandar `estado` para o painel e a disputar as telas com o motor local. */
  try {
    if (estadoPainel.socket) estadoPainel.socket.disconnect();
  } catch (_) {
    // intencional
  }

  projecao.usarTransporte(criarTransporteLocal(ponte));
  garantirMotorAudioLocal()?.ligar();
  /* Nada se grava aqui: o modo local é o padrão de todo arranque, e um padrão não precisa
     de ser lembrado. */
  estadoPainel.papelControladorLocal = { primario: true, podeEscrever: true, donoAtual: null };
  setStatusServidorRemoto('ocioso');
  atualizarUiConexao(true);
  if (r.lanIp) {
    servidorLanIpObs = String(r.lanIp).trim();
    atualizarUrlsObs();
  }
  recordarIpsDestaMaquina(r.lanIps, r.lanIp);

  /* O mesmo que o handler de `connect` do socket faz no modo remoto. Sem isto o painel
     ficava com os seletores de tela vazios: a carga do arranque corre antes de a 5510
     estar de pé, falha em silêncio, e no modo local não há evento de ligação a seguir
     que a repita. */
  try {
    await carregarRoteamentoTelasDoServidor();
    if (ehModoBibliaOperador()) bibliaAplicarCfgExibicao();
    else slidesAplicarCfgArmazenada();
    renderSlidesStrip();
    emitirEstadoMinistranteAoServidor();
  } catch (_) {
    // intencional — o modo local já está de pé; o painel recupera ao trocar de modo
  }
  return { ok: true };
}

/**
 * Desliga o modo local — só nesta sessão, como tudo o que diz respeito ao modo.
 *
 * Não escreve nada, e nenhum outro caminho escreve: o arranque seguinte volta sempre a
 * projetar nesta máquina, tenha ou não o operador desmarcado o item de menu antes de
 * fechar. Ver o bloco sobre persistência junto a `projecaoLocalEmCurso`.
 */
export async function desligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  projecaoLocalActiva = false;
  motorAudioLocal?.desligar();
  if (ponte) await ponte.desligar();
  projecao.usarTransporte(null);
  atualizarUiConexao(false);
  /* O badge único descreve a ligação ao Servidor remoto; ao desligar a projeção local
     não há Servidor em jogo, então volta ao estado ocioso (cinza), sem soar a avaria. */
  setStatusServidorRemoto('ocioso');
}

/** Alterna o modo, para ligar a um botão ou item de menu. */
export async function alternarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  const estado = ponte ? await ponte.estado() : null;
  if (estado?.activa) return desligarProjecaoNestaMaquina();
  return ligarProjecaoNestaMaquina();
}

/** IP de LAN do servidor de projeção informado por ele (evento `server_info`); vazio até conectar. */
let servidorLanIpObs = '';
/** Porta do servidor HTTP das páginas de Browser Source do OBS (informada pelo servidor). */
let servidorObsPort = 5001;

/**
 * Atualiza os campos de URL de Browser Source (OBS) na aba «Conexão» dos Ajustes.
 * Host preferido: IP de LAN informado pelo servidor → IP usado para conectar → localhost.
 * O OBS pode rodar noutro PC, por isso `localhost` só serve como último recurso.
 */
export function atualizarUrlsObs() {
  const host = servidorLanIpObs || getServidorIp() || 'localhost';
  const bib = document.getElementById('obs-url-biblia');
  const sli = document.getElementById('obs-url-slides');
  if (bib) bib.value = `http://${host}:${servidorObsPort}/obs/biblia`;
  if (sli) sli.value = `http://${host}:${servidorObsPort}/obs/slides`;
}

/**
 * Copia para a área de transferência a URL de Browser Source (OBS) do campo indicado
 * e dá um retorno visual rápido no botão.
 */
export async function copiarUrlObs(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const url = input.value.trim();
  if (!url) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      input.focus();
      input.select();
      ok = document.execCommand('copy');
      input.setSelectionRange(0, 0);
      input.blur();
    } catch (_) {
      ok = false;
    }
  }
  if (btn) {
    const rotuloOriginal = btn.dataset.rotuloOriginal || btn.textContent;
    btn.dataset.rotuloOriginal = rotuloOriginal;
    btn.textContent = ok ? 'Copiado!' : 'Erro';
    btn.classList.toggle('success', ok);
    clearTimeout(btn._copiarTimer);
    btn._copiarTimer = setTimeout(() => {
      btn.textContent = btn.dataset.rotuloOriginal || 'Copiar';
      btn.classList.remove('success');
    }, 1400);
  }
}

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function getProjecaoLocalEmCurso() {
  return projecaoLocalEmCurso;
}

export function getProjecaoLocalActiva() {
  return projecaoLocalActiva;
}

export function getServidorLanIpObs() {
  return servidorLanIpObs;
}

export function setServidorLanIpObs(valor) {
  servidorLanIpObs = valor;
}

export function setServidorObsPort(valor) {
  servidorObsPort = valor;
}
