/**
 * Catálogo de livros + resolução por nome ou abreviação (alinhado ao controlador).
 */

export const TRADUCOES_PADRAO = ['ACF', 'ARA', 'ARC', 'NAA', 'NTLH', 'NVI'];

/** Índice físico do monitor no servidor Lyra: M2 = telão público, M3 = ministrante. */
export const INDICE_MONITOR_M2 = 1;
export const INDICE_MONITOR_M3 = 2;

export const LIVROS_BIBLIA = [
  { nome: 'Gênesis', sigla: 'Gn' }, { nome: 'Êxodo', sigla: 'Ex' },
  { nome: 'Levítico', sigla: 'Lv' }, { nome: 'Números', sigla: 'Nm' },
  { nome: 'Deuteronômio', sigla: 'Dt' }, { nome: 'Josué', sigla: 'Js' },
  { nome: 'Juízes', sigla: 'Jz' }, { nome: 'Rute', sigla: 'Rt' },
  { nome: '1 Samuel', sigla: '1Sm' }, { nome: '2 Samuel', sigla: '2Sm' },
  { nome: '1 Reis', sigla: '1Rs' }, { nome: '2 Reis', sigla: '2Rs' },
  { nome: '1 Crônicas', sigla: '1Cr' }, { nome: '2 Crônicas', sigla: '2Cr' },
  { nome: 'Esdras', sigla: 'Ed' }, { nome: 'Neemias', sigla: 'Ne' },
  { nome: 'Ester', sigla: 'Et' }, { nome: 'Jó', sigla: 'Jó' },
  { nome: 'Salmos', sigla: 'Sl' }, { nome: 'Provérbios', sigla: 'Pv' },
  { nome: 'Eclesiastes', sigla: 'Ec' }, { nome: 'Cantares', sigla: 'Ct' },
  { nome: 'Isaías', sigla: 'Is' }, { nome: 'Jeremias', sigla: 'Jr' },
  { nome: 'Lamentações', sigla: 'Lm' }, { nome: 'Ezequiel', sigla: 'Ez' },
  { nome: 'Daniel', sigla: 'Dn' }, { nome: 'Oséias', sigla: 'Os' },
  { nome: 'Joel', sigla: 'Jl' }, { nome: 'Amós', sigla: 'Am' },
  { nome: 'Obadias', sigla: 'Ob' }, { nome: 'Jonas', sigla: 'Jn' },
  { nome: 'Miquéias', sigla: 'Mq' }, { nome: 'Naum', sigla: 'Na' },
  { nome: 'Habacuque', sigla: 'Hc' }, { nome: 'Sofonias', sigla: 'Sf' },
  { nome: 'Ageu', sigla: 'Ag' }, { nome: 'Zacarias', sigla: 'Zc' },
  { nome: 'Malaquias', sigla: 'Ml' },
  { nome: 'Mateus', sigla: 'Mt' }, { nome: 'Marcos', sigla: 'Mc' },
  { nome: 'Lucas', sigla: 'Lc' }, { nome: 'João', sigla: 'Jo' },
  { nome: 'Atos', sigla: 'At' }, { nome: 'Romanos', sigla: 'Rm' },
  { nome: '1 Coríntios', sigla: '1Co' }, { nome: '2 Coríntios', sigla: '2Co' },
  { nome: 'Gálatas', sigla: 'Gl' }, { nome: 'Efésios', sigla: 'Ef' },
  { nome: 'Filipenses', sigla: 'Fp' }, { nome: 'Colossenses', sigla: 'Cl' },
  { nome: '1 Tessalonicenses', sigla: '1Ts' }, { nome: '2 Tessalonicenses', sigla: '2Ts' },
  { nome: '1 Timóteo', sigla: '1Tm' }, { nome: '2 Timóteo', sigla: '2Tm' },
  { nome: 'Tito', sigla: 'Tt' }, { nome: 'Filemom', sigla: 'Fm' },
  { nome: 'Hebreus', sigla: 'Hb' }, { nome: 'Tiago', sigla: 'Tg' },
  { nome: '1 Pedro', sigla: '1Pe' }, { nome: '2 Pedro', sigla: '2Pe' },
  { nome: '1 João', sigla: '1Jo' }, { nome: '2 João', sigla: '2Jo' },
  { nome: '3 João', sigla: '3Jo' }, { nome: 'Judas', sigla: 'Jd' },
  { nome: 'Apocalipse', sigla: 'Ap' },
];

