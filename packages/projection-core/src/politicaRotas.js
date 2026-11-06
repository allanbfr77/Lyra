'use strict';

/**
 * Avaliação de rotas por CONTEXTO (E1.3 Fase C — etapa C1).
 *
 * `classificarRota(metodo, caminho)` (autenticacaoHttp.js) olha só o caminho e continua sendo o que
 * a autenticação usa para decidir. Este módulo acrescenta, SEM mudar essa decisão, a leitura do
 * manifesto de rotas (C0) por contexto: a mesma rota pode ter política diferente no Controlador
 * (`controlador-3001`), no Servidor separado (`servidor-5510`) e no motor local (`local-5510`).
 *
 * O que faz: classifica e descreve a credencial ESPERADA e o motivo de uma recusa FUTURA.
 * O que NÃO faz: não decide, não recusa, não autentica, não lê credencial nenhuma, não lê o
 * ambiente e não grava em disco. As decisões são dados puros.
 *
 * Três credenciais, nunca misturadas:
 *   - `dispositivo`: X-Lyra-Device/Secret, conferida na allowlist;
 *   - `interna`: a do painel (arquitetura W), só Controlador e motor local;
 *   - `interprocessos` (X-Lyra-Via): AINDA NÃO EXISTE. É descrita como «esperada» e o campo
 *     `existe` é sempre `false`; nada aqui a simula ou a considera satisfeita.
 *
 * Semântica do elo no manifesto (`credencial.elo`): `c→s`/`s→c` é a direção da chamada que
 * carrega a assinatura. Para uma rota do Servidor com `c→s`, e para uma rota do Controlador
 * com `s→c` (alcançada pelo proxy), o elo é de ENTRADA (credencial esperada na requisição). Nos
 * demais casos é de SAÍDA: a rota faz uma chamada que precisará assinar (ex.: o salto do 3001).
 *
 * Único módulo de produção autorizado a importar o manifesto.
 */

const { ROTAS } = require('./manifestoRotas');
const { classificarRota, normalizarCaminho } = require('./autenticacaoHttp');

const CONTEXTOS = Object.freeze({
  'controlador-3001': 'C',
  'servidor-5510': 'S',
  'local-5510': 'L',
});

const POLITICAS_PUBLICAS = ['PUB', 'PUB-LEVE', 'PEDIDO'];

/* ───────────────────────── índice por contexto ───────────────────────── */

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Caminho do manifesto → { regex, pontos } (mais literais = mais específico). */
function compilarCaminho(caminho) {
  if (caminho === '/*') return { regex: /^\/(?!api(?:\/|$)).*$/, pontos: -1 };
  let pontos = 0;
  const partes = caminho.toLowerCase().split('/').slice(1).map((seg) => {
    if (seg === '*') return '.*';
    if (seg.startsWith(':')) { pontos += 1; return '[^/]+'; }
    const grupo = /^\{([^}]+)\}$/.exec(seg);
    if (grupo) { pontos += 5; return `(?:${grupo[1].split(',').map(escaparRegex).join('|')})`; }
    pontos += 10;
    return escaparRegex(seg);
  });
  const terminaEmCuringa = partes[partes.length - 1] === '.*';
  // «/api/musicas/*» casa «/api/musicas» e tudo abaixo dele (é o que o proxy do Servidor faz)
  const corpo = terminaEmCuringa ? `${partes.slice(0, -1).join('/')}(?:/.*)?` : partes.join('/');
  return { regex: new RegExp(`^/${corpo}$`), pontos: terminaEmCuringa ? pontos - 5 : pontos };
}

function esperadaDe(r) {
  const p = r.politicaPretendida;
  const c = r.credencial;
  const entrada = (r.servidor === 'S' && c.elo === 'c→s') || (r.servidor === 'C' && c.elo === 's→c');
  let alternativaA = [];
  if (p.some((x) => ['LER', 'ESC', 'CMD'].includes(x))) alternativaA = ['dispositivo'];
  else if (p.includes('PL')) alternativaA = ['interna'];
  return {
    esperada: {
      dispositivo: c.dispositivo,
      interna: c.interna,
      interprocessos: entrada
        ? { esperada: true, existe: false, direcao: c.elo, alternativaA }
        : { esperada: false, existe: false, direcao: null, alternativaA: [] },
      loopback: p.includes('LOC') || p.includes('ADM') || r.classeAtual === 'loopback-estrito',
      humano: p.includes('PEDIDO'),
    },
    saida: { interprocessos: !entrada && c.elo !== 'nao' ? { direcao: c.elo, existe: false } : null },
  };
}

const INDICE = new Map();
for (const ctx of Object.keys(CONTEXTOS)) {
  const sigla = CONTEXTOS[ctx];
  const lista = ROTAS.filter((r) => r.servidor === sigla).map((r, ordem) => ({
    r,
    ordem,
    ...compilarCaminho(r.caminho),
    metodos: r.metodo.split(','),
    derivado: esperadaDe(r),
  }));
  INDICE.set(ctx, lista);
}

function casaMetodo(entrada, metodo) {
  if (entrada.r.tipo === 'proxy') return true; // o proxy intercepta qualquer método da família
  if (entrada.metodos.includes(metodo)) return true;
  return metodo === 'HEAD' && entrada.metodos.includes('GET');
}

/* ───────────────────────── avaliação ───────────────────────── */

function semManifesto(contexto, metodo, caminho, origem) {
  return {
    contexto,
    encontrada: false,
    origem,
    id: null,
    tipo: undefined,
    classe: null,
    classeAtual: classificarRota(metodo, caminho),
    politica: null,
    publica: null,
  };
}

