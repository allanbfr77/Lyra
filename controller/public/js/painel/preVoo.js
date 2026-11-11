/**
 * Pré-voo do culto: verificação de monitores, músicas (letra e tom) e arquivos de mídia antes de
 * começar, com painel de resultado. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo
 * ainda possui entra por `registrarDependenciasPreVoo`.
 */
import { GRAVIDADE_IMPEDE, consolidar, resumoPreVoo, verificarLetras, verificarMidias, verificarPlaylistVazia, verificarTelas, verificarTonsEMinistrantes } from '../modules/preVooPlaylist.js';
import { ehMarcadorTemaPlaylist, idMusicaParaPreVoo } from '../modules/playlistVersaoMusica.js';
import { nomeMinistrantePorId } from './ministrantesTons.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPreVoo(d) {
  dep = d || {};
}
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getPlaylist = (...a) => dep.getPlaylist(...a);
const nomeCultoAtivoParaHistorico = (...a) => dep.nomeCultoAtivoParaHistorico(...a);
const normalizarRota = (...a) => dep.normalizarRota(...a);
const obterRotaSlidesParaUi = (...a) => dep.obterRotaSlidesParaUi(...a);
const sanitizarRotaProjecao = (...a) => dep.sanitizarRotaProjecao(...a);

/** Monitores que estavam guardados e já não existem — preenchido ao restaurar a rota. */
let preVooMonitoresEmFalta = [];

/** Evita duas verificações em paralelo se o operador clicar duas vezes. */
let preVooACorrer = false;

/** Músicas reais do culto, sem os marcadores de tema. */
function musicasDoCultoParaPreVoo() {
  if (!dep.getCultoId()) return [];
  const pl = getPlaylist(dep.getCultoId());
  if (!Array.isArray(pl)) return [];
  return pl.filter((it) => it && !ehMarcadorTemaPlaylist(it));
}

/**
 * Vai buscar a letra de cada música do culto.
 *
 * Em paralelo, e com o erro de cada uma isolado: uma música apagada devolve 404, e isso é
 * precisamente um dos achados que se procura — não uma falha que deva derrubar a
 * verificação inteira.
 *
 * @param {object[]} itens
 */
async function carregarLetrasParaPreVoo(itens) {
  const base = getControllerApiBase();
  return Promise.all(
    itens.map(async (item) => {
      const id = idMusicaParaPreVoo(item);
      if (id == null) return { item, musica: null, erro: true };
      const fonte = item?.bancoFonte === 'catalog' ? '?fonte=catalog' : '';
      try {
        const r = await fetch(`${base}/api/musicas/${id}${fonte}`);
        if (!r.ok) return { item, musica: null, erro: true };
        return { item, musica: await r.json(), erro: false };
      } catch (_) {
        return { item, musica: null, erro: true };
      }
    })
  );
}

/**
 * Confirma no disco os vídeos que o modo Mídias vai usar.
 *
 * Só itens com `filePath` — imagens e PDF viajam embutidos no estado e não têm como
 * desaparecer. Sem a ponte disponível (painel aberto fora do Electron), devolve lista
 * vazia: é preferível não verificar do que inventar que está tudo bem.
 */
async function verificarMidiasNoDiscoParaPreVoo() {
  const todos = [
    ...(dep.getApresentacaoBiblioteca() || []),
    ...(dep.getApresentacaoCards() || []),
    ...(dep.getApresentacaoVideoPlaylist() || []),
    ...(dep.getApresentacaoAudios() || []),
  ].filter((it) => it && String(it.filePath || '').trim());

  if (!todos.length) return [];
  const api = window.lyraElectron;
  if (!api || typeof api.verificarArquivosExistem !== 'function') return [];

  /* Um caminho pode estar em vários sítios (biblioteca e card): perguntar uma vez só. */
  const caminhos = [...new Set(todos.map((it) => String(it.filePath).trim()))];
  try {
    const res = await api.verificarArquivosExistem(caminhos);
    const mapa = new Map((res || []).map((r) => [r.caminho, !!r.existe]));
    return caminhos.map((c) => ({
      caminho: c,
      filePath: c,
      name: todos.find((it) => String(it.filePath).trim() === c)?.name || c,
      existe: mapa.get(c) !== false,
    }));
  } catch (_) {
    return [];
  }
}

/** Corre as quatro verificações e desenha o resultado. */
export async function correrPreVooDoCulto() {
  if (preVooACorrer) return;
  preVooACorrer = true;

  abrirPainelPreVoo();
  desenharPreVooACarregar();

  try {
    const itens = musicasDoCultoParaPreVoo();

    /* Telas e tons saem do que já está em memória; letras e mídias precisam de ir buscar.
       As duas idas acontecem ao mesmo tempo — não dependem uma da outra. */
    const [carregadas, midias] = await Promise.all([
      itens.length ? carregarLetrasParaPreVoo(itens) : Promise.resolve([]),
      verificarMidiasNoDiscoParaPreVoo(),
    ]);

    /* Telas: não ler os seletores do cabeçalho (`rotaSelecionadaNaUi`). Esses reflectem o
       modo/aba aberto (Home→completo, Slides→slides, …). No Home o completo pode estar em
       «Não exibir» enquanto o telão do culto (slides) já tem monitor — e o pré-voo acusava
       «nenhum monitor a receber o telão» só por causa da aba. A verificação do culto olha
       a rota de infraestrutura, independente do modo activo. */
    let rota = null;
    try {
      const slides = obterRotaSlidesParaUi();
      const completo = sanitizarRotaProjecao(
        normalizarRota(dep.getRotasPorModo().completo),
        dep.getMonitoresServidorCache()
      );
      rota =
        slides.live || slides.publicoIndex >= 0
          ? slides
          : completo.live || completo.publicoIndex >= 0
            ? completo
            : slides;
    } catch (_) {
      rota = null;
    }

    const resultado = consolidar([
      verificarTelas(rota, dep.getMonitoresServidorCache(), preVooMonitoresEmFalta),
      verificarPlaylistVazia(itens),
      verificarTonsEMinistrantes(
        itens.map((it) => ({
          ...it,
          titulo: it.titulo || it.nome || '',
          ministranteNome: nomeMinistrantePorId(it.ministranteId),
        }))
      ),
      verificarLetras(carregadas),
      verificarMidias(midias),
    ]);

    desenharResultadoPreVoo(resultado, itens.length);
  } catch (e) {
    desenharErroPreVoo(e);
  } finally {
    preVooACorrer = false;
  }
}

