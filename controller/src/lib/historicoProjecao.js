'use strict';

/**
 * Regra do histórico de projeção — o que conta como «esta música foi cantada».
 *
 * Vive fora do painel e fora do banco de propósito: é aqui que estão as decisões que
 * decidem se o relatório de repertório diz a verdade, e nenhuma delas se testa bem através
 * de uma janela do Electron ou de um ficheiro SQLite.
 */

/**
 * Quanto tempo tem de passar para a MESMA música contar como uma segunda vez.
 *
 * O problema que isto resolve: a projeção emite um comando por estrofe, e o operador salta
 * para trás e para a frente à vontade. Contar cada emissão daria «Grande é o Senhor: 47
 * vezes» num culto onde ela foi cantada uma. Contar só uma vez por música, para sempre,
 * daria o erro oposto — a música de abertura que volta no fim do culto é mesmo uma segunda
 * vez.
 *
 * Vinte minutos separam as duas situações com folga: nenhuma música dura tanto, e nenhum
 * reprise honesto acontece tão depressa.
 */
const JANELA_REPETICAO_MS = 20 * 60 * 1000;

/**
 * Identidade de uma música para efeitos de repetição.
 *
 * A `root_id` e não o `id`: original e cópia editável são a mesma música para quem monta
 * repertório, e projetar a cópia logo a seguir ao original é o operador a trocar de versão,
 * não a congregação a cantar duas vezes.
 *
 * O banco de origem entra na chave porque `catalog.db` e o banco do utilizador numeram as
 * suas músicas de forma independente: sem ele, a música 12 do catálogo e a 12 do utilizador
 * seriam a mesma coisa.
 *
 * @param {object} reg
 */
function chaveRepeticao(reg) {
  const fonte = reg && reg.bancoFonte === 'catalog' ? 'catalog' : 'user';
  const raiz = Number(reg && (reg.rootId ?? reg.musicaId));
  if (Number.isFinite(raiz) && raiz > 0) return `${fonte}:${raiz}`;
  /* Sem id (música de fonte externa ainda por gravar): o título serve de identidade. */
  return `${fonte}:t:${normalizarTexto(reg && reg.titulo)}`;
}

