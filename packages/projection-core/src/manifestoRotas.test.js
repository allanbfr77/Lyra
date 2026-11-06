'use strict';

/**
 * E1.3 Fase C — C0: consistência do MANIFESTO DE ROTAS.
 *
 * O manifesto (`manifestoRotas.js`) descreve, para cada rota HTTP dos três servidores, quem a
 * atende, como é classificada, que proteção ela tem DE FATO hoje e que política se pretende.
 * Estes testes o amarram ao código:
 *
 *  - o código-fonte é varrido atrás de declarações de rota; toda rota declarada tem entrada, e
 *    toda entrada de rota existe no arquivo declarado (nenhuma rota fica sem política);
 *  - a classe «atual» do manifesto é a que `classificarRota` devolve (não é opinião);
 *  - a guarda própria de cada rota (middleware de IP, guarda dentro do handler, segredo) é
 *    confirmada NO TEXTO da declaração, e não presumida por haver middleware no caminho;
 *  - o documento gerado em `docs/seguranca/manifesto-rotas.md` está em dia;
 *  - a C0 não muda comportamento: nenhum código de produção importa o manifesto.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('./manifestoRotas');
const { classificarRota } = require('./autenticacaoHttp');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

/* ───────────────────────── varredura do código-fonte ───────────────────────── */

const RE_ROTA = /\b(expressApp|apiApp|obsApp)\s*\.\s*(get|post|put|delete|patch|all|head)\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;

function listarJs(dirRel) {
  const out = [];
  const abs = path.join(RAIZ, dirRel);
  for (const nome of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dirRel}/${nome.name}`;
    if (nome.isDirectory()) out.push(...listarJs(rel));
    else if (/\.js$/.test(nome.name) && !/\.test\.js$/.test(nome.name) && !/\.harness\.js$/.test(nome.name)) out.push(rel);
  }
  return out;
}

/** Declarações de rota de um arquivo: método, caminho literal (ou template), posição e linha. */
function declaracoes(rel) {
  const src = ler(rel);
  const achadas = [];
  let m;
  RE_ROTA.lastIndex = 0;
  while ((m = RE_ROTA.exec(src))) {
    achadas.push({
      arquivo: rel,
      metodo: m[2].toUpperCase(),
      bruto: m[3],
      caminho: m[3].slice(1, -1),
      template: m[3][0] === '`',
      indice: m.index,
      linha: src.slice(0, m.index).split(/\r?\n/).length,
      fonte: src,
    });
  }
  return achadas;
}

const ARQUIVOS_FONTE = [...listarJs('server/src'), ...listarJs('controller/src'), ...listarJs('packages/projection-core/src')];
const TODAS_DECLARACOES = ARQUIVOS_FONTE.flatMap((f) => declaracoes(f));

/** Caminho do template → o do manifesto. Só dois templates existem e são conhecidos. */
function caminhoDoManifesto(d) {
  if (d.template && d.caminho.startsWith('/vosk-model/')) return '/vosk-model/:arquivo';
  return d.caminho;
}

/* ───────────────────────── esquema ───────────────────────── */

