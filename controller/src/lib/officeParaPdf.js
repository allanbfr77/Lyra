/**
 * Conversão de PowerPoint e Word em PDF, pelo Office instalado na máquina.
 *
 * O modo DOCS desenha páginas com o pdf.js, e o pdf.js só lê PDF. Em vez de um segundo
 * motor de renderização para cada formato do Office, o documento é convertido uma vez e
 * segue pelo caminho que já existe: original → PDF → pdf.js → páginas.
 *
 * A conversão é feita pelo próprio Office, por automação COM (`officeParaPdf.vbs`), porque
 * é o que está instalado nas máquinas onde o Lyra corre — e é também o único caminho que
 * garante que o slide sai como o operador o vê no PowerPoint. Nada é aberto à frente do
 * utilizador: as janelas do Office ficam escondidas. A localização do Office não depende
 * de nenhum caminho fixo em disco: `officeParaPdf.vbs` pede o objeto COM pelo ProgID
 * (`Word.Application` / `PowerPoint.Application`), e é o próprio Windows quem resolve isso
 * para a instalação que houver — 2016, 2019, 2021, 365, Click-to-Run ou MSI, 32 ou 64 bits
 * — sem o Lyra precisar de saber onde ela vive.
 *
 * O pedido ao Office vai pelo Windows Script Host (`cscript`), e não pelo PowerShell. Numa
 * máquina real do Lyra o PowerShell criava o objeto COM e recebia-o vazio — `Version` em
 * branco, `Presentations` nulo, sem erro nenhum, com o Windows a registar «o servidor não
 * se registou no DCOM dentro do tempo limite»; pelo WSH o mesmo pedido respondeu à
 * primeira. O WSH existe em qualquer Windows, por isso a troca não custa compatibilidade —
 * exceto que, a partir do Windows 11 24H2/25H2, a Microsoft passou a permitir desativar o
 * VBScript como «recurso opcional»; se isso acontecer nesta máquina o `cscript` falha logo
 * no arranque, e é o próprio WSH quem o diz (`stdErroSemDiagnostico` abaixo). Esse caso tem
 * mensagem própria em `mensagemFalhaConversao`.
 *
 * Só Windows. Noutro sistema — e quando o Office não está instalado — a conversão falha
 * com uma mensagem que o painel mostra tal e qual; o DOCS continua a funcionar para PDF e
 * para os outros documentos da lista.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { criarDiagnosticoConversao } = require('./conversaoDiagnostico');

/** Tempo máximo de uma conversão. O Office pode demorar a arrancar na primeira vez. */
const TIMEOUT_CONVERSAO_MS = 180000;

const EXTENSOES_WORD = new Set(['.doc', '.docx', '.rtf', '.odt']);
const EXTENSOES_POWERPOINT = new Set(['.ppt', '.pptx', '.pps', '.ppsx', '.odp']);

/**
 * Que aplicação do Office converte este ficheiro, ou `null` se nenhuma.
 * @param {string} nome nome ou caminho do ficheiro
 * @returns {'word'|'powerpoint'|null}
 */
function tipoOfficeDoNome(nome) {
  const ext = path.extname(String(nome || '')).toLowerCase();
  if (EXTENSOES_WORD.has(ext)) return 'word';
  if (EXTENSOES_POWERPOINT.has(ext)) return 'powerpoint';
  return null;
}

/** Mensagem legível para quem está à frente do painel. */
function mensagemFalhaConversao(tipo, detalhe) {
  const app = tipo === 'word' ? 'o Word' : 'o PowerPoint';
  const d = String(detalhe || '').trim();
  const base = `Não foi possível converter este documento com ${app}.`;
  /*
   * O Office recusa automação a quem corre elevado: o servidor COM arranca com o token do
   * utilizador interactivo, e o Windows devolve CO_E_SERVER_EXEC_FAILURE em vez de o ligar
   * ao processo elevado. Sem isto, o operador via só «0x80080005» e não tinha o que fazer.
   */
  if (/80080005|CO_E_SERVER_EXEC_FAILURE/i.test(d)) {
    return (
      `${base} O Windows não deixa o Office ser controlado por um programa em modo` +
      ' administrador. Feche o Lyra e abra-o normalmente, sem «Executar como administrador».'
    );
  }
  if (/80040154|Class not registered|inválida a classe|Retrieving the COM class factory/i.test(d)) {
    return `${base} O Microsoft Office não parece estar instalado nesta máquina.`;
  }
  /*
   * A partir do Windows 11 24H2/25H2 o VBScript passou a «recurso opcional» — pode ter
   * sido desativado por uma atualização do Windows ou pela política do administrador desta
   * máquina, mesmo que a conversão funcionasse antes. Sem detetar isto à parte, o operador
   * via a mesma frase genérica de sempre e não havia nada que ele pudesse fazer sozinho.
   */
  if (/no script engine|there is no script engine|0x800a01f4|0x800a0046/i.test(d)) {
    return (
      `${base} O recurso do Windows que executa essa conversão (VBScript) parece estar` +
      ' desativado nesta máquina. Em Configurações do Windows, abra "Aplicativos > Recursos' +
      ' opcionais > Adicionar um recurso" e instale "VBScript", depois tente novamente.'
    );
  }
  return d ? `${base} ${d}` : base;
}

