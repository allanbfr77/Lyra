'use strict';

/**
 * MANIFESTO DE ROTAS HTTP DO LYRA (E1.3 Fase C — etapa C0).
 *
 * Fonte única que descreve, para cada rota dos três servidores, quem a atende, como a
 * autenticação a classifica HOJE, que proteção ela tem de fato e que política se pretende nas
 * próximas etapas. É DOCUMENTAÇÃO VERIFICÁVEL: nenhum código de produção a importa e, portanto,
 * ela não muda o comportamento de nada. `manifestoRotas.test.js` a amarra ao código-fonte (toda
 * rota declarada precisa de entrada; a classe atual é a de `classificarRota`; a guarda própria
 * é conferida no texto da declaração) e `docs/seguranca/manifesto-rotas.md` é gerado daqui.
 *
 * Servidores
 *   C  Controlador, porta 3001 (`controller/src/httpControllerServer.js` e `rotas/*`)
 *   S  Servidor separado, portas 5510 (API) e 5001 (OBS) (`server/src/httpServer.js`)
 *   L  motor local do Controlador, 5510 e 5001 (`controller/src/projecaoLocal.js`)
 *
 * Três credenciais diferentes, que este manifesto não mistura:
 *   - credencial de DISPOSITIVO: `X-Lyra-Device`/`X-Lyra-Secret`, conferida na allowlist;
 *   - credencial INTERNA do motor local: a do painel, injetada pelo processo principal (arquitetura W);
 *     só o Controlador (C e L) a conhece;
 *   - credencial INTERPROCESSOS (`X-Lyra-Via`, elo assinado): prevista para a C3 em diante, ainda
 *     NÃO existe. Aqui só aparece como necessidade (`credencial.elo`).
 *
 * Este arquivo não define comportamento: mudar uma política aqui não muda uma resposta HTTP.
 */

const fs = require('fs');
const path = require('path');

/* ───────────────────────── vocabulários fechados ───────────────────────── */

const VOCAB = Object.freeze({
  servidores: ['C', 'S', 'L'],
  tipos: ['rota', 'proxy', 'estatico', 'socket'],
  /** Classificação semântica pedida na C0. */
  classes: ['publica', 'leitura', 'leitura-sensivel', 'escrita', 'comando', 'administrativa'],
  /** Classe que `autenticacaoHttp.classificarRota` devolve hoje. */
  classesAtuais: ['publica', 'leitura', 'escrita', 'comando', 'loopback-estrito'],
  guardas: ['nenhuma', 'ip-loopback-middleware', 'ip-loopback-handler', 'segredo-proprio', 'proxy-somente-leitura', 'nao-se-aplica'],
  politicas: ['PUB', 'PUB-LEVE', 'LER', 'ESC', 'CMD', 'PL', 'LOC', 'ELO', 'ADM', 'PEDIDO'],
  credDispositivo: ['exigida', 'nao', 'nao-usa'],
  credInterna: ['exigida', 'aceita', 'nao'],
  elo: ['nao', 'c→s', 's→c', 'c↔s'],
  clientes: [
    'painel', 'historico', 'mobile', 'telao', 'obs', 'janela-controle-servidor', 'processo-principal',
    'outro-controlador', 'servidor-proxy', 'servico-externo', 'navegador-comum', 'nenhum-distribuido',
    'ferramenta-acompanhamento-playlist',
  ],
  testes: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'],
  relacoes: ['alias', 'duplicata-em-outro-hospedeiro', 'proxy-para', 'alcancavel-por-proxy', 'caminho-alternativo'],
});

const LEGENDA_POLITICAS = Object.freeze({
  PUB: 'pública, sem credencial; precisa continuar pública',
  'PUB-LEVE': 'pública: dado de baixa sensibilidade que precisa ser acessível a clientes sem credencial (telões, janela de controle, visualizadores)',
  LER: 'credencial de dispositivo inscrito, leitura',
  ESC: 'credencial de dispositivo inscrito, escrita',
  CMD: 'ESC mais paridade com o bastão do controlador primário',
  PL: '«painel local»: só a credencial interna do painel; dispositivo remoto não entra',
  LOC: 'loopback estrito',
  ELO: 'assinatura interprocessos (X-Lyra-Via)',
  ADM: 'administrativa: local e com elo',
  PEDIDO: 'aberta à LAN, limitada, com decisão humana',
});

const LEGENDA_TESTES = Object.freeze({
  T1: 'matriz em «impor» (Express e allowlist reais; handler não executa quando recusa)',
  T2: 'painel e Histórico registrados passam; janela não registrada não',
  T3: 'mobile simulado, com e sem X-Lyra-*',
  T4: 'telão e OBS sem credencial',
  T5: 'assinatura do elo (válida, adulterada, repetida, relógio, direção, rota trocada)',
  T6: 'proxy somente leitura (GET/HEAD)',
  T7: 'limites de corpo e taxa',
  T8: 'manifesto: toda rota registrada tem política (esta etapa)',
  T9: 'paridade dos comandos HTTP com o bastão do Socket.IO',
  T10: 'verificação delegada de dispositivos no 3001',
});

/* ───────────────────────── construção das entradas ───────────────────────── */

const ROTAS = [];
const ALIASES_PENDENTES = [];

const ARQ = {
  C: 'controller/src/httpControllerServer.js',
  S: 'server/src/httpServer.js',
  L: 'controller/src/projecaoLocal.js',
};

/** Credenciais padrão de acordo com a política e o servidor. */
function credenciaisPadrao(servidor, politica, elo) {
  const p = politica;
  const interna = servidor === 'S' ? 'nao' : p.includes('PL') ? 'exigida' : p.some((x) => ['LER', 'ESC', 'CMD'].includes(x)) ? 'aceita' : 'nao';
  let dispositivo = 'nao-usa';
  if (p.some((x) => ['LER', 'ESC', 'CMD'].includes(x))) dispositivo = 'exigida';
  else if (p.includes('PL') || p.includes('LOC') || p.includes('ADM') || p.includes('ELO')) dispositivo = 'nao';
  return { dispositivo, interna, elo: elo || 'nao' };
}

/**
 * @param {object} e entrada parcial
 * @returns {object} a entrada completa (também registrada em ROTAS)
 */
function add(e) {
  const politicaPretendida = e.politica;
  const entrada = {
    id: '',
    servidor: e.servidor,
    porta: e.porta || (e.servidor === 'C' ? 3001 : 5510),
    metodo: e.metodo,
    caminho: e.caminho,
    tipo: e.tipo || 'rota',
    handler: { arquivo: e.arquivo || ARQ[e.servidor], linha: e.linha },
    caminhosAlternativos: [],
    classe: e.classe,
    destrutiva: !!e.destrutiva,
    classeAtual: e.atual,
    guardaPropria: e.guarda || 'nenhuma',
    politicaPretendida,
    credencial: e.credencial || credenciaisPadrao(e.servidor, politicaPretendida, e.elo),
    clientes: e.clientes,
    dependencias: e.dep || [],
    compatibilidade: e.compat || 'Sem mudança prevista para clientes atuais.',
    riscos: e.riscos || 'Baixo.',
    testes: e.testes,
  };
  if (e.justificativaPublica) entrada.justificativaPublica = e.justificativaPublica;
  if (e.novaGuardaLoc) entrada.novaGuardaLoc = true;
  ROTAS.push(entrada);
  for (const a of e.alias || []) ALIASES_PENDENTES.push({ de: entrada, para: a.para, relacao: a.relacao || 'alias' });
  return entrada;
}

const chave = (r) => `${r.servidor} ${r.metodo} ${r.caminho}`;

/* ═════════════ CONTROLADOR (3001) ═════════════ */

