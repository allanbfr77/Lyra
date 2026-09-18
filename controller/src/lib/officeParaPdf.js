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
 * utilizador: as janelas do Office ficam escondidas.
 *
 * O pedido ao Office vai pelo Windows Script Host (`cscript`), e não pelo PowerShell. Numa
 * máquina real do Lyra o PowerShell criava o objeto COM e recebia-o vazio — `Version` em
 * branco, `Presentations` nulo, sem erro nenhum, com o Windows a registar «o servidor não
 * se registou no DCOM dentro do tempo limite»; pelo WSH o mesmo pedido respondeu à
 * primeira. O WSH existe em qualquer Windows, por isso a troca não custa compatibilidade.
 *
 * Só Windows. Noutro sistema — e quando o Office não está instalado — a conversão falha
 * com uma mensagem que o painel mostra tal e qual; o DOCS continua a funcionar para PDF e
 * para os outros documentos da lista.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  return d ? `${base} ${d}` : base;
}

/**
 * Converte `origem` num PDF gravado em `destino`.
 *
 * @param {{origem: string, destino: string, timeoutMs?: number}} opts
 * @returns {Promise<{ok: true}|{ok: false, erro: string}>} nunca rejeita: o erro é dado
 *   como valor, para a rota o devolver ao painel sem derrubar o processo principal.
 */
function converterOfficeParaPdf({ origem, destino, timeoutMs = TIMEOUT_CONVERSAO_MS }) {
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
      resolve({ ok: false, erro: mensagemFalhaConversao(tipo, e && e.message) });
      return;
    }
    let stderr = '';
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
    const terminar = (resultado) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(cronometro);
      resolve(resultado);
    };
    const cronometro = setTimeout(() => {
      try { ps.kill(); } catch (_) {
        // intencional — o que interessa é não ficar pendurado
      }
      terminar({ ok: false, erro: 'A conversão demorou demasiado e foi interrompida.' });
    }, timeoutMs);

    ps.stderr.on('data', (c) => {
      stderr += String(c);
    });
    ps.on('error', (e) => {
      terminar({ ok: false, erro: mensagemFalhaConversao(tipo, e && e.message) });
    });
    ps.on('close', (codigo) => {
      const doFicheiro = lerErroDoFicheiro();
      if (codigo === 0 && fs.existsSync(destino)) {
        terminar({ ok: true });
        return;
      }
      terminar({ ok: false, erro: mensagemFalhaConversao(tipo, doFicheiro || stderr) });
    });
  });
}

module.exports = { tipoOfficeDoNome, mensagemFalhaConversao, converterOfficeParaPdf };
