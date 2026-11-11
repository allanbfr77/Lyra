/**
 * Cópias locais de letra e leitura das versões do servidor para a música ativa. Movido verbatim do
 * núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasCopiasLocaisPainel`.
 */
import { criarMapaCopiasLocais, ehVersaoLocalLegada } from '../modules/copiasLocaisLetra.js';
import { renderMusicaVersoesBar } from './versoesMusica.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasCopiasLocaisPainel(d) {
  dep = d || {};
}
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);

const mapaCopiasLocais = criarMapaCopiasLocais();

export function getCopiasParaMusica(idMusica) {
  return mapaCopiasLocais.getCopiasParaMusica(idMusica);
}

export function encontrarCopiaLocal(idMusica, copiaId) {
  return mapaCopiasLocais.encontrar(idMusica, copiaId);
}

export function obterRootIdMusicaAtiva() {
  if (!estadoPainel.musicaAtiva) return null;
  const r = Number(estadoPainel.musicaRootId ?? estadoPainel.musicaAtiva.root_id ?? estadoPainel.musicaAtiva.id);
  return Number.isFinite(r) ? r : null;
}

export function musicaAtivaEhOriginalServidor() {
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaBancoFonte === 'catalog') return false;
  const root = obterRootIdMusicaAtiva();
  const id = Number(estadoPainel.musicaAtiva.id);
  if (!Number.isFinite(root) || !Number.isFinite(id)) return false;
  if (estadoPainel.musicaVersaoLocalId && ehVersaoLocalLegada(estadoPainel.musicaVersaoLocalId)) return false;
  return id === root && (estadoPainel.musicaAtiva.parent_id == null || estadoPainel.musicaAtiva.parent_id === '');
}

/** Original protegido no SQLite (`is_immutable === 1`); cópias/versões filhas são editáveis. */
export function versaoAtivaParaCompararPlaylist() {
  if (estadoPainel.musicaVersaoLocalId && String(estadoPainel.musicaVersaoLocalId).trim()) {
    return String(estadoPainel.musicaVersaoLocalId).trim();
  }
  if (musicaAtivaEhOriginalServidor()) return '';
  if (estadoPainel.musicaAtiva && estadoPainel.musicaBancoFonte !== 'catalog') return String(estadoPainel.musicaAtiva.id);
  return '';
}

/**
 * Id da cópia editável padrão de uma música do banco do usuário.
 *
 * O ORIGINAL nunca é alterado pela edição: ao abrir uma música o controlador
 * trabalha sobre a cópia que nasceu junto com ela. Músicas cadastradas antes
 * desse comportamento não têm cópia — o servidor materializa uma aqui, na
 * primeira abertura, sem tocar no original.
 *
 * Devolve `null` em qualquer falha: nesse caso a música abre no original, como
 * antes, em vez de o clique não fazer nada.
 *
 * @returns {Promise<number|null>}
 */
export async function garantirCopiaPadraoServidor(id) {
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return null;
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/copia-padrao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const copiaId = Number(data && data.id);
    return Number.isFinite(copiaId) && copiaId !== idNum ? copiaId : null;
  } catch (_) {
    // intencional — sem cópia o fluxo segue no original
    return null;
  }
}

export async function carregarVersoesMusicaServidor(rootId) {
  const root = Number(rootId);
  if (!Number.isFinite(root)) {
    estadoPainel.versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${root}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    estadoPainel.versoesMusicaServidorCache = {
      rootId: Number(data.rootId) || root,
      versoes: Array.isArray(data.versoes) ? data.versoes : [],
    };
  } catch (_) {
    estadoPainel.versoesMusicaServidorCache = { rootId: root, versoes: [] };
  }
  renderMusicaVersoesBar();
}

export function atualizarCopiaLocal(idMusica, copiaId, data) {
  const up = mapaCopiasLocais.atualizarCampos(idMusica, copiaId, data);
  if (!up.ok) return up;
  const c = up.copia;
  const idN = Number(idMusica);
  const vid = String(copiaId);
  if (
    estadoPainel.musicaAtiva &&
    Number(estadoPainel.musicaAtiva.id) === idN &&
    estadoPainel.musicaVersaoLocalId &&
    String(estadoPainel.musicaVersaoLocalId) === vid
  ) {
    if (data.titulo != null) estadoPainel.musicaAtiva.titulo = c.titulo;
    if (data.artista != null) estadoPainel.musicaAtiva.artista = c.artista;
    if (data.estrofes != null) estadoPainel.musicaAtiva.estrofes = c.estrofes.map((s) => String(s));
    if (data.rotulo != null) estadoPainel.musicaAtiva.rotulo = c.rotulo;
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et && data.titulo != null) et.value = estadoPainel.musicaAtiva.titulo || '';
    if (ea && data.artista != null) ea.value = estadoPainel.musicaAtiva.artista || '';
  }
  return { ok: true };
}

export function removerCopiaLocal(idMusica, copiaId) {
  return mapaCopiasLocais.remover(idMusica, copiaId);
}

export function removerCopiasLocaisDaMusica(idMusica) {
  mapaCopiasLocais.removerTodas(idMusica);
}