const ctl = (arquivo) => (e) => add({ servidor: 'C', arquivo: `controller/src/rotas/${arquivo}`, ...e });

/* — Apresentação — */
{
  const f = ctl('apresentacao.js');
  f({ metodo: 'GET', caminho: '/api/apresentacao/state', linha: 151, classe: 'leitura', atual: 'leitura', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    compat: 'Só o painel local (ele usa sempre 127.0.0.1:3001).', riscos: 'Painel aberto em navegador comum perde acesso.' });
  f({ metodo: 'PUT', caminho: '/api/apresentacao/state', linha: 160, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2', 'T7'],
    riscos: 'Corpo livre sem limite próprio (E1.7).' });
  f({ metodo: 'POST', caminho: '/api/apresentacao/midia/importar', linha: 184, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-middleware',
    politica: ['PL', 'LOC'], clientes: ['painel'], testes: ['T1', 'T2'],
    compat: 'Copia um arquivo do disco informado pelo painel.', riscos: 'Hoje qualquer processo local a chama (só há a guarda por endereço).' });
  f({ metodo: 'GET', caminho: '/api/apresentacao/midia/:id', linha: 230, classe: 'publica', atual: 'publica', politica: ['PUB'],
    clientes: ['telao', 'painel', 'servidor-proxy', 'mobile'], elo: 's→c', testes: ['T4', 'T6'],
    justificativaPublica: '<video>/<audio> não enviam cabeçalhos; telões (file://) e prévia do mobile precisam ler a mídia.',
    dep: ['alcançável pelo proxy do Servidor (somente GET/HEAD)'], compat: 'Mantida pública; URL assinada é opcional na C8.', riscos: 'Quem souber o id lê o arquivo.',
    alias: [{ para: 'C GET /api/apresentacao/video/:id', relacao: 'caminho-alternativo' }] });
  f({ metodo: 'PUT', caminho: '/api/apresentacao/video/:id', linha: 240, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2', 'T7'],
    riscos: 'Corpo de até 800 MB (E1.7).' });
  f({ metodo: 'GET', caminho: '/api/apresentacao/video/:id', linha: 275, classe: 'publica', atual: 'publica', politica: ['PUB'],
    clientes: ['telao', 'painel', 'servidor-proxy', 'mobile'], elo: 's→c', testes: ['T4', 'T6'],
    justificativaPublica: 'Mesmo motivo da mídia: reprodutores não enviam cabeçalhos.',
    dep: ['alcançável pelo proxy do Servidor (somente GET/HEAD)'], riscos: 'Quem souber o id lê o arquivo.',
    alias: [{ para: 'C GET /api/apresentacao/midia/:id', relacao: 'caminho-alternativo' }] });
}

/* — Bíblia — */
{
  const f = ctl('biblia.js');
  const base = { classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel', 'mobile', 'servidor-proxy'], elo: 's→c', testes: ['T1', 'T3', 'T6'],
    dep: ['alcançável pelo proxy do Servidor (somente GET/HEAD)'], compat: 'Mobile e painel já enviam credencial.' };
  f({ ...base, metodo: 'GET', caminho: '/api/biblia/traducoes', linha: 70 });
  f({ ...base, metodo: 'GET', caminho: '/api/biblia/:traducao/:livro/caps', linha: 82 });
  f({ ...base, metodo: 'GET', caminho: '/api/biblia/:traducao/:livro/:cap', linha: 99 });
  f({ ...base, metodo: 'GET', caminho: '/api/biblia/buscar', linha: 126, riscos: 'Busca consome CPU; taxa fica para a E1.7.' });
  f({ ...base, metodo: 'GET', caminho: '/api/biblia/livros', linha: 158 });
}

