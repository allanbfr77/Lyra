/**
 * Cultos do calendário Lyra — alinhado ao controlador web.
 *
 * - Automáticos do mês: domingos (manhã/noite) e quartas
 * - Manuais / outras datas: vêm nas chaves de `playlists` do controlador
 */

const RE_CULTO_ID = /^culto_(\d{4}-\d{2}-\d{2})_/i;

const NOMES_DIA_POR_SUFIXO = {
  domingo: 'DOMINGO',
  segunda: 'SEGUNDA-FEIRA',
  terca: 'TERÇA-FEIRA',
  quarta: 'QUARTA-FEIRA',
  quinta: 'QUINTA-FEIRA',
  sexta: 'SEXTA-FEIRA',
  sabado: 'SÁBADO',
  manha: 'DOMINGO',
  noite: 'DOMINGO',
};

/**
 * @param {string} id
 * @returns {string|null}
 */
export function isoFromCultoId(id) {
  const m = RE_CULTO_ID.exec(String(id || ''));
  return m ? m[1] : null;
}

/**
 * True se o id `culto_YYYY-MM-DD_*` pertence ao mês/ano de `dataRef`.
 * @param {string} id
 * @param {Date} [dataRef]
 * @returns {boolean}
 */
export function cultoIdPertenceAoMes(id, dataRef = new Date()) {
  const iso = isoFromCultoId(id);
  if (!iso) return false;
  const d0 = dataRef instanceof Date ? dataRef : new Date();
  const [y, mo] = iso.split('-').map((n) => parseInt(n, 10));
  return y === d0.getFullYear() && mo === d0.getMonth() + 1;
}

/**
 * @param {{ id: string, label: string }[]} lista
 * @returns {{ id: string, label: string }[]}
 */