function abrirPainelPreVoo() {
  const bd = document.getElementById('prevoo-backdrop');
  if (!bd) return;
  bd.classList.add('aberto');
  bd.setAttribute('aria-hidden', 'false');
  document.getElementById('prevoo-ok')?.focus();
}

function fecharPainelPreVoo() {
  const bd = document.getElementById('prevoo-backdrop');
  if (!bd) return;
  bd.classList.remove('aberto');
  bd.setAttribute('aria-hidden', 'true');
}

function desenharPreVooACarregar() {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  if (sub) sub.textContent = 'A verificar…';
  if (corpo) {
    corpo.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'prevoo-tudo-bem';
    d.innerHTML =
      '<div class="prevoo-tudo-bem-tit">A verificar o culto…</div>' +
      '<div class="prevoo-tudo-bem-det">Telas, tons, letras e mídias.</div>';
    corpo.appendChild(d);
  }
}

function desenharErroPreVoo(e) {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  if (sub) sub.textContent = 'A verificação não terminou';
  if (!corpo) return;
  corpo.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'prevoo-tudo-bem';
  const tit = document.createElement('div');
  tit.className = 'prevoo-tudo-bem-tit';
  tit.textContent = 'Não foi possível verificar tudo';
  const det = document.createElement('div');
  det.className = 'prevoo-tudo-bem-det';
  /* Sem lista parcial: meia verificação lida como completa é pior do que nenhuma. */
  det.textContent =
    'Algo falhou a meio, por isso não há resultado de confiança para mostrar. ' +
    'Tente «Verificar de novo». (' + ((e && e.message) || e) + ')';
  d.appendChild(tit);
  d.appendChild(det);
  corpo.appendChild(d);
}

/**
 * @param {{achados: object[], impedem: number, atencao: number, tudoBem: boolean}} r
 * @param {number} quantasMusicas
 */
function desenharResultadoPreVoo(r, quantasMusicas) {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  const nota = document.getElementById('prevoo-nota');
  if (!corpo) return;

  const nomeCulto = nomeCultoAtivoParaHistorico();
  if (sub) {
    sub.textContent =
      (nomeCulto ? `${nomeCulto} · ` : '') +
      `${quantasMusicas} música${quantasMusicas === 1 ? '' : 's'} · ${resumoPreVoo(r)}`;
  }
  if (nota) {
    nota.textContent = r.tudoBem
      ? ''
      : 'Nada foi alterado — o pré-voo só relata.';
  }

  corpo.innerHTML = '';

  if (r.tudoBem) {
    const d = document.createElement('div');
    d.className = 'prevoo-tudo-bem';
    const ico = document.createElement('div');
    ico.className = 'prevoo-tudo-bem-ico';
    ico.textContent = '✓';
    const tit = document.createElement('div');
    tit.className = 'prevoo-tudo-bem-tit';
    tit.textContent = 'Tudo pronto';
    const det = document.createElement('div');
    det.className = 'prevoo-tudo-bem-det';
    det.textContent =
      'As telas estão configuradas, as músicas têm letra e tom, e os ficheiros de mídia ' +
      'estão onde deviam. Pode começar.';
    d.appendChild(ico);
    d.appendChild(tit);
    d.appendChild(det);
    corpo.appendChild(d);
    return;
  }

  r.achados.forEach((a) => {
    const linha = document.createElement('div');
    linha.className = 'prevoo-item' + (a.gravidade === GRAVIDADE_IMPEDE ? ' impede' : '');
    const txt = document.createElement('div');
    txt.className = 'prevoo-item-txt';
    const tit = document.createElement('div');
    tit.className = 'prevoo-item-tit';
    tit.textContent = a.titulo;
    const det = document.createElement('div');
    det.className = 'prevoo-item-det';
    det.textContent = a.detalhe;
    txt.appendChild(tit);
    txt.appendChild(det);
    linha.appendChild(txt);
    corpo.appendChild(linha);
  });
}

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function setPreVooMonitoresEmFalta(valor) {
  preVooMonitoresEmFalta = valor;
}

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarPreVoo() {
  (function iniciarPreVoo() {
    document.getElementById('prevoo-fechar')?.addEventListener('click', fecharPainelPreVoo);
    document.getElementById('prevoo-ok')?.addEventListener('click', fecharPainelPreVoo);
    document.getElementById('prevoo-repetir')?.addEventListener('click', () => {
      void correrPreVooDoCulto();
    });
    document.getElementById('prevoo-backdrop')?.addEventListener('click', (e) => {
      if (e.target?.id === 'prevoo-backdrop') fecharPainelPreVoo();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const bd = document.getElementById('prevoo-backdrop');
      if (bd?.classList.contains('aberto')) {
        e.preventDefault();
        fecharPainelPreVoo();
      }
    });
  })();
}