/* — Histórico — */
{
  const f = ctl('historico.js');
  f({ metodo: 'POST', caminho: '/api/historico', linha: 60, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel', 'historico'], testes: ['T1', 'T2'] });
  f({ metodo: 'GET', caminho: '/api/historico', linha: 87, classe: 'leitura-sensivel', atual: 'leitura', politica: ['PL'], clientes: ['historico', 'painel'], testes: ['T1', 'T2'],
    riscos: 'Revela o que foi projetado e quando.' });
  f({ metodo: 'GET', caminho: '/api/historico/repertorio', linha: 97, classe: 'leitura-sensivel', atual: 'leitura', politica: ['PL'], clientes: ['historico'], testes: ['T1', 'T2'] });
  f({ metodo: 'DELETE', caminho: '/api/historico/:id', linha: 108, classe: 'escrita', destrutiva: true, atual: 'escrita', politica: ['PL'], clientes: ['historico'], testes: ['T1', 'T2'],
    riscos: 'Apaga registro.' });
  f({ metodo: 'POST', caminho: '/api/historico/limpar', linha: 123, classe: 'escrita', destrutiva: true, atual: 'escrita', politica: ['PL'], clientes: ['historico'], testes: ['T1', 'T2'],
    riscos: 'Apaga todo o histórico.' });
}

/* — Letras — */
{
  const f = ctl('letras.js');
  f({ metodo: 'GET', caminho: '/api/letras/buscar-local', linha: 30, classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'GET', caminho: '/api/letras/preview-local', linha: 74, classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/letras/importar-do-catalogo', linha: 120, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'GET', caminho: '/api/letras/buscar', linha: 165, classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel', 'mobile'], testes: ['T1', 'T3', 'T7'],
    riscos: 'Faz requisição à Internet (destinos limitados na E1.1); taxa na E1.7.' });
  f({ metodo: 'POST', caminho: '/api/letras/preview', linha: 225, classe: 'leitura', atual: 'escrita', politica: ['LER'], clientes: ['painel', 'mobile'], testes: ['T1', 'T3', 'T7'],
    compat: 'POST sem efeito no banco; a autenticação o trata como escrita pelo método, mas exige a mesma credencial de dispositivo.', riscos: 'Busca externa; taxa na E1.7.' });
  f({ metodo: 'POST', caminho: '/api/letras/importar', linha: 251, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
}

/* — Ministrantes e memória de tons — */
{
  const f = ctl('ministrantes.js');
  f({ metodo: 'GET', caminho: '/api/ministrantes', linha: 38, classe: 'leitura', atual: 'leitura', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/ministrantes', linha: 46, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'PUT', caminho: '/api/ministrantes/:id', linha: 57, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'DELETE', caminho: '/api/ministrantes/:id', linha: 68, classe: 'escrita', destrutiva: true, atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'GET', caminho: '/api/tom-memoria', linha: 78, classe: 'leitura', atual: 'leitura', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'PUT', caminho: '/api/tom-memoria', linha: 92, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/tom-memoria/import', linha: 109, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/tom-memoria/sync-invb', linha: 132, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    dep: ['chama a nuvem da INVB (serviço externo)'], riscos: 'Dispara requisições externas.' });
  f({ metodo: 'POST', caminho: '/api/tom-memoria/webhook-invb', linha: 203, classe: 'publica', atual: 'publica', guarda: 'segredo-proprio', politica: ['PUB'],
    clientes: ['servico-externo'], testes: ['T1'],
    justificativaPublica: 'Quem chama é o servidor da INVB, que não tem credencial de dispositivo; a rota tem segredo próprio (falha fechada, comparação em tempo constante — E1.1).',
    compat: 'Já protegida por segredo próprio; fica pública para a autenticação de dispositivo.', riscos: 'Sem LYRA_INVB_WEBHOOK_SECRET configurado a rota responde 503.',
    dep: ['depende do segredo de ambiente LYRA_INVB_WEBHOOK_SECRET'] });
}

/* — Músicas — */
{
  const f = ctl('musicas.js');
  const proxyLer = { classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel', 'mobile', 'servidor-proxy'], elo: 's→c', testes: ['T1', 'T3', 'T6'],
    dep: ['alcançável pelo proxy do Servidor (somente GET/HEAD)'], compat: 'Mobile já envia credencial.' };
  f({ ...proxyLer, metodo: 'GET', caminho: '/api/musicas', linha: 47 });
  f({ ...proxyLer, metodo: 'GET', caminho: '/api/musicas/buscar', linha: 70 });
  f({ ...proxyLer, metodo: 'GET', caminho: '/api/musicas/:id', linha: 94 });
  f({ metodo: 'POST', caminho: '/api/musicas', linha: 113, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'], compat: 'O mobile não cria músicas.' });
  f({ metodo: 'POST', caminho: '/api/musicas/checar-duplicidade', linha: 150, classe: 'leitura', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    compat: 'POST só de consulta; a autenticação o trata como escrita pelo método.' });
  f({ metodo: 'POST', caminho: '/api/musicas/importar', linha: 185, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2', 'T7'], riscos: 'Importação em lote; corpo grande (E1.7).' });
  f({ metodo: 'PUT', caminho: '/api/musicas/:id', linha: 243, classe: 'escrita', atual: 'escrita', politica: ['ESC'], clientes: ['painel', 'mobile'], testes: ['T1', 'T3'],
    compat: 'O mobile edita músicas aqui (servidor-edit.jsx). Precisa inscrição do dispositivo (C7).', riscos: 'Mobile antigo sem credencial deixa de gravar quando a escrita for imposta.',
    alias: [{ para: 'C POST /api/musicas/:id/salvar' }] });
  f({ metodo: 'POST', caminho: '/api/musicas/:id/salvar', linha: 244, classe: 'escrita', atual: 'escrita', politica: ['ESC'], clientes: ['painel', 'mobile'], testes: ['T1', 'T3'],
    compat: 'Variante POST do PUT; o mobile usa as duas.', riscos: 'Idem.', alias: [{ para: 'C PUT /api/musicas/:id' }] });
  f({ ...proxyLer, metodo: 'GET', caminho: '/api/musicas/:id/versoes', linha: 246 });
  f({ metodo: 'POST', caminho: '/api/musicas/:id/copia-padrao', linha: 268, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/musicas/:id/criar-versao', linha: 292, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'PATCH', caminho: '/api/musicas/:id/rotulo', linha: 339, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    alias: [{ para: 'C POST /api/musicas/:id/rotulo' }] });
  f({ metodo: 'POST', caminho: '/api/musicas/:id/rotulo', linha: 340, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    alias: [{ para: 'C PATCH /api/musicas/:id/rotulo' }] });
  f({ metodo: 'DELETE', caminho: '/api/musicas/:id', linha: 352, classe: 'escrita', destrutiva: true, atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    riscos: 'Apaga música.', alias: [{ para: 'C POST /api/musicas/:id/excluir' }] });
  f({ metodo: 'POST', caminho: '/api/musicas/:id/excluir', linha: 353, classe: 'escrita', destrutiva: true, atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    compat: 'Variante POST do DELETE (clientes que não enviam DELETE).', riscos: 'Apaga música.', alias: [{ para: 'C DELETE /api/musicas/:id' }] });
  f({ metodo: 'POST', caminho: '/api/musicas/sincronizar', linha: 355, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
}

/* — Playlists — */
{
  const f = ctl('playlists.js');
  f({ metodo: 'GET', caminho: '/api/playlists', linha: 22, classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['painel', 'mobile', 'ferramenta-acompanhamento-playlist'], testes: ['T1', 'T3'],
    compat: 'tools/acompanhamento-playlist/index.html (página aberta por duplo clique, em file://) usa esta rota como fallback, sem credencial. Com Origin: null a proteção E1.2 já recusa o HTTP e a ferramenta funciona pelo Socket.IO. Política LER e ferramenta inalteradas.' });
  f({ metodo: 'PUT', caminho: '/api/playlists', linha: 30, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'], riscos: 'Substitui todas as playlists.' });
  f({ metodo: 'POST', caminho: '/api/playlists/adicionar-musica', linha: 41, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
}

/* — Sincronização do banco — */
{
  const f = ctl('syncBanco.js');
  f({ metodo: 'PUT', caminho: '/api/sync/banco/meta', linha: 217, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'GET', caminho: '/api/sync/banco/local', linha: 243, classe: 'leitura-sensivel', atual: 'leitura', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    riscos: 'Despeja o banco inteiro.' });
  f({ metodo: 'POST', caminho: '/api/sync/banco/local', linha: 251, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2', 'T7'],
    riscos: 'Grava o banco inteiro; corpo grande (E1.7).' });
  f({ metodo: 'POST', caminho: '/api/sync/banco/pedido', linha: 279, classe: 'escrita', atual: 'escrita', politica: ['PEDIDO'], clientes: ['outro-controlador'], testes: ['T1', 'T7'],
    justificativaPublica: 'Aberta à LAN de propósito: o painel de OUTRO PC envia o banco e o operador local decide aceitar ou recusar; esse dispositivo não está inscrito aqui.',
    dep: ['chamada por painel de outro Controlador em http://<ip>:3001'], compat: 'Exigir dispositivo inscrito quebraria a sincronização entre PCs.',
    riscos: 'Spam e corpo grande; origem informada pelo corpo (rótulo) precisa vir do IP real.' });
  f({ metodo: 'GET', caminho: '/api/sync/banco/pedido', linha: 301, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-middleware', politica: ['PL', 'LOC'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/sync/banco/pedido/aceitar', linha: 307, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-middleware', politica: ['PL', 'LOC'], clientes: ['painel'], testes: ['T1', 'T2'],
    riscos: 'Aplica o banco recebido.' });
  f({ metodo: 'POST', caminho: '/api/sync/banco/pedido/recusar', linha: 323, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-middleware', politica: ['PL', 'LOC'], clientes: ['painel'], testes: ['T1', 'T2'] });
}

/* — Sincronização de playlists da INVB, documentos, voz, salto de configuração, estáticos — */
{
  const f = ctl('syncInvbPlaylist.js');
  f({ metodo: 'POST', caminho: '/api/sync-invb-playlist/aplicar-versoes', linha: 584, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'] });
  f({ metodo: 'POST', caminho: '/api/sync-invb-playlist', linha: 601, classe: 'escrita', atual: 'escrita', politica: ['PL'], clientes: ['painel'], testes: ['T1', 'T2'],
    dep: ['chama a nuvem da INVB (serviço externo)'], riscos: 'Busca externa e grava no banco.' });
  ctl('docs.js')({ metodo: 'POST', caminho: '/api/docs/converter-pdf', linha: 60, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-middleware', politica: ['PL', 'LOC'],
    clientes: ['painel'], testes: ['T1', 'T2'], compat: 'Converte arquivo local (Office para PDF).', riscos: 'Executa conversão no PC.' });
  ctl('vosk.js')({ metodo: 'GET', caminho: '/vosk-model/:arquivo', linha: 16, classe: 'publica', atual: 'publica', politica: ['PUB'], clientes: ['painel'], testes: ['T4'],
    justificativaPublica: 'Modelo offline de reconhecimento de voz: arquivo público, sem dados do usuário.', riscos: 'Arquivo grande; consome banda de quem pedir.' });

  const salto = { classe: 'escrita', atual: 'escrita', politica: ['PL', 'ELO'], elo: 'c→s', clientes: ['painel'], testes: ['T1', 'T2', 'T5'],
    dep: ['salta para o 5510 (PUT do mesmo caminho) — no Servidor separado hoje vai sem credencial'],
    compat: 'No motor local o salto leva a credencial interna (propriedade comprovada). No Servidor separado precisa do elo (C4).',
    riscos: 'Em «impor», sem o elo, o Servidor separado recusaria o salto.' };
  add({ ...salto, servidor: 'C', metodo: 'PUT', caminho: '/api/display-config', linha: 312, alias: [{ para: 'S PUT /api/display-config', relacao: 'proxy-para' }, { para: 'L PUT /api/display-config', relacao: 'proxy-para' }] });
  add({ ...salto, servidor: 'C', metodo: 'PUT', caminho: '/api/display-config/preview', linha: 313, alias: [{ para: 'S PUT /api/display-config/preview', relacao: 'proxy-para' }, { para: 'L PUT /api/display-config/preview', relacao: 'proxy-para' }] });

  add({ servidor: 'C', tipo: 'estatico', metodo: 'GET', caminho: '/*', linha: 122, classe: 'publica', atual: 'publica', guarda: 'nao-se-aplica', politica: ['PUB'],
    clientes: ['painel', 'historico', 'navegador-comum'], testes: ['T4'],
    justificativaPublica: 'Páginas e arquivos estáticos do painel (express.static de controller/public); não contêm segredos (a credencial interna não está nos arquivos).',
    compat: 'Montada ANTES das rotas: um arquivo em controller/public com nome igual ao de uma rota teria precedência.', riscos: 'Qualquer arquivo colocado em controller/public passa a ser público.' });
}

/* ═════════════ SERVIDOR SEPARADO (5510) e MOTOR LOCAL (5510) ═════════════ */

/** Rotas que existem nos dois hospedeiros da 5510 (Servidor e motor local), com a mesma semântica. */
function nos2(e, linhas, extraL) {
  add({ servidor: 'S', linha: linhas.S, ...e });
  add({ servidor: 'L', linha: linhas.L, ...e, ...(extraL || {}) });
}

nos2({ metodo: 'GET', caminho: '/api/identity', classe: 'publica', atual: 'publica', politica: ['PUB'], clientes: ['processo-principal', 'painel', 'mobile', 'servidor-proxy'], testes: ['T1'],
  justificativaPublica: 'Usada antes do handshake para distinguir Servidor de Controlador em modo local (`role`); sem dados sensíveis.',
  compat: 'Passará a anunciar a capacidade do elo (`elo: 1`) na C4.', riscos: 'Nenhum.' }, { S: 325, L: 332 });
nos2({ metodo: 'GET', caminho: '/api/estado', classe: 'leitura', atual: 'leitura', politica: ['PUB-LEVE'], clientes: ['mobile', 'painel'], testes: ['T1', 'T3'],
  justificativaPublica: 'O Socket.IO já entrega o mesmo estado a qualquer visualizador sem credencial; proteger só o GET seria incoerente.',
  compat: 'Hoje classificada como leitura (exigiria credencial em «impor»).', riscos: 'Mobile/painel que a leem sem credencial quebrariam se continuasse leitura.' }, { S: 332, L: 355 });
nos2({ metodo: 'GET', caminho: '/api/monitores', classe: 'leitura', atual: 'leitura', politica: ['PUB-LEVE'], clientes: ['telao', 'janela-controle-servidor', 'mobile', 'painel'], testes: ['T1', 'T3', 'T4'],
  justificativaPublica: 'Exposição pública por compatibilidade com os telões (file://) e a janela de controle do Servidor, que não têm credencial. Não decorre de transmissão equivalente pelo Socket.IO (o socket não envia a lista de monitores a visualizadores). Dado de hardware de baixa sensibilidade: nome, resolução e posição dos monitores.',
  compat: 'Hoje leitura: em «impor» os telões e a janela de controle quebrariam.', riscos: 'Alto se for imposta sem reclassificar.',
  dep: ['telões chamam http://localhost:5510 (nome que pode resolver para ::1)'] }, { S: 530, L: 336 });
nos2({ metodo: 'GET', caminho: '/api/display-routing', classe: 'leitura', atual: 'leitura', politica: ['LER'], clientes: ['mobile', 'painel'], testes: ['T1', 'T3'],
  compat: 'Mobile e painel enviam credencial.' }, { S: 534, L: 338 });
nos2({ metodo: 'PUT', caminho: '/api/display-routing', classe: 'escrita', atual: 'escrita', politica: ['ESC'], clientes: ['mobile', 'painel'], testes: ['T1', 'T3', 'T9'],
  compat: 'Abre e move janelas de projeção. O mobile usa.', riscos: 'Mobile sem inscrição perde a troca de saída quando imposta.', dep: ['pode abrir janelas de projeção (efeito físico)'] }, { S: 538, L: 342 });
nos2({ metodo: 'GET', caminho: '/api/display-config', classe: 'leitura', atual: 'leitura', politica: ['PUB-LEVE'], clientes: ['telao', 'mobile', 'painel'], testes: ['T1', 'T3', 'T4'],
  justificativaPublica: 'O Socket.IO já entrega `display_config` a qualquer visualizador; o telão a lê no arranque sem credencial.',
  compat: 'Hoje leitura: o GET do telão seria recusado em «impor» (a configuração ainda chegaria pelo socket).', riscos: 'Médio.' }, { S: 548, L: 353 });
nos2({ metodo: 'PUT', caminho: '/api/display-config', classe: 'escrita', atual: 'escrita', politica: ['ESC', 'ELO'], elo: 'c→s', clientes: ['painel', 'mobile'], testes: ['T1', 'T3', 'T5', 'T9'],
  dep: ['recebe o salto do Controlador (3001) quando o painel muda a configuração'], compat: 'Direto (renderer) usa credencial de dispositivo; via salto usa o elo.',
  riscos: 'Sem o elo, o salto 3001→5510 chega sem credencial.' }, { S: 561, L: 422 }, { politica: ['ESC'], elo: 'nao', dep: ['no motor local o salto do 3001 é do mesmo processo (credencial interna; sem elo)'] });
nos2({ metodo: 'PUT', caminho: '/api/display-config/preview', classe: 'escrita', atual: 'escrita', politica: ['ESC', 'ELO'], elo: 'c→s', clientes: ['painel', 'mobile'], testes: ['T1', 'T3', 'T5', 'T9'],
  dep: ['recebe o salto do Controlador (3001)'], compat: 'O mobile usa esta rota direto na 5510.', riscos: 'Idem.' }, { S: 583, L: 423 }, { politica: ['ESC'], elo: 'nao', dep: ['no motor local o salto do 3001 é do mesmo processo (credencial interna; sem elo)'] });

/* Comandos: 10 no Servidor e 10 no motor local. No Servidor sem guarda; no motor local só loopback. */
{
  const comandos = [
    ['exibir_apresentacao', 447, null], ['exibir_contagem', 468, 453], ['encerrar_contagem', 482, 454], ['encerrar_apresentacao_publico', 492, null],
    ['audio_play', 520, null], ['audio_pause', 521, null], ['audio_stop', 522, null], ['audio_volume', 523, null], ['audio_seek', 524, null], ['apresentacao_video_state', 525, null],
  ];
  for (const [nome, linhaS, linhaLUnica] of comandos) {
    const comum = {
      metodo: 'POST', caminho: `/api/comando/${nome}`, classe: 'comando', atual: 'comando', politica: ['CMD'], clientes: ['painel'], testes: ['T1', 'T9'],
      compat: 'O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback.',
      riscos: nome === 'apresentacao_video_state' ? 'Chamada em alta frequência durante vídeo: custo de verificação precisa ser baixo.' : 'Regras diferentes entre Servidor e motor local (C2).',
    };
    add({ servidor: 'S', linha: linhaS, ...comum });
    add({ servidor: 'L', linha: linhaLUnica || 465, ...comum, guarda: 'ip-loopback-middleware' });
  }
}

/* Administração da allowlist: existe nos dois hospedeiros, com guarda própria diferente. */
{
  const itens = [['GET', '', 410, 371, 'Lista dispositivos autorizados.'], ['POST', '/aprovar', 417, 374, 'Aprova um dispositivo: qualquer processo local contorna a tranca do TOFU.'],
    ['POST', '/revogar', 423, 377, 'Revoga um dispositivo.'], ['POST', '/travar', 429, 380, 'Trava a allowlist.'], ['POST', '/destravar', 435, 384, 'Destrava a allowlist.']];
  for (const [metodo, sufixo, ls, ll, nota] of itens) {
    const comum = { metodo, caminho: `/api/controladores${sufixo}`, classe: 'administrativa', atual: 'loopback-estrito', politica: ['ADM', 'LOC'], elo: 'c→s', clientes: ['nenhum-distribuido'], testes: ['T1', 'T5'],
      compat: 'Nenhum cliente distribuído chama estas rotas (ferramentas administrativas).', riscos: nota, dep: ['se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo'] };
    add({ servidor: 'S', linha: ls, guarda: 'ip-loopback-handler', ...comum });
    add({ servidor: 'L', linha: ll, guarda: 'ip-loopback-middleware', ...comum, politica: ['LOC'], elo: 'nao', dep: [] });
  }
}

/* Somente do Servidor separado. */
{
  const s = (e) => add({ servidor: 'S', ...e });
  s({ metodo: 'GET', caminho: '/api/sync/banco', linha: 336, classe: 'leitura-sensivel', atual: 'leitura', politica: ['LER'], clientes: ['painel'], testes: ['T1', 'T3'],
    compat: 'Painel de outro PC lê o banco compartilhado com a identidade inscrita pelo socket.', riscos: 'Banco compartilhado inteiro.', dep: ['painel chama http://<ip-do-servidor>:5510'] });
  s({ metodo: 'POST', caminho: '/api/sync/banco', linha: 345, classe: 'escrita', atual: 'escrita', politica: ['ESC'], clientes: ['painel'], testes: ['T1', 'T7'], riscos: 'Grava o banco compartilhado; corpo grande (E1.7).' });
  s({ metodo: 'POST', caminho: '/api/internal/restart', linha: 358, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-handler', politica: ['ELO', 'LOC'], elo: 'c→s',
    clientes: ['processo-principal'], testes: ['T1', 'T5'], dep: ['chamada pelo processo principal do Controlador (menu «Reiniciar servidor»)'],
    compat: 'O chamador legítimo não tem credencial hoje.', riscos: 'Qualquer processo local reinicia o Servidor.' });
  s({ metodo: 'POST', caminho: '/api/internal/quit-for-update', linha: 381, classe: 'administrativa', atual: 'loopback-estrito', guarda: 'ip-loopback-handler', politica: ['ELO', 'LOC'], elo: 'c→s',
    clientes: ['processo-principal'], testes: ['T1', 'T5'], dep: ['chamada pelo Controlador antes de instalar a atualização do companion'],
    compat: 'Fluxo de atualização do companion depende desta chamada.', riscos: 'Qualquer processo local encerra o Servidor.' });
  const devtools = { classe: 'administrativa', atual: 'escrita', guarda: 'nenhuma', politica: ['ELO', 'LOC'], elo: 'c→s', novaGuardaLoc: true, clientes: ['processo-principal'], testes: ['T1', 'T5'],
    dep: ['chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local'],
    compat: 'Hoje é «escrita» comum: qualquer dispositivo inscrito pode chamá-la; o chamador legítimo não tem credencial.', riscos: 'Abre DevTools nos telões.' };
  s({ ...devtools, metodo: 'POST', caminho: '/api/open-display-devtools', linha: 606 });
  s({ ...devtools, metodo: 'POST', caminho: '/api/open-public-devtools', linha: 616 });
  s({ ...devtools, metodo: 'POST', caminho: '/api/open-ministrante-devtools', linha: 626 });
}

/* Proxies do Servidor para o 3001 (montagens por use(), não por rota). */
{
  const proxy = (arquivo, caminho, familia) => add({
    servidor: 'S', tipo: 'proxy', arquivo: `server/src/lib/${arquivo}`, linha: 1, metodo: 'GET,HEAD', caminho, classe: familia === 'apresentacao' ? 'publica' : 'leitura',
    atual: familia === 'apresentacao' ? 'publica' : 'leitura', guarda: 'proxy-somente-leitura',
    politica: familia === 'apresentacao' ? ['PUB', 'ELO'] : ['LER', 'ELO'], elo: 's→c', clientes: ['mobile', 'servidor-proxy', ...(familia === 'apresentacao' ? ['telao', 'obs'] : ['painel'])], testes: ['T1', 'T4', 'T5', 'T6'],
    ...(familia === 'apresentacao' ? { justificativaPublica: 'Mídia pública: reprodutores não enviam cabeçalhos.' } : {}),
    dep: ['repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405)', 'repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1'],
    compat: 'Fase B: cabeçalhos em lista fechada, caminho validado, upstream encerrado se o cliente desiste.',
    riscos: 'O 3001 não consegue validar a credencial do cliente num Servidor separado (precisa do elo e da verificação delegada).',
  });
  proxy('proxyMusicaAoControlador.js', '/api/musicas/*', 'musicas');
  proxy('proxyBibliaAoControlador.js', '/api/biblia/*', 'biblia');
  proxy('proxyApresentacaoVideoAoControlador.js', '/api/apresentacao/{video,midia}/:id', 'apresentacao');
}

/* OBS (porta 5001): sem middleware de autenticação em nenhum dos dois hospedeiros. */
for (const [srv, linhas] of [['S', [982, 986, 990]], ['L', [573, 574, 575]]]) {
  ['/obs', '/obs/biblia', '/obs/slides'].forEach((caminho, i) => add({
    servidor: srv, porta: 5001, metodo: 'GET', caminho, linha: linhas[i], classe: 'publica', atual: 'publica', guarda: 'nenhuma', politica: ['PUB'], clientes: ['obs'], testes: ['T4'],
    justificativaPublica: 'Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial.',
    compat: 'A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela.', riscos: 'Nenhum dado sensível; o Socket.IO delas entra como visualizador.',
  }));
}

/* Socket.IO (fora do escopo HTTP desta fase; registrado porque `classificarRota` o trata como público). */
for (const srv of ['S', 'L']) {
  add({ servidor: srv, tipo: 'socket', arquivo: srv === 'S' ? 'server/src/httpServer.js' : 'controller/src/projecaoLocal.js', linha: 1, metodo: 'GET,POST', caminho: '/socket.io/*',
    classe: 'publica', atual: 'publica', guarda: 'nao-se-aplica', politica: ['PUB'], clientes: ['painel', 'mobile', 'telao', 'obs'], testes: ['T4'],
    justificativaPublica: 'Transporte do Socket.IO: a autenticação é o handshake próprio (TOFU, etapa E1.4); visualizadores sem credencial conectam.',
    compat: 'Fora da Fase C: o fluxo TOFU do Socket.IO não muda.', riscos: 'TOFU e crescimento da allowlist tratados na E1.4.' });
}

/* ───────────────────────── ligações entre entradas ───────────────────────── */

const contadorPorServidor = { C: 0, S: 0, L: 0 };
ROTAS.forEach((r) => { contadorPorServidor[r.servidor] += 1; r.id = `${r.servidor}-${String(contadorPorServidor[r.servidor]).padStart(3, '0')}`; });
const porChave = new Map(ROTAS.map((r) => [chave(r), r]));

function ligar(de, para, relacao) {
  if (!para) throw new Error(`alvo inexistente para ${chave(de)}`);
  if (!de.caminhosAlternativos.some((x) => x.id === para.id && x.relacao === relacao)) {
    de.caminhosAlternativos.push({ id: para.id, relacao });
  }
}
for (const a of ALIASES_PENDENTES) ligar(a.de, porChave.get(a.para), a.relacao);

// Mesma rota nos dois hospedeiros da 5510
for (const s of ROTAS.filter((r) => r.servidor === 'S' && r.tipo === 'rota')) {
  const l = ROTAS.find((r) => r.servidor === 'L' && r.tipo === 'rota' && r.metodo === s.metodo && r.caminho === s.caminho);
  if (!l) continue;
  ligar(s, l, 'duplicata-em-outro-hospedeiro');
  ligar(l, s, 'duplicata-em-outro-hospedeiro');
}
// Proxies do Servidor → rotas do 3001 que eles alcançam
for (const p of ROTAS.filter((r) => r.tipo === 'proxy')) {
  const prefixos = p.caminho.includes('{video,midia}') ? ['/api/apresentacao/video/', '/api/apresentacao/midia/'] : [p.caminho.replace('*', '')];
  for (const c of ROTAS.filter((r) => r.servidor === 'C' && r.tipo === 'rota' && r.metodo === 'GET')) {
    if (prefixos.some((pre) => c.caminho.startsWith(pre) || `${c.caminho}/` === pre)) {
      ligar(p, c, 'alcancavel-por-proxy');
    }
  }
}

/* ───────────────────────── dados de apoio ───────────────────────── */

/** Arquivos-fonte que declaram rotas (a varredura do teste falha se aparecer outro). */
const ARQUIVOS_COM_ROTAS = Object.freeze([
  'server/src/httpServer.js',
  'controller/src/httpControllerServer.js',
  'controller/src/projecaoLocal.js',
  'controller/src/rotas/apresentacao.js',
  'controller/src/rotas/biblia.js',
  'controller/src/rotas/docs.js',
  'controller/src/rotas/historico.js',
  'controller/src/rotas/letras.js',
  'controller/src/rotas/ministrantes.js',
  'controller/src/rotas/musicas.js',
  'controller/src/rotas/playlists.js',
  'controller/src/rotas/syncBanco.js',
  'controller/src/rotas/syncInvbPlaylist.js',
  'controller/src/rotas/vosk.js',
]);

/** Pares «MÉTODO caminho» da auditoria original (98 entradas, agrupamentos expandidos). */
const AUDITORIA_ORIGINAL = Object.freeze([
  'GET /api/apresentacao/state', 'PUT /api/apresentacao/state', 'POST /api/apresentacao/midia/importar', 'GET /api/apresentacao/midia/:id', 'PUT /api/apresentacao/video/:id', 'GET /api/apresentacao/video/:id',
  'GET /api/biblia/traducoes', 'GET /api/biblia/livros', 'GET /api/biblia/buscar', 'GET /api/biblia/:traducao/:livro/caps', 'GET /api/biblia/:traducao/:livro/:cap',
  'POST /api/historico', 'GET /api/historico', 'GET /api/historico/repertorio', 'DELETE /api/historico/:id', 'POST /api/historico/limpar',
  'GET /api/letras/buscar-local', 'GET /api/letras/preview-local', 'POST /api/letras/importar-do-catalogo', 'GET /api/letras/buscar', 'POST /api/letras/preview', 'POST /api/letras/importar',
  'GET /api/ministrantes', 'POST /api/ministrantes', 'PUT /api/ministrantes/:id', 'DELETE /api/ministrantes/:id',
  'GET /api/tom-memoria', 'PUT /api/tom-memoria', 'POST /api/tom-memoria/import', 'POST /api/tom-memoria/sync-invb', 'POST /api/tom-memoria/webhook-invb',
  'GET /api/musicas', 'GET /api/musicas/buscar', 'GET /api/musicas/:id', 'GET /api/musicas/:id/versoes', 'POST /api/musicas', 'POST /api/musicas/checar-duplicidade', 'POST /api/musicas/importar',
  'PUT /api/musicas/:id', 'POST /api/musicas/:id/salvar', 'POST /api/musicas/:id/copia-padrao', 'POST /api/musicas/:id/criar-versao', 'PATCH /api/musicas/:id/rotulo', 'POST /api/musicas/:id/rotulo',
  'DELETE /api/musicas/:id', 'POST /api/musicas/:id/excluir', 'POST /api/musicas/sincronizar',
  'GET /api/playlists', 'PUT /api/playlists', 'POST /api/playlists/adicionar-musica',
  'PUT /api/sync/banco/meta', 'GET /api/sync/banco/local', 'POST /api/sync/banco/local', 'POST /api/sync/banco/pedido', 'GET /api/sync/banco/pedido',
  'POST /api/sync/banco/pedido/aceitar', 'POST /api/sync/banco/pedido/recusar',
  'POST /api/sync-invb-playlist', 'POST /api/sync-invb-playlist/aplicar-versoes', 'POST /api/docs/converter-pdf',
  'PUT /api/display-config', 'PUT /api/display-config/preview', 'GET /vosk-model/:arquivo', 'GET /*',
  'GET /api/identity', 'GET /api/estado', 'GET /api/monitores', 'GET /api/display-routing', 'PUT /api/display-routing', 'GET /api/display-config',
  'POST /api/comando/exibir_apresentacao', 'POST /api/comando/exibir_contagem', 'POST /api/comando/encerrar_contagem', 'POST /api/comando/encerrar_apresentacao_publico',
  'POST /api/comando/audio_play', 'POST /api/comando/audio_pause', 'POST /api/comando/audio_stop', 'POST /api/comando/audio_volume', 'POST /api/comando/audio_seek', 'POST /api/comando/apresentacao_video_state',
  'GET /api/sync/banco', 'POST /api/sync/banco', 'POST /api/open-display-devtools', 'POST /api/open-public-devtools', 'POST /api/open-ministrante-devtools',
  'POST /api/internal/restart', 'POST /api/internal/quit-for-update',
  'GET /api/controladores', 'POST /api/controladores/aprovar', 'POST /api/controladores/revogar', 'POST /api/controladores/travar', 'POST /api/controladores/destravar',
  'GET /obs', 'GET /obs/biblia', 'GET /obs/slides',
]);

/** Chaves «MÉTODO caminho» que existem no manifesto e a auditoria original não listava como rota própria. */
const ROTAS_NOVAS_NA_C0 = Object.freeze([
  'GET,HEAD /api/musicas/*',
  'GET,HEAD /api/biblia/*',
  'GET,HEAD /api/apresentacao/{video,midia}/:id',
  'GET,POST /socket.io/*',
]);

/** Incompatibilidades e lacunas identificadas ao montar o manifesto. */
const INCOMPATIBILIDADES = Object.freeze([
  { id: 'I1', titulo: 'O 3001 não valida dispositivos com Servidor separado', texto: 'O verificador do 3001 chama o motor local; sem ele devolve «não verificável». Em «impor» recusaria mobile e outros clientes.', rotas: 'todas as rotas LER/ESC do 3001' },
  { id: 'I2', titulo: 'Comandos HTTP: regras diferentes por hospedeiro', texto: 'No Servidor (S) os 10 comandos não têm guarda nem respeitam o bastão do primário; no motor local (L) só aceitam loopback.', rotas: 'POST /api/comando/* (S e L)' },
  { id: 'I3', titulo: 'Telões e janela de controle fazem GET sem credencial', texto: '/api/display-config e /api/monitores são «leitura» para a autenticação e quebrariam em «impor». O telão chama http://localhost:5510.', rotas: 'GET /api/display-config, GET /api/monitores' },
  { id: 'I4', titulo: 'Mobile: Socket.IO principal sem auth', texto: 'Só as telas Bíblia e Estrofes inscrevem o dispositivo; nas demais a credencial HTTP é «desconhecida».', rotas: 'rotas LER/ESC usadas pelo mobile' },
  { id: 'I5', titulo: 'open-*-devtools: classe escrita, sem guarda, chamador sem credencial', texto: 'O processo principal as chama sem cabeçalhos; qualquer dispositivo inscrito também pode. Não existem no motor local (o menu «console do público/ministrante» devolve 404 no modo local).', rotas: 'POST /api/open-*-devtools (S)' },
  { id: 'I6', titulo: 'Sincronização entre PCs', texto: 'POST /api/sync/banco/pedido vem de painel que não está inscrito no Controlador receptor; exigir dispositivo inscrito a quebraria.', rotas: 'POST /api/sync/banco/pedido' },
  { id: 'I7', titulo: 'Salto 3001→5510 sem credencial em Servidor separado', texto: 'Pendência herdada da Fase B; depende do elo.', rotas: 'PUT /api/display-config e /preview (C)' },
  { id: 'I8', titulo: 'POSTs de consulta classificados como escrita', texto: '/api/musicas/checar-duplicidade e /api/letras/preview são POST sem escrever; sem efeito prático (mesma credencial), mas a classe semântica difere da classe atual.', rotas: 'POST /api/musicas/checar-duplicidade, POST /api/letras/preview' },
  { id: 'I9', titulo: 'Comentários do painel citam rota inexistente', texto: 'controllerAppCore.js e midiaApresentacao.js citam `/api/apresentacao/media/id`; a rota real é `/api/apresentacao/midia/:id`. Só comentário; nenhuma chamada.', rotas: '—' },
  { id: 'I10', titulo: 'Painel só usa 127.0.0.1:3001', texto: 'A política PL exclui o painel aberto em navegador comum (sem a credencial interna).', rotas: 'todas as rotas PL' },
  { id: 'I11', titulo: 'Porta 5001 (OBS) sem autenticação HTTP montada', texto: 'Só protecaoRede (Host/Origin). As páginas são públicas por construção.', rotas: 'GET /obs, /obs/biblia, /obs/slides (S e L)' },
  { id: 'I12', titulo: 'express.static montado antes das rotas no 3001', texto: 'Um arquivo em controller/public com o mesmo nome de uma rota teria precedência sobre ela.', rotas: 'GET /* (C)' },
  { id: 'I14', titulo: 'Ferramenta de acompanhamento da playlist usa HTTP sem credencial', texto: 'tools/acompanhamento-playlist abre em file:// (Origin: null) e consulta GET /api/playlists do 3001 como fallback; a E1.2 já recusa esse HTTP e a ferramenta usa o Socket.IO. Política LER mantida (C1).', rotas: 'GET /api/playlists (C)' },
  { id: 'I13', titulo: 'Proxies aceitam qualquer método e respondem 405 a escrita', texto: 'Os três proxies interceptam todos os métodos das famílias; só GET/HEAD atravessam.', rotas: 'proxies S' },
]);

/* ───────────────────────── geração do documento ───────────────────────── */

function cont(filtro) { return ROTAS.filter(filtro).length; }

/**
 * Números FIXOS (contados à mão a partir das fontes), de propósito: mudar o manifesto sem rever
 * estes valores faz o teste falhar. Entradas = rotas × hospedeiros (a rota presente no Servidor e
 * no motor local conta duas vezes).
 */
const CONTAGENS_ESPERADAS = Object.freeze({
  total: 128,
  servidor: Object.freeze({ C: 64, S: 37, L: 27 }),
  classe: Object.freeze({ publica: 16, leitura: 28, 'leitura-sensivel': 4, escrita: 40, comando: 20, administrativa: 20 }),
});

const NOME_SERVIDOR = { C: 'Controlador (3001)', S: 'Servidor separado (5510 e 5001)', L: 'Motor local do Controlador (5510 e 5001)' };

function esc(s) { return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
function cred(r) {
  const c = r.credencial;
  const partes = [];
  partes.push(c.dispositivo === 'exigida' ? 'dispositivo: exigida' : c.dispositivo === 'nao' ? 'dispositivo: não aceita' : 'dispositivo: não usa');
  partes.push(c.interna === 'exigida' ? 'interna: exigida' : c.interna === 'aceita' ? 'interna: aceita' : 'interna: não');
  partes.push(c.elo === 'nao' ? 'elo: não' : `elo: ${c.elo}`);
  return partes.join('; ');
}
function emImpor(classeAtual) {
  return { publica: 'passa', leitura: 'exige dispositivo', escrita: 'exige dispositivo', comando: 'exige dispositivo', 'loopback-estrito': 'só loopback, sem proxy' }[classeAtual];
}

function renderizarMarkdown() {
  const L = [];
  L.push('# Manifesto de rotas HTTP do Lyra');
  L.push('');
  L.push('> **Gerado** a partir de `packages/projection-core/src/manifestoRotas.js`. Não edite este arquivo à mão: altere o manifesto e regenere com');
  L.push('> `node -e "require(\'./packages/projection-core/src/manifestoRotas\').gravarDocumento()"`. O teste `manifestoRotas.test.js` falha se estiver desatualizado.');
  L.push('');
  L.push('E1.3 Fase C, etapa C0. **Documentação verificável: não altera o comportamento de nenhuma rota.** Os três servidores seguem em modo `registrar`; a coluna «Hoje em impor» mostra o que o modo `impor` faria, e ele não está ativo.');
  L.push('');
  L.push('## Três credenciais diferentes');
  L.push('');
  L.push('| Credencial | O que é | Quem a usa | Situação |');
  L.push('|---|---|---|---|');
  L.push('| **Dispositivo** | `X-Lyra-Device` / `X-Lyra-Secret`, conferida na allowlist | mobile, painel de outro PC, qualquer cliente inscrito | existe (Fases A e B) |');
  L.push('| **Interna do motor local** | par efêmero em memória, injetado pelo processo principal | só painel e Histórico, só para o Controlador (3001 e 5510 local) | existe (Fase B, arquitetura W) |');
  L.push('| **Interprocessos** (`X-Lyra-Via`) | assinatura HMAC entre Controlador e Servidor | processos principais dos dois apps | **não existe**: prevista para C3+; aqui só aparece como necessidade |');
  L.push('');
  L.push('Um middleware no caminho **não** prova proteção: a coluna «Guarda própria» é conferida contra o texto da declaração da rota pelo teste.');
  L.push('');
  L.push('## Legendas');
  L.push('');
  L.push('Políticas pretendidas: ' + VOCAB.politicas.map((p) => `**${p}** ${LEGENDA_POLITICAS[p]}`).join('; ') + '.');
  L.push('');
  L.push('Testes: ' + VOCAB.testes.map((t) => `**${t}** ${LEGENDA_TESTES[t]}`).join('; ') + '.');
  L.push('');
  L.push('Guarda própria: `nenhuma`; `ip-loopback-middleware` (`soDestaMaquina`/`soLocal` na chamada); `ip-loopback-handler` (`requisicaoVemDaMaquinaLocal` dentro do handler); `segredo-proprio`; `proxy-somente-leitura`; `nao-se-aplica`.');
  L.push('');
  L.push('Servidores: **C** Controlador (3001) · **S** Servidor separado (5510, OBS 5001) · **L** motor local do Controlador (5510, OBS 5001).');
  L.push('');
  L.push('## Regras gerais de casamento de caminho');
  L.push('');
  L.push('- Express casa rotas **sem diferenciar maiúsculas** e aceita barra final; `classificarRota` normaliza caminho (`.`, `..`, `//`, codificação) antes de classificar.');
  L.push('- Toda rota `GET` responde também a `HEAD`; a classificação trata `HEAD` como leitura.');
  L.push('- `OPTIONS` (preflight) é respondido pela proteção de Host/Origin/CORS (E1.2) e classificado como público.');
  L.push('- Caminhos fora de `/api` são públicos para a autenticação (páginas, estáticos, `/obs*`, `/socket.io`, `/vosk-model`).');
  L.push('- Os proxies do Servidor interceptam **qualquer método** das famílias `/api/musicas*`, `/api/biblia*` e `/api/apresentacao/{video,midia}/*`; só `GET`/`HEAD` atravessam (os demais recebem 405).');
  L.push('');

  L.push('## Resumo');
  L.push('');
  L.push(`Total: **${ROTAS.length}** entradas (cada rota que existe em dois hospedeiros conta uma vez por hospedeiro).`);
  L.push('');
  L.push('| Servidor | ' + VOCAB.classes.join(' | ') + ' | total |');
  L.push('|---|' + VOCAB.classes.map(() => '---:').join('|') + '|---:|');
  for (const s of VOCAB.servidores) {
    L.push(`| ${NOME_SERVIDOR[s]} | ${VOCAB.classes.map((c) => cont((r) => r.servidor === s && r.classe === c)).join(' | ')} | ${cont((r) => r.servidor === s)} |`);
  }
  L.push(`| **Total** | ${VOCAB.classes.map((c) => cont((r) => r.classe === c)).join(' | ')} | ${ROTAS.length} |`);
  L.push('');
  L.push('| Política pretendida | entradas |');
  L.push('|---|---:|');
  const porPol = new Map();
  for (const r of ROTAS) porPol.set(r.politicaPretendida.join(' + '), (porPol.get(r.politicaPretendida.join(' + ')) || 0) + 1);
  for (const [k, v] of [...porPol.entries()].sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`);
  L.push('');

  L.push('## Rotas novas descobertas na C0');
  L.push('');
  L.push('Não constavam como rotas próprias na auditoria original (são montagens, não declarações `get/post/...`):');
  L.push('');
  for (const k of ROTAS_NOVAS_NA_C0) L.push(`- \`${k}\``);
  L.push('');
  L.push('Também separadas na C0: cada rota presente no Servidor **e** no motor local (duplicatas) e a porta 5001 do OBS nos dois hospedeiros. Nenhuma rota da auditoria original ficou de fora.');
  L.push('');

  L.push('## Rotas que precisam permanecer públicas');
  L.push('');
  L.push('| Id | Servidor | Rota | Política | Justificativa |');
  L.push('|---|---|---|---|---|');
  for (const r of ROTAS.filter((x) => x.justificativaPublica)) L.push(`| ${r.id} | ${r.servidor} | \`${r.metodo} ${esc(r.caminho)}\` | ${r.politicaPretendida.join(' + ')} | ${esc(r.justificativaPublica)} |`);
  L.push('');

  L.push('## Rotas administrativas (exigem confiança adicional)');
  L.push('');
  L.push('| Id | Servidor | Rota | Hoje em impor | Guarda própria | Pretendida | Observação |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of ROTAS.filter((x) => x.classe === 'administrativa')) L.push(`| ${r.id} | ${r.servidor} | \`${r.metodo} ${esc(r.caminho)}\` | ${emImpor(r.classeAtual)} | ${r.guardaPropria} | ${r.politicaPretendida.join(' + ')} | ${esc(r.riscos)} |`);
  L.push('');

  L.push('## Rotas com dependência interprocessos');
  L.push('');
  L.push('| Id | Servidor | Rota | Elo | Dependências |');
  L.push('|---|---|---|---|---|');
  for (const r of ROTAS.filter((x) => x.credencial.elo !== 'nao' || x.tipo === 'proxy')) L.push(`| ${r.id} | ${r.servidor} | \`${r.metodo} ${esc(r.caminho)}\` | ${r.credencial.elo} | ${esc(r.dependencias.join('; '))} |`);
  L.push('');

  L.push('## Aliases, duplicatas, proxies e caminhos alternativos');
  L.push('');
  L.push('| Id | Rota | Relações |');
  L.push('|---|---|---|');
  const porId = new Map(ROTAS.map((r) => [r.id, r]));
  for (const r of ROTAS.filter((x) => x.caminhosAlternativos.length)) {
    const rel = r.caminhosAlternativos.map((a) => `${a.relacao} → ${a.id} (${porId.get(a.id).servidor} ${porId.get(a.id).metodo} ${porId.get(a.id).caminho})`);
    L.push(`| ${r.id} | ${r.servidor} \`${r.metodo} ${esc(r.caminho)}\` | ${esc(rel.join('; '))} |`);
  }
  L.push('');

  L.push('## Incompatibilidades e lacunas identificadas');
  L.push('');
  L.push('| Id | Achado | Detalhe | Rotas |');
  L.push('|---|---|---|---|');
  for (const i of INCOMPATIBILIDADES) L.push(`| ${i.id} | ${esc(i.titulo)} | ${esc(i.texto)} | ${esc(i.rotas)} |`);
  L.push('');

  for (const s of VOCAB.servidores) {
    L.push(`## Manifesto: ${NOME_SERVIDOR[s]}`);
    L.push('');
    L.push('| Id | Porta | Método e caminho | Handler | Classe | Hoje (classe → em impor) | Guarda própria | Pretendida | Credenciais | Clientes | Dependências | Compatibilidade | Riscos de quebra | Testes |');
    L.push('|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of ROTAS.filter((x) => x.servidor === s)) {
      const classe = r.classe + (r.destrutiva ? ' (destrutiva)' : '');
      L.push(`| ${r.id} | ${r.porta} | \`${r.metodo} ${esc(r.caminho)}\`${r.tipo !== 'rota' ? ` (${r.tipo})` : ''} | \`${r.handler.arquivo}:${r.handler.linha}\` | ${classe} | ${r.classeAtual} → ${emImpor(r.classeAtual)} | ${r.guardaPropria} | ${r.politicaPretendida.join(' + ')} | ${cred(r)} | ${r.clientes.join(', ')} | ${esc(r.dependencias.join('; ') || '—')} | ${esc(r.compatibilidade)} | ${esc(r.riscos)} | ${r.testes.join(' ')} |`);
    }
    L.push('');
  }
  L.push('As linhas dos handlers são aproximadas (data da geração); o teste confere a existência da declaração no arquivo, não a linha.');
  L.push('');
  return L.join('\n');
}

const DOCUMENTO = path.resolve(__dirname, '..', '..', '..', 'docs', 'seguranca', 'manifesto-rotas.md');

function gravarDocumento() {
  fs.mkdirSync(path.dirname(DOCUMENTO), { recursive: true });
  fs.writeFileSync(DOCUMENTO, renderizarMarkdown(), 'utf8');
  return DOCUMENTO;
}

module.exports = {
  ROTAS,
  VOCAB,
  LEGENDA_POLITICAS,
  LEGENDA_TESTES,
  ARQUIVOS_COM_ROTAS,
  AUDITORIA_ORIGINAL,
  ROTAS_NOVAS_NA_C0,
  INCOMPATIBILIDADES,
  CONTAGENS_ESPERADAS,
  renderizarMarkdown,
  gravarDocumento,
};