test('manifesto: entradas completas, ids únicos e vocabulários fechados', () => {
  assert.ok(Array.isArray(M.ROTAS) && M.ROTAS.length > 100, `entradas: ${M.ROTAS.length}`);
  const ids = new Set();
  const chaves = new Set();
  for (const r of M.ROTAS) {
    assert.ok(!ids.has(r.id), `id repetido ${r.id}`);
    ids.add(r.id);
    const chave = `${r.servidor} ${r.metodo} ${r.caminho}`;
    assert.ok(!chaves.has(chave), `entrada duplicada: ${chave}`);
    chaves.add(chave);

    assert.ok(M.VOCAB.servidores.includes(r.servidor), `${r.id} servidor`);
    assert.ok([3001, 5510, 5001].includes(r.porta), `${r.id} porta`);
    assert.ok(M.VOCAB.tipos.includes(r.tipo), `${r.id} tipo`);
    assert.ok(typeof r.metodo === 'string' && r.metodo.length > 0, `${r.id} método`);
    assert.ok(r.caminho.startsWith('/'), `${r.id} caminho`);
    assert.ok(r.handler && typeof r.handler.arquivo === 'string', `${r.id} handler.arquivo`);
    assert.ok(Number.isInteger(r.handler.linha) && r.handler.linha > 0, `${r.id} handler.linha`);
    assert.ok(M.VOCAB.classes.includes(r.classe), `${r.id} classe «${r.classe}»`);
    assert.ok(M.VOCAB.classesAtuais.includes(r.classeAtual), `${r.id} classeAtual «${r.classeAtual}»`);
    assert.ok(M.VOCAB.guardas.includes(r.guardaPropria), `${r.id} guardaPropria «${r.guardaPropria}»`);
    assert.ok(Array.isArray(r.politicaPretendida) && r.politicaPretendida.length > 0, `${r.id} política`);
    for (const p of r.politicaPretendida) assert.ok(M.VOCAB.politicas.includes(p), `${r.id} política «${p}»`);
    assert.ok(M.VOCAB.credDispositivo.includes(r.credencial.dispositivo), `${r.id} cred.dispositivo`);
    assert.ok(M.VOCAB.credInterna.includes(r.credencial.interna), `${r.id} cred.interna`);
    assert.ok(M.VOCAB.elo.includes(r.credencial.elo), `${r.id} cred.elo`);
    assert.ok(Array.isArray(r.clientes) && r.clientes.length > 0, `${r.id} clientes`);
    for (const c of r.clientes) assert.ok(M.VOCAB.clientes.includes(c), `${r.id} cliente «${c}»`);
    assert.ok(Array.isArray(r.dependencias), `${r.id} dependências`);
    assert.ok(typeof r.compatibilidade === 'string' && r.compatibilidade.length > 0, `${r.id} compatibilidade`);
    assert.ok(typeof r.riscos === 'string' && r.riscos.length > 0, `${r.id} riscos`);
    assert.ok(Array.isArray(r.testes) && r.testes.length > 0, `${r.id} testes`);
    for (const t of r.testes) assert.ok(M.VOCAB.testes.includes(t), `${r.id} teste «${t}»`);
    assert.ok(Array.isArray(r.caminhosAlternativos), `${r.id} caminhosAlternativos`);
  }
});

test('manifesto: os três servidores estão representados, com as portas certas', () => {
  const por = (s) => M.ROTAS.filter((r) => r.servidor === s);
  assert.ok(por('C').length > 0 && por('S').length > 0 && por('L').length > 0);
  assert.ok(por('C').every((r) => r.porta === 3001), 'Controlador na 3001');
  assert.ok(por('S').every((r) => r.porta === 5510 || r.porta === 5001), 'Servidor na 5510 (API) e 5001 (OBS)');
  assert.ok(por('L').every((r) => r.porta === 5510 || r.porta === 5001), 'motor local na 5510 e 5001');
  for (const s of ['S', 'L']) {
    assert.ok(por(s).some((r) => r.porta === 5001), `${s}: OBS na 5001`);
  }
});

/* ───────────────────────── cobertura do código ───────────────────────── */

test('código → manifesto: toda rota declarada nas fontes tem entrada (nenhuma rota sem política)', () => {
  const rotas = M.ROTAS.filter((r) => r.tipo === 'rota');
  const faltando = [];
  for (const d of TODAS_DECLARACOES) {
    const camin = caminhoDoManifesto(d);
    // `/api/comando/${comando}` é laço sobre uma lista fechada: coberto pela checagem própria abaixo
    if (d.template && d.caminho.startsWith('/api/comando/')) continue;
    const achou = rotas.some((r) => r.metodo === d.metodo && r.caminho === camin && r.handler.arquivo === d.arquivo);
    if (!achou) faltando.push(`${d.arquivo}:${d.linha} ${d.metodo} ${d.bruto}`);
  }
  assert.deepEqual(faltando, [], `rotas declaradas sem entrada no manifesto:\n${faltando.join('\n')}`);
});

