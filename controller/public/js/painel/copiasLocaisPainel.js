/**
 * Cópias locais de letra e leitura das versões do servidor para a música ativa. Movido verbatim do
 * núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasCopiasLocaisPainel`.
 */
import { criarMapaCopiasLocais, ehVersaoLocalLegada } from '../modules/copiasLocaisLetra.js';
import { renderMusicaVersoesBar } from './versoesMusica.js';

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
  if (!dep.getMusicaAtiva()) return null;
  const r = Number(dep.getMusicaRootId() ?? dep.getMusicaAtiva().root_id ?? dep.getMusicaAtiva().id);
  return Number.isFinite(r) ? r : null;
}

export function musicaAtivaEhOriginalServidor() {
  if (!dep.getMusicaAtiva() || dep.getMusicaBancoFonte() === 'catalog') return false;
  const root = obterRootIdMusicaAtiva();
  const id = Number(dep.getMusicaAtiva().id);
  if (!Number.isFinite(root) || !Number.isFinite(id)) return false;
  if (dep.getMusicaVersaoLocalId() && ehVersaoLocalLegada(dep.getMusicaVersaoLocalId())) return false;
  return id === root && (dep.getMusicaAtiva().parent_id == null || dep.getMusicaAtiva().parent_id === '');
}

/** Original protegido no SQLite (`is_immutable === 1`); cópias/versões filhas são editáveis. */
export function versaoAtivaParaCompararPlaylist() {
  if (dep.getMusicaVersaoLocalId() && String(dep.getMusicaVersaoLocalId()).trim()) {
    return String(dep.getMusicaVersaoLocalId()).trim();
  }
  if (musicaAtivaEhOriginalServidor()) return '';
  if (dep.getMusicaAtiva() && dep.getMusicaBancoFonte() !== 'catalog') return String(dep.getMusicaAtiva().id);
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
    dep.setVersoesMusicaServidorCache({ rootId: null, versoes: [] });
    renderMusicaVersoesBar();
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${root}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dep.setVersoesMusicaServidorCache({
      rootId: Number(data.rootId) || root,
      versoes: Array.isArray(data.versoes) ? data.versoes : [],
    });
  } catch (_) {
    dep.setVersoesMusicaServidorCache({ rootId: root, versoes: [] });
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
    dep.getMusicaAtiva() &&
    Number(dep.getMusicaAtiva().id) === idN &&
    dep.getMusicaVersaoLocalId() &&
    String(dep.getMusicaVersaoLocalId()) === vid
  ) {
    if (data.titulo != null) dep.getMusicaAtiva().titulo = c.titulo;
    if (data.artista != null) dep.getMusicaAtiva().artista = c.artista;
    if (data.estrofes != null) dep.getMusicaAtiva().estrofes = c.estrofes.map((s) => String(s));
    if (data.rotulo != null) dep.getMusicaAtiva().rotulo = c.rotulo;
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et && data.titulo != null) et.value = dep.getMusicaAtiva().titulo || '';
    if (ea && data.artista != null) ea.value = dep.getMusicaAtiva().artista || '';
  }
  return { ok: true };
}

export function removerCopiaLocal(idMusica, copiaId) {
  return mapaCopiasLocais.remover(idMusica, copiaId);
}

export function removerCopiasLocaisDaMusica(idMusica) {
  mapaCopiasLocais.removerTodas(idMusica);
}