const ALIASES_LIVRO = {
  genesis: 'Gênesis', genesi: 'Gênesis', gn: 'Gênesis',
  exodo: 'Êxodo', ex: 'Êxodo',
  levitico: 'Levítico', lv: 'Levítico',
  numeros: 'Números', nm: 'Números',
  deuteronomio: 'Deuteronômio', dt: 'Deuteronômio',
  josue: 'Josué', js: 'Josué',
  juizes: 'Juízes', jz: 'Juízes',
  rute: 'Rute', rt: 'Rute',
  samuel: '1 Samuel', '1 samuel': '1 Samuel', '1sm': '1 Samuel', '2 samuel': '2 Samuel', '2sm': '2 Samuel',
  reis: '1 Reis', '1 reis': '1 Reis', '1rs': '1 Reis', '2 reis': '2 Reis', '2rs': '2 Reis',
  cronicas: '1 Crônicas', '1 cronicas': '1 Crônicas', '1cr': '1 Crônicas', '2 cronicas': '2 Crônicas', '2cr': '2 Crônicas',
  esdras: 'Esdras', ed: 'Esdras',
  neemias: 'Neemias', ne: 'Neemias',
  ester: 'Ester', et: 'Ester',
  job: 'Jó',
  salmos: 'Salmos', salmo: 'Salmos', sl: 'Salmos', ps: 'Salmos',
  proverbios: 'Provérbios', pv: 'Provérbios',
  eclesiastes: 'Eclesiastes', ec: 'Eclesiastes',
  cantares: 'Cantares', ct: 'Cantares', canticos: 'Cantares', canticulos: 'Cantares',
  isaias: 'Isaías', is: 'Isaías',
  jeremias: 'Jeremias', jr: 'Jeremias',
  lamentacoes: 'Lamentações', lm: 'Lamentações',
  ezequiel: 'Ezequiel', ez: 'Ezequiel',
  daniel: 'Daniel', dn: 'Daniel',
  oseias: 'Oséias', os: 'Oséias',
  joel: 'Joel', jl: 'Joel',
  amos: 'Amós', am: 'Amós',
  obadias: 'Obadias', ob: 'Obadias',
  jonas: 'Jonas',
  miqueias: 'Miquéias', mq: 'Miquéias',
  naum: 'Naum', na: 'Naum',
  habacuque: 'Habacuque', hc: 'Habacuque',
  sofonias: 'Sofonias', sf: 'Sofonias',
  ageu: 'Ageu', ag: 'Ageu',
  zacarias: 'Zacarias', zc: 'Zacarias',
  malaquias: 'Malaquias', ml: 'Malaquias',
  mateus: 'Mateus', mt: 'Mateus',
  marcos: 'Marcos', mc: 'Marcos',
  lucas: 'Lucas', lc: 'Lucas',
  joao: 'João', jo: 'João',
  atos: 'Atos', at: 'Atos',
  romanos: 'Romanos', rm: 'Romanos',
  corintios: '1 Coríntios', '1 corintios': '1 Coríntios', '1co': '1 Coríntios', '2 corintios': '2 Coríntios', '2co': '2 Coríntios',
  galatas: 'Gálatas', gl: 'Gálatas',
  efesios: 'Efésios', ef: 'Efésios',
  filipenses: 'Filipenses', fp: 'Filipenses',
  colossenses: 'Colossenses', cl: 'Colossenses',
  tessalonicenses: '1 Tessalonicenses', '1 tessalonicenses': '1 Tessalonicenses', '1ts': '1 Tessalonicenses',
  '2 tessalonicenses': '2 Tessalonicenses', '2ts': '2 Tessalonicenses',
  timoteo: '1 Timóteo', '1 timoteo': '1 Timóteo', '1tm': '1 Timóteo', '2 timoteo': '2 Timóteo', '2tm': '2 Timóteo',
  tito: 'Tito', tt: 'Tito',
  filemom: 'Filemom', fm: 'Filemom',
  hebreus: 'Hebreus', hb: 'Hebreus',
  tiago: 'Tiago', tg: 'Tiago',
  pedro: '1 Pedro', '1 pedro': '1 Pedro', '1pe': '1 Pedro', '2 pedro': '2 Pedro', '2pe': '2 Pedro',
  '1 joao': '1 João', '1jo': '1 João', '2 joao': '2 João', '2jo': '2 João', '3 joao': '3 João', '3jo': '3 João',
  judas: 'Judas', jd: 'Judas',
  apocalipse: 'Apocalipse', ap: 'Apocalipse',
};

function normalizarTrecho(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function variantesTrecho(trecho) {
  const base = normalizarTrecho(trecho);
  if (!base) return [];
  const partes = base.split(/\s+/).filter(Boolean);
  const pareceSigla = partes.length > 1 && partes.every(
    (p) => /^\d+$/.test(p) || (p.length <= 3 && /^[a-z]+$/.test(p))
  );
  const compacto = pareceSigla ? partes.join('') : '';
  const out = [base];
  if (compacto && compacto !== base) out.push(compacto);
  return out;
}

/**
 * @param {string} entrada Nome ou abreviação (ex.: «jo», «Salmos», «1co»)
 * @returns {{ nome: string, sigla: string } | null}
 */
export function resolverLivroBiblia(entrada) {
  const livros = LIVROS_BIBLIA;
  for (const t of variantesTrecho(entrada)) {
    if (!t) continue;
    if (ALIASES_LIVRO[t]) {
      const nome = ALIASES_LIVRO[t];
      const hit = livros.find((l) => l.nome === nome);
      if (hit) return hit;
    }
    const porSigla = livros.filter((l) => normalizarTrecho(l.sigla) === t);
    if (porSigla.length === 1) return porSigla[0];
    const porNome = livros.filter((l) => normalizarTrecho(l.nome) === t);
    if (porNome.length === 1) return porNome[0];
    const porPrefixo = livros.filter(
      (l) =>
        normalizarTrecho(l.nome).startsWith(t) ||
        normalizarTrecho(l.sigla).startsWith(t)
    );
    if (porPrefixo.length === 1) return porPrefixo[0];
  }
  return null;
}
