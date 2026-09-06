/**
 * Cópias locais de letra no painel (ids de versão e mapa no localStorage).
 *
 * Extraído do AppCore (secção C) sem mudar o critério: `c_*` é legado do
 * browser; id numérico é cópia no SQLite. O POST da cópia-padrão, o editor e
 * o DOM continuam no núcleo.
 */

import { LS_COPIAS_LOCAIS } from './chavesArmazenamentoLocal.js';

export function ehVersaoLocalLegada(versaoId) {
  return !!(versaoId && String(versaoId).trim().startsWith('c_'));
}

export function ehVersaoServidorId(versaoId) {
  if (versaoId == null || versaoId === '') return false;
  if (ehVersaoLocalLegada(versaoId)) return false;
  return Number.isFinite(Number(versaoId));
}

export function parseCopiasLocaisMapBruto(raw) {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

export function garantirListaCopiasNoMapa(map, idMusica) {
  const k = String(idMusica);
  if (!Array.isArray(map[k])) map[k] = [];
  return map[k];
}

export function copiasOrdenadasPorRotulo(lista) {
  return [...(lista || [])].sort((a, b) =>
    String(a.rotulo || '').localeCompare(String(b.rotulo || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

export function encontrarCopiaNaLista(lista, copiaId) {
  if (copiaId == null || copiaId === '') return null;
  return (lista || []).find((c) => c.id === copiaId) || null;
}

/**
 * Aplica campos na cópia em memória. Rótulo vazio falha depois de título/artista/estrofes
 * já terem sido escritos — o mesmo que o AppCore fazia antes de persistir.
 */
export function aplicarCamposCopiaLocal(copia, data) {
  if (!copia) return { ok: false, erro: 'Cópia não encontrada.' };
  const payload = data || {};
  if (payload.titulo != null) copia.titulo = String(payload.titulo || '').trim();
  if (payload.artista != null) copia.artista = String(payload.artista || '').trim();
  if (payload.estrofes != null) {
    copia.estrofes = Array.isArray(payload.estrofes)
      ? payload.estrofes.map((s) => String(s ?? ''))
      : [''];
  }
  if (payload.rotulo != null) {
    const rotulo = String(payload.rotulo || '').trim().slice(0, 40);
    if (!rotulo) return { ok: false, erro: 'Informe um nome para a versão.' };
    copia.rotulo = rotulo;
  }
  return { ok: true };
}

export function removerCopiaDoMapa(map, idMusica, copiaId) {
  const list = garantirListaCopiasNoMapa(map, idMusica);
  const idx = list.findIndex((c) => c.id === copiaId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  map[String(idMusica)] = list;
  return true;
}

export function criarMapaCopiasLocais(deps = {}) {
  const getItem = deps.getItem || ((k) => localStorage.getItem(k));
  const setItem = deps.setItem || ((k, v) => localStorage.setItem(k, v));
  const chave = deps.chave || LS_COPIAS_LOCAIS;

  function lerBruto() {
    try {
      return getItem(chave);
    } catch (_) {
      return null;
    }
  }

  let map = parseCopiasLocaisMapBruto(lerBruto());

  function persistir() {
    try {
      setItem(chave, JSON.stringify(map));
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  return {
    listaInterno(idMusica) {
      return garantirListaCopiasNoMapa(map, idMusica);
    },
    getCopiasParaMusica(idMusica) {
      return copiasOrdenadasPorRotulo(garantirListaCopiasNoMapa(map, idMusica));
    },
    encontrar(idMusica, copiaId) {
      return encontrarCopiaNaLista(garantirListaCopiasNoMapa(map, idMusica), copiaId);
    },
    atualizarCampos(idMusica, copiaId, data) {
      const copia = encontrarCopiaNaLista(garantirListaCopiasNoMapa(map, idMusica), copiaId);
      const r = aplicarCamposCopiaLocal(copia, data);
      if (!r.ok) return r;
      persistir();
      return { ok: true, copia };
    },
    remover(idMusica, copiaId) {
      const ok = removerCopiaDoMapa(map, idMusica, copiaId);
      if (ok) persistir();
      return ok;
    },
    removerTodas(idMusica) {
      delete map[String(idMusica)];
      persistir();
    },
  };
}