function ordenarCultosPorData(lista) {
  return [...lista].sort((a, b) => {
    const ia = isoFromCultoId(a.id) || '';
    const ib = isoFromCultoId(b.id) || '';
    if (ia !== ib) return ia.localeCompare(ib);
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Lista de cultos do mês (domingos manhã/noite, quartas).
 *
 * @param {Date} [dataRef]
 * @returns {{ id: string, label: string }[]}
 */
export function gerarCultosDoMes(dataRef = new Date()) {
  const y = dataRef.getFullYear();
  const m0 = dataRef.getMonth();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const out = [];

  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const dow = dt.getDay();
    const dd = String(d).padStart(2, '0');
    const suf = `${dd}/${mm}`;
    const iso = `${y}-${mm}-${dd}`;

    if (dow === 0) {
      out.push({ id: `culto_${iso}_manha`, label: `DOM, MANHÃ - ${suf}` });
      out.push({ id: `culto_${iso}_noite`, label: `DOM, NOITE - ${suf}` });
    }
    if (dow === 3) {
      out.push({ id: `culto_${iso}_quarta`, label: `QUARTA-FEIRA - ${suf}` });
    }
  }

  return out;
}

/**
 * Rótulo legível para qualquer id `culto_YYYY-MM-DD_*` (inclui cultos manuais do PC).
 *
 * @param {string} id
 * @returns {string}
 */
export function labelDeCultoId(id) {
  const idStr = String(id || '').trim();
  if (!idStr) return '—';

  const iso = isoFromCultoId(idStr);
  if (iso) {
    const [y, mo, d] = iso.split('-').map((n) => parseInt(n, 10));
    const noMes = gerarCultosDoMes(new Date(y, mo - 1, d)).find((c) => c.id === idStr);
    if (noMes) return noMes.label;
  }

  const m = /^culto_(\d{4}-\d{2}-\d{2})_(\w+)$/i.exec(idStr);
  if (!m) return idStr;

  const [, isoPart, sufixoRaw] = m;
  const [, ano, mes, dia] = isoPart.split('-');
  const suf = `${dia}/${mes}`;
  const sufixo = String(sufixoRaw || '').toLowerCase();

  if (sufixo === 'manha') return `DOM, MANHÃ - ${suf}`;
  if (sufixo === 'noite') return `DOM, NOITE - ${suf}`;
  if (sufixo === 'quarta') return `QUARTA-FEIRA - ${suf}`;

  const diaNome = NOMES_DIA_POR_SUFIXO[sufixo];
  if (diaNome) return `${suf} | ${diaNome}`;

  return `${suf} | ${sufixoRaw.toUpperCase()}`;
}

/**
 * Período do culto a partir do sufixo do id (`culto_YYYY-MM-DD_manha`).
 *
 * Só interpreta o id — não consulta playlists nem altera nada. Serve para a UI
 * distinguir domingo de manhã e domingo à noite, que caem na mesma data.
 *
 * @param {string} id
 * @returns {{ chave: 'manha'|'noite'|'quarta'|'outro', label: string }}
 */
export function periodoDoCultoId(id) {
  const m = /^culto_\d{4}-\d{2}-\d{2}_(\w+)$/i.exec(String(id || '').trim());
  const sufixo = String(m?.[1] || '').toLowerCase();

  if (sufixo === 'manha') return { chave: 'manha', label: 'MANHÃ' };
  if (sufixo === 'noite') return { chave: 'noite', label: 'NOITE' };
  if (sufixo === 'quarta') return { chave: 'quarta', label: 'QUARTA-FEIRA' };
  return { chave: 'outro', label: sufixo ? sufixo.toUpperCase() : '' };
}

/**
 * Cultos automáticos do mês + ids das playlists do controlador que pertencem ao mesmo mês/ano.
 * Cultos extras (manuais) de outros meses não entram na lista.
 *
 * @param {object} [playlists]
 * @param {Date} [dataRef]
 * @returns {{ id: string, label: string }[]}
 */
export function listarCultosDasPlaylists(playlists, dataRef = new Date()) {
  const ref = dataRef instanceof Date ? dataRef : new Date();
  const porId = new Map();
  gerarCultosDoMes(ref).forEach((c) => porId.set(c.id, c));

  const pl = playlists && typeof playlists === 'object' && !Array.isArray(playlists) ? playlists : {};
  Object.keys(pl).forEach((cid) => {
    if (!RE_CULTO_ID.test(cid)) return;
    if (!cultoIdPertenceAoMes(cid, ref)) return;
    if (!porId.has(cid)) {
      porId.set(cid, { id: cid, label: labelDeCultoId(cid) });
    }
  });

  return ordenarCultosPorData(Array.from(porId.values()));
}

/**
 * @param {string} id
 * @param {object} [playlists]
 * @param {Date} [dataRef]
 * @returns {{ id: string, label: string }|null}
 */
export function encontrarCultoPorId(id, playlists = null, dataRef = new Date()) {
  if (!id) return null;
  const lista = playlists != null ? listarCultosDasPlaylists(playlists, dataRef) : gerarCultosDoMes(dataRef);
  return lista.find((c) => c.id === id) || null;
}

/**
 * Monta { id, label } do culto gravado no código na nuvem (Compartilhar com PC / controlador).
 *
 * @param {{ cultoId?: string, cultoNome?: string, cultoLabel?: string }} payload
 * @param {object|null} [playlists] - Playlists do controlador (cultos manuais)
 * @returns {{ id: string, label: string }|null}
 */
export function resolverCultoDoPayloadNuvem(payload, playlists = null) {
  const cultoId = String(payload?.cultoId || '').trim();
  if (!cultoId) return null;

  const naLista = encontrarCultoPorId(cultoId, playlists);
  if (naLista) return naLista;

  const nomeNuvem = String(payload?.cultoNome || payload?.cultoLabel || '').trim();
  const labelCalendario = labelDeCultoId(cultoId);
  const label =
    labelCalendario && labelCalendario !== cultoId
      ? labelCalendario
      : nomeNuvem || cultoId;
  return { id: cultoId, label };
}