function normalizarTexto(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decide se esta projeção deve virar uma linha no histórico.
 *
 * @param {object} reg Registo candidato.
 * @param {{chave: string, em: number} | null} ultimo Última projeção registada nesta sessão.
 * @param {number} agora
 * @param {number} [janelaMs]
 * @returns {boolean}
 */
function deveRegistar(reg, ultimo, agora, janelaMs = JANELA_REPETICAO_MS) {
  if (!reg) return false;
  if (!ultimo) return true;
  if (chaveRepeticao(reg) !== ultimo.chave) return true;
  const decorrido = Number(agora) - Number(ultimo.em);
  /* `!Number.isFinite` apanha o relógio a andar para trás (NTP a meio do culto): nesse
     caso, registar é o erro menos mau — perder a linha seria perder o dado. */
  if (!Number.isFinite(decorrido)) return true;
  return decorrido >= janelaMs;
}

/** Marca a devolver a `deveRegistar` na chamada seguinte. */
function marcaDeRegisto(reg, agora) {
  return { chave: chaveRepeticao(reg), em: Number(agora) };
}

/**
 * Normaliza o que vai para o banco.
 *
 * Título, artista, tom, ministrante e culto são gravados por extenso, e não só por id. Não
 * é redundância: o histórico é registo do passado, e o passado não pode mudar porque
 * alguém apagou uma música, renomeou um culto ou corrigiu o nome de um ministrante. Um
 * relatório de direitos autorais que perde as linhas das músicas entretanto apagadas não
 * serve para prestar contas.
 *
 * @param {object} bruto
 * @param {number} agora
 */
function normalizarRegisto(bruto, agora) {
  const r = bruto && typeof bruto === 'object' ? bruto : {};
  const titulo = String(r.titulo ?? '').trim();
  if (!titulo) return null;

  const musicaId = Number.parseInt(r.musicaId, 10);
  const rootId = Number.parseInt(r.rootId, 10);
  const ministranteId = Number.parseInt(r.ministranteId, 10);
  const em = Number.isFinite(Number(r.projetadoEm)) ? Number(r.projetadoEm) : Number(agora);

  return {
    musicaId: Number.isFinite(musicaId) ? musicaId : null,
    rootId: Number.isFinite(rootId) ? rootId : Number.isFinite(musicaId) ? musicaId : null,
    bancoFonte: r.bancoFonte === 'catalog' ? 'catalog' : 'user',
    titulo,
    artista: String(r.artista ?? '').trim(),
    rotulo: String(r.rotulo ?? '').trim(),
    tom: String(r.tom ?? '').trim(),
    ministranteId: Number.isFinite(ministranteId) ? ministranteId : null,
    ministranteNome: String(r.ministranteNome ?? '').trim(),
    cultoId: String(r.cultoId ?? '').trim(),
    cultoNome: String(r.cultoNome ?? '').trim(),
    projetadoEm: em,
  };
}

/**
 * Agrega o histórico por música: quantas vezes, quando foi a última, com que tons.
 *
 * Agrupa pela mesma chave da repetição — original e cópia contam juntos —, mas mostra o
 * título mais recente de cada grupo: uma música cujo título foi corrigido deve aparecer
 * pelo nome novo, não pelo que tinha há dois anos.
 *
 * @param {object[]} linhas Registos já normalizados, em qualquer ordem.
 * @returns {object[]} Ordenado por número de vezes (desc), depois por título.
 */
function agregarRepertorio(linhas) {
  const mapa = new Map();

  (Array.isArray(linhas) ? linhas : []).forEach((l) => {
    if (!l) return;
    const k = chaveRepeticao(l);
    const em = Number(l.projetadoEm) || 0;
    let g = mapa.get(k);
    if (!g) {
      g = {
        chave: k,
        musicaId: l.musicaId ?? null,
        rootId: l.rootId ?? null,
        bancoFonte: l.bancoFonte || 'user',
        titulo: String(l.titulo || ''),
        artista: String(l.artista || ''),
        vezes: 0,
        primeiraEm: em,
        ultimaEm: em,
        tons: [],
        ministrantes: [],
      };
      mapa.set(k, g);
    }
    g.vezes += 1;
    if (em < g.primeiraEm) g.primeiraEm = em;
    if (em >= g.ultimaEm) {
      g.ultimaEm = em;
      /* O título e o artista mais recentes ganham — ver o comentário acima. */
      if (l.titulo) g.titulo = String(l.titulo);
      if (l.artista) g.artista = String(l.artista);
    }
    const tom = String(l.tom || '').trim();
    if (tom && !g.tons.includes(tom)) g.tons.push(tom);
    const min = String(l.ministranteNome || '').trim();
    if (min && !g.ministrantes.includes(min)) g.ministrantes.push(min);
  });

  return [...mapa.values()].sort(
    (a, b) => b.vezes - a.vezes || a.titulo.localeCompare(b.titulo, 'pt-BR')
  );
}

/**
 * Dias inteiros desde a última vez, para a coluna «há quanto tempo».
 *
 * Conta dias de calendário, não períodos de 24 h: uma música cantada ontem à noite e
 * consultada hoje de manhã tem «1 dia», e não «0» — que é o que o operador entende ao ler.
 *
 * @param {number} ultimaEm
 * @param {number} agora
 */
function diasDesde(ultimaEm, agora) {
  const a = new Date(Number(ultimaEm));
  const b = new Date(Number(agora));
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
  const diaA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const diaB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(0, Math.round((diaB - diaA) / 86400000));
}

/**
 * Início e fim (em ms) de um período nomeado, no fuso local.
 *
 * O fim é o último instante do dia de hoje, e não «agora»: um relatório pedido às 10 h da
 * manhã não deve excluir o que ainda vai ser projetado hoje à tarde, senão o número muda
 * consoante a hora a que se abre a janela.
 *
 * @param {'30d'|'90d'|'12m'|'tudo'|string} periodo
 * @param {number} agora
 */
function intervaloDoPeriodo(periodo, agora) {
  const fim = new Date(Number(agora));
  fim.setHours(23, 59, 59, 999);
  const fimMs = fim.getTime();

  if (periodo === 'tudo') return { de: 0, ate: fimMs };

  const ini = new Date(Number(agora));
  ini.setHours(0, 0, 0, 0);
  if (periodo === '90d') ini.setDate(ini.getDate() - 89);
  else if (periodo === '12m') ini.setFullYear(ini.getFullYear() - 1);
  else ini.setDate(ini.getDate() - 29);

  return { de: ini.getTime(), ate: fimMs };
}

/**
 * Data e hora legíveis, no fuso local, para o ecrã e para o CSV.
 *
 * `YYYY-MM-DD HH:MM` e não o formato do país: é o único que o Excel e o Google Sheets
 * ordenam correctamente como texto, e um relatório que ordena mal é um relatório que se
 * refaz à mão.
 *
 * @param {number} ms
 */
function dataHoraLocal(ms) {
  const d = new Date(Number(ms));
  if (!Number.isFinite(d.getTime())) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}`
  );
}

/**
 * Uma célula de CSV.
 *
 * As aspas são obrigatórias em qualquer campo com vírgula, aspas ou quebra de linha — e
 * títulos de música têm vírgulas com frequência («Tu és fiel, Senhor»). Um título que
 * derrama para a coluna seguinte estraga a linha inteira e só se dá por isso ao conferir.
 *
 * @param {unknown} v
 */
function celulaCsv(v) {
  const t = v == null ? '' : String(v);
  if (!/[",\r\n;]/.test(t)) return t;
  return `"${t.replace(/"/g, '""')}"`;
}

