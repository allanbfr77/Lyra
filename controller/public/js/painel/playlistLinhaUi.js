/**
 * Playlist: rótulos de versão exibidos na linha, rolagem até a música ativa e ligação dos botões e
 * seletores de cada linha. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasPlaylistLinhaUi`.
 */
import { BIB_ORIGEM_META } from './bibliotecaMusicas.js';
import { abrirMenuAcoesLinhaPlaylist } from './playlistMenus.js';
import { configurarDragReordenarLinhaPlaylist } from './playlistLista.js';
import { deselecionarMusicaAtivaAPartirDaPlaylist, playlistItemSelecionadoNaUi } from './playlistTransmitidas.js';
import { fonteBancoItemPlaylist } from '../modules/playlistVersaoMusica.js';
import { onPlaylistTomChange } from './ministrantesTons.js';
import { playlistDuploCliqueIniciarProjecao } from './eventosProjecao.js';
import { selecionarMusicaDoBanco } from './projecaoMusica.js';

/** Evita que dois cliques rápidos na playlist disparem só seleção duas vezes + duplo clique (projeta sem querer). */
let playlistRowClickTimer = null;

/**
 * Forma canónica de exibição dos rótulos automáticos. Só nome exibido: o que está
 * gravado (`ROTULO_COPIA_PADRAO` = «Cópia», em controller/src/db/musicas.js) não
 * muda. A Cópia padrão — a que nasce junto com a Original — chama-se
 * «Cópia/Original» na interface, porque é a versão editável que carrega o mesmo
 * conteúdo da Original. Tags personalizadas mantêm exactamente a caixa que o
 * utilizador escreveu.
 */
const ROTULOS_VERSAO_EXIBICAO = new Map([
  ['cópia'.normalize('NFC'), 'Cópia/Original'],
  ['cópia/modificada'.normalize('NFC'), 'Cópia'],
  ['cópia/importada'.normalize('NFC'), 'Cópia/Importada'],
  ['cópia/manual'.normalize('NFC'), 'Cópia/Manual'],
]);

/** Rótulo gravado na cópia criada por importação (`ROTULO_COPIA_IMPORTADA`). */
const ROTULO_VERSAO_IMPORTADA_BRUTO = 'cópia/importada'.normalize('NFC');

/**
 * Nome exibido da versão criada por uma importação: «Versão <BANCO DE ORIGEM>»
 * — «Versão HLYRCS», «Versão LYRA», «Versão CIFRA CLUB», … O banco sai de
 * `origem_importacao` (a origem real gravada na linha) e o nome curto é o
 * mesmo da legenda de origem da Biblioteca (`BIB_ORIGEM_META`).
 *
 * Só exibição: o rótulo gravado continua a ser «Cópia/Importada». Sem origem
 * conhecida devolve '' e quem chama mantém o nome de sempre.
 */
function nomeVersaoImportadaPorOrigem(rotulo, origem) {
  const bruto = String(rotulo || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR');
  if (bruto !== ROTULO_VERSAO_IMPORTADA_BRUTO) return '';
  const meta = BIB_ORIGEM_META[String(origem || '').trim()];
  return meta && meta.legenda ? `Versão ${meta.legenda}` : '';
}

export function formatarRotuloVersaoExibicao(rotulo, origem) {
  const importada = nomeVersaoImportadaPorOrigem(rotulo, origem);
  if (importada) return importada;
  const bruto = String(rotulo || '').trim();
  if (!bruto) return 'Cópia';
  const chave = bruto.normalize('NFC').toLocaleLowerCase('pt-BR');
  const automatico = ROTULOS_VERSAO_EXIBICAO.get(chave);
  if (automatico) return automatico;
  return bruto;
}

/** Só exibição: o nome da versão aparece sempre em maiúsculas. O dado gravado não muda. */
export function rotuloVersaoMaiusculo(rotulo) {
  return String(rotulo || '').toLocaleUpperCase('pt-BR');
}

/** Sufixo de versão na linha da playlist — sempre vazio.
 * O vínculo interno (`versaoLocalId` / `versaoRotulo`) continua a existir;
 * a playlist não mostra tag visual de versão. */
export function sufixoRotuloVersaoPlaylist(_item) {
  return '';
}

/* Última linha ativa já rolada para a vista — evita brigar com o scroll manual do operador. */
let ultimaLinhaAtivaRoladaNaPlaylist = null;

/**
 * Garante que a música ativa não fique cortada nas bordas da lista.
 * Só rola quando a linha ativa muda (troca de música), nunca a cada render.
 */
export function garantirMusicaAtivaVisivelNaPlaylist() {
  const el = document.getElementById('playlist-list');
  const row = el ? el.querySelector('.playlist-row.ativo') : null;
  if (!row) {
    ultimaLinhaAtivaRoladaNaPlaylist = null;
    return;
  }
  const chave = row.dataset.plIdx || '';
  if (chave === ultimaLinhaAtivaRoladaNaPlaylist) return;
  ultimaLinhaAtivaRoladaNaPlaylist = chave;
  requestAnimationFrame(() => {
    if (!row.isConnected) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/**
 * Alça de arrasto, kebab de ações e o select de Tom da linha.
 * O select não dispara seleção/projeção da música (stopPropagation).
 */
export function ligarBotoesESeletoresLinhaPlaylist(row, item, idxPl) {
  const btnKebab = row.querySelector('.pl-btn-kebab');
  if (btnKebab) {
    btnKebab.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      abrirMenuAcoesLinhaPlaylist(btnKebab, row, idxPl);
    };
    /* Sem isto o `mousedown` chegava à linha e a música era seleccionada por baixo do
       menu que se estava a abrir. */
    btnKebab.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  configurarDragReordenarLinhaPlaylist(row, idxPl);

  const selTom = row.querySelector('.pl-sel-tom');
  if (selTom) {
    selTom.addEventListener('click', (e) => e.stopPropagation());
    selTom.addEventListener('mousedown', (e) => e.stopPropagation());
    selTom.addEventListener('change', (e) => {
      e.stopPropagation();
      onPlaylistTomChange(idxPl, selTom.value);
    });
  }

  row.addEventListener('click', (ev) => {
    if (
      ev.target.closest('.playlist-btns') ||
      ev.target.closest('.pl-sel') ||
      ev.target.closest('.pl-grip')
    ) {
      return;
    }
    clearTimeout(playlistRowClickTimer);
    const idNum = Number(item.id);
    playlistRowClickTimer = setTimeout(() => {
      playlistRowClickTimer = null;
      if (playlistItemSelecionadoNaUi(item)) {
        deselecionarMusicaAtivaAPartirDaPlaylist();
        return;
      }
      selecionarMusicaDoBanco(idNum, {
        habilitarFaixaModoSlides: true,
        versaoLocalId: item.versaoLocalId || undefined,
        fonte: fonteBancoItemPlaylist(item),
        origemUi: 'playlist',
        abrirEmLetraCompleta: true,
      });
    }, 300);
  });
  row.addEventListener('dblclick', (ev) => {
    if (
      ev.target.closest('.pl-sel') ||
      ev.target.closest('.playlist-btns') ||
      ev.target.closest('.pl-grip')
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    clearTimeout(playlistRowClickTimer);
    playlistRowClickTimer = null;
    playlistDuploCliqueIniciarProjecao(item);
  });
}