/**
 * Converte `origem` num PDF gravado em `destino`.
 *
 * @param {{
 *   origem: string,
 *   destino: string,
 *   timeoutMs?: number,
 *   diagnosticoPath?: string|(() => string),
 * }} opts `diagnosticoPath` é onde fica o diário técnico (nunca mostrado ao operador); sem
 *   ele, nada é escrito em disco além do PDF.
 * @returns {Promise<{ok: true}|{ok: false, erro: string}>} nunca rejeita: o erro é dado
 *   como valor, para a rota o devolver ao painel sem derrubar o processo principal.
 */
function converterOfficeParaPdf({ origem, destino, timeoutMs = TIMEOUT_CONVERSAO_MS, diagnosticoPath }) {
  const diagnostico = criarDiagnosticoConversao({ caminhoArquivo: diagnosticoPath });
  const inicioMs = Date.now();
  const tipo = tipoOfficeDoNome(origem);
  if (!tipo) {
    return Promise.resolve({ ok: false, erro: 'Formato sem conversão conhecida.' });
  }
  if (process.platform !== 'win32') {
    return Promise.resolve({
      ok: false,
      erro: 'A conversão de PowerPoint e Word usa o Microsoft Office e só funciona no Windows.',
    });
  }
  const script = path.join(__dirname, 'officeParaPdf.vbs');
  return new Promise((resolve) => {
    const finalizar = (resultado, extra) => {
      diagnostico.registar({
        evento: 'conversao',
        tipo,
        origemExt: path.extname(origem),
        ok: resultado.ok,
        duracaoMs: Date.now() - inicioMs,
        erro: resultado.ok ? undefined : resultado.erro,
        ...extra,
      });
      resolve(resultado);
    };

    let ps;
    try {
      ps = spawn(
        'cscript.exe',
        /* Sem `//B`: em modo batch o cscript cala também os erros de compilação, e uma falha
           dessas chegaria aqui sem motivo nenhum. O que sai vai para o stderr, que é lido —
           janela nenhuma aparece, o `cscript` não usa caixas de diálogo. */
        ['//Nologo', '//E:vbscript', script, origem, destino, tipo],
        { windowsHide: true }
      );
    } catch (e) {
      finalizar(
        { ok: false, erro: mensagemFalhaConversao(tipo, e && e.message) },
        { etapa: 'spawn', metodo: 'cscript' }
      );
      return;
    }
    let stderr = '';
    let stdout = '';
    let terminado = false;
    /*
     * A mensagem de erro vem por ficheiro, não pelo stderr.
     *
     * O stdout e o stderr do `cscript` saem na página de código da consola, e os acentos
     * chegavam partidos ao painel. O script grava o motivo em UTF-16 (o que o
     * `FileSystemObject` sabe escrever), e é daí que se lê; o stderr fica como recurso,
     * para o caso de o script morrer antes de o escrever.
     */
    const lerErroDoFicheiro = () => {
      const caminho = `${destino}.erro.txt`;
      try {
        if (!fs.existsSync(caminho)) return '';
        const txt = fs.readFileSync(caminho, 'utf16le').replace(/^\uFEFF/, '').trim();
        fs.unlinkSync(caminho);
        return txt;
      } catch (_) {
        return '';
      }
    };
    /*
     * As linhas "DIAG ..." são progresso técnico do próprio script (versão do Office
     * encontrada, se anexou a uma instância já aberta ou criou uma nova, etc.) — vão para o
     * diário, nunca para o operador. O que sobra do stdout depois de as tirar é o que o
     * próprio Windows Script Host escreveu quando nem chega a correr o script (por exemplo
     * «there is no script engine for file extension ".vbs"», quando o VBScript está
     * desativado na máquina) — é aí que esse erro aparece, não no stderr.
     */
    const separarStdout = () => {
      const linhas = stdout.split(/\r?\n/);
      const diag = linhas.filter((l) => l.startsWith('DIAG ')).map((l) => l.slice(5));
      const resto = linhas.filter((l) => l && !l.startsWith('DIAG ')).join(' ').trim();
      return { diag, resto };
    };
    const terminar = (resultado, extra) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(cronometro);
      finalizar(resultado, extra);
    };
    const cronometro = setTimeout(() => {
      try { ps.kill(); } catch (_) {
        // intencional — o que interessa é não ficar pendurado
      }
      const { diag } = separarStdout();
      terminar(
        { ok: false, erro: 'A conversão demorou demasiado e foi interrompida.' },
        { etapa: 'timeout', metodo: 'cscript', diag: diag.join(' | ') }
      );
    }, timeoutMs);

    ps.stderr.on('data', (c) => {
      stderr += String(c);
    });
    ps.stdout.on('data', (c) => {
      stdout += String(c);
    });
    ps.on('error', (e) => {
      terminar(
        { ok: false, erro: mensagemFalhaConversao(tipo, e && e.message) },
        { etapa: 'spawn-error', metodo: 'cscript' }
      );
    });
    ps.on('close', (codigo) => {
      const doFicheiro = lerErroDoFicheiro();
      const { diag, resto } = separarStdout();
      if (codigo === 0 && fs.existsSync(destino)) {
        terminar({ ok: true }, { etapa: 'concluido', metodo: 'cscript', codigo, diag: diag.join(' | ') });
        return;
      }
      const detalhe = doFicheiro || stderr.trim() || resto;
      terminar(
        { ok: false, erro: mensagemFalhaConversao(tipo, detalhe) },
        {
          etapa: 'falhou',
          metodo: 'cscript',
          codigo,
          destinoExiste: fs.existsSync(destino),
          diag: diag.join(' | '),
          stderr: stderr.trim() || undefined,
        }
      );
    });
  });
}

module.exports = { tipoOfficeDoNome, mensagemFalhaConversao, converterOfficeParaPdf };