/**
 * CSV do histórico detalhado.
 *
 * Leva BOM à cabeça. Sem ele, o Excel no Windows abre o ficheiro em ANSI e todos os
 * acentos saem trocados — «Ó Senhor» vira «Ã" Senhor» na primeira coluna que alguém olha.
 * Nada mais no ficheiro precisa disto; o BOM é só para o Excel se convencer de que é UTF-8.
 *
 * @param {object[]} linhas Registos normalizados.
 */
function csvHistorico(linhas) {
  const cab = ['Data e hora', 'Música', 'Artista', 'Versão', 'Tom', 'Ministrante', 'Culto'];
  const corpo = (Array.isArray(linhas) ? linhas : []).map((l) =>
    [
      dataHoraLocal(l && l.projetadoEm),
      l && l.titulo,
      l && l.artista,
      l && l.rotulo,
      l && l.tom,
      l && l.ministranteNome,
      l && l.cultoNome,
    ]
      .map(celulaCsv)
      .join(',')
  );
  return `\ufeff${[cab.map(celulaCsv).join(','), ...corpo].join('\r\n')}\r\n`;
}

/**
 * CSV do resumo de repertório.
 *
 * @param {object[]} grupos Saída de `agregarRepertorio`.
 * @param {number} agora
 */
function csvRepertorio(grupos, agora) {
  const cab = [
    'Música',
    'Artista',
    'Vezes',
    'Última vez',
    'Dias desde a última',
    'Tons usados',
    'Ministrantes',
  ];
  const corpo = (Array.isArray(grupos) ? grupos : []).map((g) =>
    [
      g && g.titulo,
      g && g.artista,
      g && g.vezes,
      dataHoraLocal(g && g.ultimaEm),
      g ? diasDesde(g.ultimaEm, agora) : '',
      g && Array.isArray(g.tons) ? g.tons.join(' / ') : '',
      g && Array.isArray(g.ministrantes) ? g.ministrantes.join(' / ') : '',
    ]
      .map(celulaCsv)
      .join(',')
  );
  return `\ufeff${[cab.map(celulaCsv).join(','), ...corpo].join('\r\n')}\r\n`;
}

/**
 * Intervalo pedido, venha ele como período nomeado ou como par de instantes.
 *
 * Vive aqui, e não dentro de cada rota, porque a rota que APAGA usa exactamente esta
 * função. Uma consulta e uma limpeza que interpretassem «últimos 90 dias» de maneiras
 * ligeiramente diferentes seriam a receita para apagar o que o operador tinha à frente na
 * lista — e para só se dar por isso meses depois, ao procurar o que já não existe.
 *
 * `de`/`ate` explícitos ganham ao período nomeado, mas só se fizerem sentido: um intervalo
 * invertido (`ate` antes de `de`) é descartado a favor do período, em vez de devolver
 * silenciosamente zero linhas — ou, na limpeza, de apagar zero e dizer que correu bem.
 *
 * @param {object} fonte `req.query` ou `req.body`.
 * @param {number} agora
 */
function intervaloPedido(fonte, agora) {
  const f = fonte && typeof fonte === 'object' ? fonte : {};
  const de = Number(f.de);
  const ate = Number(f.ate);
  if (Number.isFinite(de) && Number.isFinite(ate) && ate >= de) return { de, ate };
  return intervaloDoPeriodo(String(f.periodo || '30d'), agora);
}

module.exports = {
  JANELA_REPETICAO_MS,
  chaveRepeticao,
  deveRegistar,
  marcaDeRegisto,
  normalizarRegisto,
  agregarRepertorio,
  diasDesde,
  intervaloDoPeriodo,
  intervaloPedido,
  dataHoraLocal,
  celulaCsv,
  csvHistorico,
  csvRepertorio,
};
