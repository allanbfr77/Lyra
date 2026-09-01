/**
 * Resolução automática do próximo culto com base na data/hora de Brasília.
 *
 * Regras de transição (horário de Brasília):
 * - Culto de domingo pela manhã: corte às 13h → passa para domingo à noite.
 * - Demais cultos (noite, quarta, extras): corte às 23h → passa para o próximo da agenda.
 *
 * O culto ativo em T é o primeiro da lista ordenada cujo horário de corte ainda não passou.
 */

const RE_CULTO_ID = /^culto_(\d{4}-\d{2}-\d{2})_/i;

/** @param {string} id */
export function isoFromCultoId(id) {
  const m = RE_CULTO_ID.exec(String(id || ''));
  return m ? m[1] : '';
}

/** @param {{ iso: string, hour: number, minute?: number }} a @param {{ iso: string, hour: number, minute?: number }} b */
export function compararMomentoBrasilia(a, b) {
  if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
  const ha = a.hour ?? 0;
  const hb = b.hour ?? 0;
  if (ha !== hb) return ha - hb;
  return (a.minute ?? 0) - (b.minute ?? 0);
}

/** @param {Date} [agora] */
export function obterAgoraBrasilia(agora = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(agora)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  const hour = parseInt(parts.hour, 10);
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    hour: hour >= 24 ? hour - 24 : hour,
    minute: parseInt(parts.minute, 10),
  };
}

/** @param {string} cultoId */
export function horaCorteCulto(cultoId) {
  return /_manha$/i.test(String(cultoId || '')) ? 13 : 23;
}

/** @param {string} cultoId */
export function momentoCorteCulto(cultoId) {
  const iso = isoFromCultoId(cultoId);
  if (!iso) return null;
  return { iso, hour: horaCorteCulto(cultoId), minute: 0 };
}

/** @param {{ id: string, label: string }[]} lista */
export function ordenarCultosPorData(lista) {
  return [...lista].sort((a, b) => {
    const ia = isoFromCultoId(a.id);
    const ib = isoFromCultoId(b.id);
    if (ia !== ib) return ia.localeCompare(ib);
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Cultos do mês anterior, corrente e seguinte (cobre lacunas entre meses).
 *
 * @param {(dataRef: Date) => { id: string, label: string }[]} listarCultosDisponiveis
 * @param {Date} dataRef
 */
export function listarCultosJanelaResolucao(listarCultosDisponiveis, dataRef) {
  const ref = dataRef instanceof Date ? dataRef : new Date(dataRef);
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const meses = [new Date(y, m - 1, 1), new Date(y, m, 1), new Date(y, m + 1, 1)];
  const porId = new Map();
  for (const mes of meses) {
    for (const c of listarCultosDisponiveis(mes)) {
      porId.set(c.id, c);
    }
  }
  return ordenarCultosPorData(Array.from(porId.values()));
}

/**
 * Identifica o culto que deve estar selecionado agora, com base em Brasília.
 *
 * @param {{
 *   listarCultosDisponiveis: (dataRef?: Date) => { id: string, label: string }[],
 *   agora?: Date,
 * }} opts
 * @returns {string} id do culto ou '' se nenhum disponível
 */
export function resolverProximoCultoPorHorarioBrasilia({ listarCultosDisponiveis, agora = new Date() }) {
  const agoraBr = obterAgoraBrasilia(agora);
  const [y, mo, d] = agoraBr.iso.split('-').map((n) => parseInt(n, 10));
  const dataRef = new Date(y, mo - 1, d);

  const cultos = listarCultosJanelaResolucao(listarCultosDisponiveis, dataRef);
  if (!cultos.length) return '';

  const cortes = cultos
    .map((c) => ({ culto: c, corte: momentoCorteCulto(c.id) }))
    .filter((x) => x.corte);

  for (let i = 0; i < cortes.length; i++) {
    if (compararMomentoBrasilia(agoraBr, cortes[i].corte) < 0) {
      return cortes[i].culto.id;
    }
  }

  return cortes[cortes.length - 1].culto.id;
}
