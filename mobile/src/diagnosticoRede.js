/**
 * Registro leve de diagnóstico de rede (ring buffer em memória).
 *
 * Motivação: a busca de letras falhava em 4G/5G e era impossível saber, a partir
 * do app em campo, qual hop pendurou ou que status HTTP veio — todos os erros
 * eram engolidos por `catch (_) {}`. Este módulo dá visibilidade sem depender de
 * ferramenta externa nem de build de desenvolvimento.
 *
 * Não faz I/O e não retém corpos de resposta — só metadados.
 */

const MAX_REGISTROS = 60;

/** @type {{ rotulo: string, url: string, status: number|null, ms: number, bytes: number|null, erro: string|null, motivo: string|null, em: number }[]} */
const registros = [];

/** Reduz a URL a algo curto e sem segredos, para log. */
function resumirUrl(url) {
  try {
    const u = new URL(String(url));
    const q = u.searchParams.toString();
    return `${u.host}${u.pathname}${q ? `?${q.slice(0, 60)}` : ''}`;
  } catch (_) {
    return String(url || '').slice(0, 120);
  }
}

/**
 * Registra o resultado de um hop de rede.
 *
 * @param {{
 *   rotulo: string,
 *   url: string,
 *   status?: number|null,
 *   ms: number,
 *   bytes?: number|null,
 *   erro?: string|null,
 *   motivo?: string|null,
 * }} info
 */
export function registrarHop(info) {
  const reg = {
    rotulo: String(info?.rotulo || '?'),
    url: resumirUrl(info?.url),
    status: Number.isFinite(info?.status) ? info.status : null,
    ms: Math.round(Number(info?.ms) || 0),
    bytes: Number.isFinite(info?.bytes) ? info.bytes : null,
    erro: info?.erro ? String(info.erro).slice(0, 200) : null,
    motivo: info?.motivo ? String(info.motivo) : null,
    em: Date.now(),
  };

  registros.push(reg);
  if (registros.length > MAX_REGISTROS) registros.shift();

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const partes = [
      `[rede] ${reg.rotulo}`,
      reg.url,
      reg.status != null ? `HTTP ${reg.status}` : null,
      `${reg.ms}ms`,
      reg.bytes != null ? `${reg.bytes}B` : null,
      reg.motivo ? `motivo=${reg.motivo}` : null,
      reg.erro ? `erro=${reg.erro}` : null,
    ].filter(Boolean);
    console.log(partes.join(' · '));
  }
}

/** Cópia dos registros, do mais recente para o mais antigo. */
export function lerRegistrosRede() {
  return [...registros].reverse();
}

/** Texto pronto para colar num relato de bug. */
export function formatarRegistrosRede() {
  return lerRegistrosRede()
    .map((r) => {
      const partes = [
        new Date(r.em).toISOString().slice(11, 19),
        r.rotulo,
        r.url,
        r.status != null ? `HTTP ${r.status}` : '—',
        `${r.ms}ms`,
        r.bytes != null ? `${r.bytes}B` : '',
        r.motivo || '',
        r.erro || '',
      ];
      return partes.filter(Boolean).join(' | ');
    })
    .join('\n');
}

export function limparRegistrosRede() {
  registros.length = 0;
}