test('código → manifesto: o laço de comandos do motor local tem uma entrada por comando, e só esses', () => {
  const fonte = ler('controller/src/projecaoLocal.js');
  const bloco = /for \(const comando of \[([\s\S]*?)\]\)/.exec(fonte);
  assert.ok(bloco, 'laço de comandos não encontrado');
  const nomes = [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  const doLaco = nomes.map((n) => `/api/comando/${n}`);
  const esperadas = [...doLaco, '/api/comando/exibir_contagem', '/api/comando/encerrar_contagem'].sort();
  const noManifesto = M.ROTAS.filter((r) => r.servidor === 'L' && r.caminho.startsWith('/api/comando/')).map((r) => r.caminho).sort();
  assert.deepEqual(noManifesto, esperadas);
});

test('manifesto → código: toda entrada de rota existe no arquivo declarado (método e caminho)', () => {
  const inexistentes = [];
  for (const r of M.ROTAS.filter((x) => x.tipo === 'rota')) {
    if (r.servidor === 'L' && r.caminho.startsWith('/api/comando/')) continue; // coberto no teste do laço
    const decls = declaracoes(r.handler.arquivo);
    const ok = decls.some((d) => d.metodo === r.metodo && caminhoDoManifesto(d) === r.caminho);
    if (!ok) inexistentes.push(`${r.id} ${r.metodo} ${r.caminho} em ${r.handler.arquivo}`);
  }
  assert.deepEqual(inexistentes, [], `entradas sem declaração no arquivo:\n${inexistentes.join('\n')}`);
});

test('código → manifesto: nenhum arquivo novo declara rotas sem ser listado (varredura de server/src, controller/src e core)', () => {
  const comRotas = new Set(TODAS_DECLARACOES.map((d) => d.arquivo));
  const declarados = new Set(M.ARQUIVOS_COM_ROTAS);
  const novos = [...comRotas].filter((f) => !declarados.has(f));
  assert.deepEqual(novos, [], `arquivos com rotas fora de ARQUIVOS_COM_ROTAS: ${novos.join(', ')}`);
  for (const f of M.ARQUIVOS_COM_ROTAS) assert.ok(fs.existsSync(path.join(RAIZ, f)), `arquivo inexistente: ${f}`);
});

test('proxies, estáticos e Socket.IO: montagens que não são rotas simples estão no manifesto e no código', () => {
  const proxies = M.ROTAS.filter((r) => r.tipo === 'proxy');
  assert.equal(proxies.length, 3, 'três famílias de proxy no Servidor');
  for (const p of proxies) {
    assert.equal(p.servidor, 'S');
    const src = ler(p.handler.arquivo);
    assert.match(src, /expressApp\.use\(/, `${p.id}: montagem por use() em ${p.handler.arquivo}`);
  }
  const servidorSrc = ler('server/src/httpServer.js');
  for (const nome of ['attachProxyMusicaAoControlador', 'attachProxyBibliaAoControlador', 'attachProxyApresentacaoVideoAoControlador']) {
    assert.ok(servidorSrc.includes(`${nome}(expressApp`), `${nome} montado no Servidor`);
  }
  const ctlSrc = ler('controller/src/httpControllerServer.js');
  assert.match(ctlSrc, /expressApp\.use\(express\.static\(publicDir\)\)/);
  assert.ok(M.ROTAS.some((r) => r.tipo === 'estatico' && r.servidor === 'C'));
  assert.ok(M.ROTAS.some((r) => r.tipo === 'socket' && r.servidor === 'S'));
  assert.ok(M.ROTAS.some((r) => r.tipo === 'socket' && r.servidor === 'L'));
});

/* ───────────────────────── paridade com a autenticação e guardas reais ───────────────────────── */

function caminhoParaClassificar(r) {
  return r.caminho.replace(/:[A-Za-z_]+/g, '1').replace('*', 'x');
}

test('classe atual do manifesto = classificarRota (a classe vem do código, não de opinião)', () => {
  const divergentes = [];
  for (const r of M.ROTAS.filter((x) => x.tipo === 'rota' || x.tipo === 'estatico' || x.tipo === 'socket')) {
    const real = classificarRota(r.metodo, caminhoParaClassificar(r));
    if (real !== r.classeAtual) divergentes.push(`${r.id} ${r.metodo} ${r.caminho}: manifesto=${r.classeAtual} código=${real}`);
  }
  assert.deepEqual(divergentes, []);
});

/** Texto da declaração: argumentos da chamada e o corpo seguinte até a próxima declaração. */
function trechoDaDeclaracao(d, todas) {
  const mesmas = todas.filter((x) => x.arquivo === d.arquivo).sort((a, b) => a.indice - b.indice);
  const pos = mesmas.findIndex((x) => x.indice === d.indice);
  const fim = pos >= 0 && mesmas[pos + 1] ? mesmas[pos + 1].indice : d.indice + 4000;
  const bruto = d.fonte.slice(d.indice, Math.min(fim, d.indice + 4000));
  const args = bruto.slice(0, 260);
  return { args, corpo: bruto };
}

function guardaDetectada(d, todas) {
  const { args, corpo } = trechoDaDeclaracao(d, todas);
  if (/\b(soDestaMaquina|soLocal)\b/.test(args)) return 'ip-loopback-middleware';
  if (/\bexigirCredencial\b/.test(args)) return 'credencial-na-rota';
  if (/\bexigirLocalOuElo\b/.test(args)) return 'local-ou-elo';
  if (/requisicaoVemDaMaquinaLocal\s*\(/.test(corpo)) return 'ip-loopback-handler';
  if (/LYRA_INVB_WEBHOOK_SECRET/.test(corpo) && /segredosIguais\(/.test(corpo)) return 'segredo-proprio';
  return 'nenhuma';
}

test('guarda própria: o manifesto só afirma o que o texto da declaração mostra (middleware existente não é presumido)', () => {
  const erros = [];
  for (const r of M.ROTAS.filter((x) => x.tipo === 'rota')) {
    if (r.servidor === 'L' && r.caminho.startsWith('/api/comando/') && !['/api/comando/exibir_contagem', '/api/comando/encerrar_contagem'].includes(r.caminho)) {
      // laço: todas usam soLocal na chamada `apiApp.post(`...`, soLocal, rotaComando(...))`
      const fonte = ler('controller/src/projecaoLocal.js');
      if (!/apiApp\.post\(`\/api\/comando\/\$\{comando\}`,\s*soLocal,/.test(fonte)) erros.push(`${r.id}: laço de comandos sem soLocal`);
      if (r.guardaPropria !== 'ip-loopback-middleware') erros.push(`${r.id}: manifesto diz ${r.guardaPropria}, código tem soLocal`);
      continue;
    }
    const d = declaracoes(r.handler.arquivo).find((x) => x.metodo === r.metodo && caminhoDoManifesto(x) === r.caminho);
    if (!d) continue; // já coberto pelo teste manifesto → código
    const todas = declaracoes(r.handler.arquivo);
    const real = guardaDetectada(d, todas);
    const afirmada = r.guardaPropria === 'segredo-proprio' ? 'segredo-proprio' : r.guardaPropria;
    if (real !== afirmada) erros.push(`${r.id} ${r.servidor} ${r.metodo} ${r.caminho}: manifesto=${afirmada} código=${real}`);
  }
  assert.deepEqual(erros, []);
});

test('rotas administrativas com confiança adicional: loopback estrito na classe atual E guarda real no código', () => {
  for (const r of M.ROTAS.filter((x) => x.classe === 'administrativa' && x.tipo === 'rota' && !x.novaGuardaLoc)) {
    assert.equal(r.classeAtual, 'loopback-estrito', `${r.id} ${r.caminho} deveria ser loopback-estrito hoje`);
    assert.ok(['ip-loopback-middleware', 'ip-loopback-handler'].includes(r.guardaPropria), `${r.id}: administrativa sem guarda real`);
  }
});

test('alerta honesto: rotas administrativas que HOJE não têm nem loopback-estrito nem guarda — Entrega 2 fechou as DevTools', () => {
  // open-*-devtools são «administrativas» por natureza e a classe atual é escrita; desde a Entrega 2 a guarda «local-ou-elo» as protege
  const abertas = M.ROTAS.filter((r) => r.classe === 'administrativa' && r.classeAtual !== 'loopback-estrito' && r.guardaPropria === 'nenhuma').map((r) => r.caminho).sort();
  assert.deepEqual(abertas, []);
  for (const r of M.ROTAS.filter((x) => /open-.*-devtools/.test(x.caminho))) assert.equal(r.guardaPropria, 'local-ou-elo');
});

/* ───────────────────────── invariantes de política ───────────────────────── */

test('política pretendida: coerente com a classe, os clientes e as credenciais', () => {
  const erros = [];
  const remotos = ['mobile', 'telao', 'obs', 'janela-controle-servidor', 'outro-controlador', 'servidor-proxy'];
  for (const r of M.ROTAS) {
    const pol = r.politicaPretendida;
    const tem = (p) => pol.includes(p);
    if (r.classe === 'comando' && !tem('CMD')) erros.push(`${r.id}: comando sem CMD`);
    if (tem('PL') && r.clientes.some((c) => remotos.includes(c))) erros.push(`${r.id}: PL com cliente remoto (${r.clientes.join(',')})`);
    if (tem('PL') && r.credencial.interna !== 'exigida') erros.push(`${r.id}: PL precisa de credencial interna «exigida»`);
    if (tem('PL') && r.credencial.dispositivo !== 'nao') erros.push(`${r.id}: PL não aceita credencial de dispositivo`);
    if ((tem('LER') || tem('ESC') || tem('CMD')) && r.credencial.dispositivo !== 'exigida') erros.push(`${r.id}: LER/ESC/CMD exigem credencial de dispositivo`);
    if ((tem('PUB') || tem('PUB-LEVE') || tem('PEDIDO')) && r.credencial.dispositivo === 'exigida') erros.push(`${r.id}: pública não pode exigir credencial de dispositivo`);
    if (tem('ELO') && r.credencial.elo === 'nao') erros.push(`${r.id}: ELO sem direção do elo`);
    if (r.credencial.elo !== 'nao' && !(tem('ELO') || tem('ADM') || tem('LER') || tem('ESC') || tem('PL') || tem('PUB') || tem('CMD'))) erros.push(`${r.id}: elo sem política compatível`);
    if (tem('LOC') && r.classeAtual !== 'loopback-estrito' && !r.novaGuardaLoc) erros.push(`${r.id}: LOC pretendida sem loopback-estrito atual (declare novaGuardaLoc)`);
    if (r.servidor === 'S' && r.credencial.interna !== 'nao') erros.push(`${r.id}: Servidor separado não conhece a credencial interna`);
    if ((tem('PUB') || tem('PUB-LEVE')) && ['escrita', 'comando', 'administrativa'].includes(r.classe)) erros.push(`${r.id}: ${r.classe} não pode ser pública`);
  }
  assert.deepEqual(erros, []);
});

test('rotas públicas que precisam continuar públicas estão marcadas e justificadas', () => {
  const pub = M.ROTAS.filter((r) => r.politicaPretendida.includes('PUB') || r.politicaPretendida.includes('PUB-LEVE') || r.politicaPretendida.includes('PEDIDO'));
  assert.ok(pub.length > 10);
  for (const r of pub) assert.ok(r.justificativaPublica && r.justificativaPublica.length > 15, `${r.id} ${r.caminho}: falta justificativa de ser pública`);
  for (const r of M.ROTAS.filter((x) => !pub.includes(x))) assert.ok(!r.justificativaPublica, `${r.id}: justificativa sem ser pública`);
});

test('aliases e duplicatas: apontam para entradas que existem e na mesma família', () => {
  const porId = new Map(M.ROTAS.map((r) => [r.id, r]));
  for (const r of M.ROTAS) {
    for (const a of r.caminhosAlternativos) {
      if (!a.id) continue;
      const alvo = porId.get(a.id);
      assert.ok(alvo, `${r.id} aponta para ${a.id} inexistente`);
      assert.ok(M.VOCAB.relacoes.includes(a.relacao), `${r.id}: relação «${a.relacao}»`);
    }
  }
  const aliasConhecidos = [
    ['C PUT /api/musicas/:id', 'C POST /api/musicas/:id/salvar'],
    ['C DELETE /api/musicas/:id', 'C POST /api/musicas/:id/excluir'],
    ['C PATCH /api/musicas/:id/rotulo', 'C POST /api/musicas/:id/rotulo'],
  ];
  const chave = (r) => `${r.servidor} ${r.metodo} ${r.caminho}`;
  for (const [a, b] of aliasConhecidos) {
    const ra = M.ROTAS.find((r) => chave(r) === a);
    assert.ok(ra && ra.caminhosAlternativos.some((x) => x.id && chave(porId.get(x.id)) === b), `alias ${a} ↔ ${b}`);
  }
  // mesma rota nos dois hospedeiros da 5510 (Servidor e motor local): duplicata registrada nos dois sentidos
  for (const s of M.ROTAS.filter((r) => r.servidor === 'S' && r.tipo === 'rota')) {
    const l = M.ROTAS.find((r) => r.servidor === 'L' && r.metodo === s.metodo && r.caminho === s.caminho);
    if (!l) continue;
    assert.ok(s.caminhosAlternativos.some((x) => x.id === l.id && x.relacao === 'duplicata-em-outro-hospedeiro'), `${s.id} sem duplicata→${l.id}`);
    assert.ok(l.caminhosAlternativos.some((x) => x.id === s.id && x.relacao === 'duplicata-em-outro-hospedeiro'), `${l.id} sem duplicata→${s.id}`);
  }
});

test('proxies: o salto 3001→5510 e as três famílias 5510→3001 estão ligados às rotas de destino', () => {
  const ctl = M.ROTAS.filter((r) => r.servidor === 'C');
  const salto = ctl.filter((r) => r.caminho === '/api/display-config' || r.caminho === '/api/display-config/preview');
  assert.equal(salto.length, 2);
  for (const r of salto) {
    assert.ok(r.dependencias.some((d) => /5510/.test(d)), `${r.id} deve declarar a dependência do salto`);
    assert.equal(r.credencial.elo, 'c→s');
  }
  const viaProxy = ctl.filter((r) => r.credencial.elo === 's→c' || r.dependencias.some((d) => /proxy do Servidor/.test(d)));
  for (const prefixo of ['/api/musicas', '/api/biblia', '/api/apresentacao/video', '/api/apresentacao/midia']) {
    assert.ok(viaProxy.some((r) => r.caminho.startsWith(prefixo)), `nenhuma rota do 3001 marcada como alcançável pelo proxy em ${prefixo}`);
  }
  // o que o proxy NUNCA alcança no 3001 (caminhos fora das famílias)
  for (const r of ctl) {
    const familia = ['/api/musicas', '/api/biblia', '/api/apresentacao/video', '/api/apresentacao/midia'].some((p) => r.caminho === p || r.caminho.startsWith(`${p}/`));
    if (!familia) assert.notEqual(r.credencial.elo, 's→c', `${r.id} não é alcançável pelo proxy`);
  }
});

test('auditoria original: todas as rotas listadas na auditoria estão no manifesto', () => {
  const chaves = new Set(M.ROTAS.map((r) => `${r.metodo} ${r.caminho}`));
  const ausentes = M.AUDITORIA_ORIGINAL.filter((x) => !chaves.has(x));
  assert.deepEqual(ausentes, []);
  assert.equal(M.AUDITORIA_ORIGINAL.length, new Set(M.AUDITORIA_ORIGINAL).size, 'sem repetidas na lista da auditoria');
});

test('rotas novas (fora da auditoria original) estão identificadas e conhecidas', () => {
  const original = new Set(M.AUDITORIA_ORIGINAL);
  const novas = [...new Set(M.ROTAS.filter((r) => !original.has(`${r.metodo} ${r.caminho}`)).map((r) => `${r.metodo} ${r.caminho}`))].sort();
  assert.deepEqual(novas, [...M.ROTAS_NOVAS_NA_C0, ...M.ROTAS_NOVAS_ENTREGA_1, ...M.ROTAS_NOVAS_ENTREGA_2].sort());
});

test('números do manifesto (por servidor e classe) não mudam sem revisão consciente', () => {
  const por = (f) => M.ROTAS.filter(f).length;
  assert.equal(M.ROTAS.length, M.CONTAGENS_ESPERADAS.total);
  for (const s of ['C', 'S', 'L']) assert.equal(por((r) => r.servidor === s), M.CONTAGENS_ESPERADAS.servidor[s], `servidor ${s}`);
  for (const c of M.VOCAB.classes) assert.equal(por((r) => r.classe === c), M.CONTAGENS_ESPERADAS.classe[c], `classe ${c}`);
});

/* ───────────────────────── documento e ausência de efeito ───────────────────────── */

test('documento docs/seguranca/manifesto-rotas.md está em dia com o manifesto', () => {
  const gerado = M.renderizarMarkdown();
  const atual = ler('docs/seguranca/manifesto-rotas.md').replace(/\r\n/g, '\n');
  assert.equal(atual, gerado, 'documento desatualizado: regenere com `node -e "require(\'./packages/projection-core/src/manifestoRotas\').gravarDocumento()"`');
});

test('o manifesto só é importado pelo módulo de política (C1); nenhum outro código de produção o lê', () => {
  const importadores = [];
  for (const f of ARQUIVOS_FONTE) {
    if (f.endsWith('manifestoRotas.js')) continue;
    if (/manifestoRotas/.test(ler(f))) importadores.push(f);
  }
  assert.deepEqual(importadores, ['packages/projection-core/src/politicaRotas.js']);
  const indice = ler('packages/projection-core/src/index.js');
  assert.ok(!/manifestoRotas/.test(indice), 'o manifesto não é exportado pelo núcleo nesta etapa');
});

test('o manifesto não carrega segredos nem lê o ambiente', () => {
  const src = ler('packages/projection-core/src/manifestoRotas.js');
  assert.ok(!/process\.env/.test(src));
  assert.ok(!/(secret|segredo)\s*[:=]\s*['"][^'"]{8,}/i.test(src));
});

/* ───────────────────────── correções aprovadas na C1 ───────────────────────── */

test('PUB-LEVE: definição corrigida (baixa sensibilidade para clientes sem credencial), sem atribuir ao Socket.IO o que ele não faz', () => {
  assert.match(M.LEGENDA_POLITICAS['PUB-LEVE'], /baixa sensibilidade/);
  assert.doesNotMatch(M.LEGENDA_POLITICAS['PUB-LEVE'], /Socket\.IO já entrega/);
  for (const r of M.ROTAS.filter((x) => x.caminho === '/api/monitores')) {
    assert.match(r.justificativaPublica, /compatibilidade com os telões/);
    assert.match(r.justificativaPublica, /Não decorre de transmissão equivalente pelo Socket\.IO/);
    assert.deepEqual(r.politicaPretendida, ['PUB-LEVE'], 'a política não muda');
  }
  // as outras duas PUB-LEVE continuam justificadas pelo socket, e isso é verdade para elas
  for (const caminho of ['/api/estado', '/api/display-config']) {
    for (const r of M.ROTAS.filter((x) => x.caminho === caminho && x.metodo === 'GET')) assert.match(r.justificativaPublica, /Socket\.IO já entrega/);
  }
});

test('cliente omitido: a ferramenta de acompanhamento da playlist consta em GET /api/playlists, com a política LER intacta', () => {
  const r = M.ROTAS.find((x) => x.servidor === 'C' && x.metodo === 'GET' && x.caminho === '/api/playlists');
  assert.ok(r.clientes.includes('ferramenta-acompanhamento-playlist'));
  assert.deepEqual(r.politicaPretendida, ['LER']);
  assert.match(r.compatibilidade, /Origin: null/);
  assert.match(r.compatibilidade, /E1\.2/);
  assert.match(r.compatibilidade, /Socket\.IO/);
  assert.ok(fs.existsSync(path.join(RAIZ, 'tools/acompanhamento-playlist/index.html')));
  assert.ok(M.INCOMPATIBILIDADES.some((i) => /acompanhamento/i.test(i.titulo)));
});