/**
 * @param {string} contexto 'controlador-3001' | 'servidor-5510' | 'local-5510'
 * @param {string} metodo
 * @param {string} caminho caminho (com ou sem query)
 * @returns {object} decisão (dados puros; ver o teste para o formato completo)
 */
function avaliarRota(contexto, metodo, caminho) {
  const m = String(metodo || 'GET').toUpperCase();
  const lista = INDICE.get(contexto);
  if (!lista) return semManifesto(contexto, m, String(caminho || '/'), 'contexto-desconhecido');

  const p = normalizarCaminho(caminho);
  if (m === 'OPTIONS') {
    return { ...semManifesto(contexto, m, p, 'preflight'), encontrada: true, classe: 'publica', politica: ['PUB'], publica: true,
      divergeDaClasseAtual: false, liberariaHoje: true, esperada: { dispositivo: 'nao-usa', interna: 'nao', interprocessos: { esperada: false, existe: false, direcao: null, alternativaA: [] }, loopback: false, humano: false },
      saida: { interprocessos: null }, relacionadas: [], alcancavelPorProxy: false, guardaPropria: 'nao-se-aplica' };
  }

  let melhor = null;
  for (const e of lista) {
    if (!e.regex.test(p) || !casaMetodo(e, m)) continue;
    if (!melhor || e.pontos > melhor.pontos || (e.pontos === melhor.pontos && e.ordem < melhor.ordem)) melhor = e;
  }
  if (!melhor) return semManifesto(contexto, m, p, 'sem-manifesto');

  const r = melhor.r;
  const publica = r.politicaPretendida.some((x) => POLITICAS_PUBLICAS.includes(x));
  const classeAtual = classificarRota(m, p);
  const liberariaHoje = classeAtual === 'publica';
  const ehProxy = r.tipo === 'proxy';
  const atravessa = ehProxy ? m === 'GET' || m === 'HEAD' : undefined;
  return {
    contexto,
    encontrada: true,
    origem: 'manifesto',
    id: r.id,
    servidor: r.servidor,
    tipo: r.tipo,
    metodoManifesto: r.metodo,
    caminhoManifesto: r.caminho,
    classe: r.classe,
    classeAtual,
    destrutiva: r.destrutiva,
    politica: [...r.politicaPretendida],
    publica,
    liberariaHoje,
    divergeDaClasseAtual: publica !== liberariaHoje,
    guardaPropria: r.guardaPropria,
    esperada: JSON.parse(JSON.stringify(melhor.derivado.esperada)),
    saida: JSON.parse(JSON.stringify(melhor.derivado.saida)),
    alcancavelPorProxy: r.servidor === 'C' && r.credencial.elo === 's→c',
    relacionadas: r.caminhosAlternativos.map((a) => ({ id: a.id, relacao: a.relacao })),
    ...(ehProxy ? { proxy: { atravessa, statusDoProxy: atravessa ? null : 405 } } : {}),
  };
}

/* ───────────────────────── motivo de uma recusa futura ───────────────────────── */

/**
 * O que o modo «impor» faria com esta requisição, SE estivesse ativo. Não recusa nada.
 *
 * @param {object} decisao resultado de `avaliarRota`
 * @param {{tipo: string, proxificada?: boolean, loopback?: boolean, eloDisponivel?: boolean, eloPresente?: boolean}} apresentada
 *        tipo: 'ausente' | 'interna' | 'dispositivo-autorizado' | 'dispositivo-<classe>' | 'nao-verificavel'
 * @returns {{recusaria: (boolean|null), motivo: (string|null), credencialInexistente: boolean}}
 */
function motivoRecusaFutura(decisao, apresentada) {
  const recusa = (motivo, inexistente = false) => ({ recusaria: true, motivo, credencialInexistente: inexistente });
  if (!decisao || !decisao.encontrada) return { recusaria: null, motivo: 'rota-sem-politica', credencialInexistente: false };
  if (decisao.publica) return { recusaria: false, motivo: null, credencialInexistente: false };

  const a = { proxificada: false, loopback: true, ...(apresentada || {}) };
  const e = decisao.esperada;

  if (e.loopback) {
    if (a.proxificada) return recusa('loopback-estrito: requisição proxificada em rota local');
    if (!a.loopback) return recusa('loopback-estrito: requisição fora da própria máquina');
  }

  // Entrega 1: o elo interprocessos existe. Rota que o espera e o traz (cabeçalho presente; a
  // VALIDADE da assinatura é registrada à parte, em `elo-http`) não seria recusada por falta de credencial.
  if (e.interprocessos.esperada && a.eloPresente === true) return { recusaria: false, motivo: null, credencialInexistente: false };

  const dispositivoOk = a.tipo === 'dispositivo-autorizado';
  const internaOk = a.tipo === 'interna';

  if (e.interna === 'exigida') {
    return internaOk ? { recusaria: false, motivo: null, credencialInexistente: false } : recusa(`painel-local: requer credencial interna (apresentada: ${a.tipo})`);
  }
  if (e.dispositivo === 'exigida') {
    if (dispositivoOk || (e.interna === 'aceita' && internaOk)) return { recusaria: false, motivo: null, credencialInexistente: false };
    return recusa(`dispositivo: ${String(a.tipo).replace(/^dispositivo-/, '')}`);
  }
  if (e.interprocessos.esperada) {
    if (a.eloDisponivel === true) return recusa('interprocessos: assinatura X-Lyra-Via ausente', false);
    return recusa('interprocessos: credencial ainda inexistente (aguarda as etapas C3 em diante)', true);
  }
  return { recusaria: false, motivo: null, credencialInexistente: false };
}

module.exports = { avaliarRota, motivoRecusaFutura, CONTEXTOS };
