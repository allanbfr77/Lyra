'use strict';

/**
 * Isola o diretório temporário de cada processo de teste.
 *
 * Vários testes criam pastas com `fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-...'))`
 * e nem todos as removem no fim. Em poucos dias isso acumulou ~20 mil pastas no
 * %TEMP% e atrasou o logon do Windows (o serviço de perfil percorre o Temp inteiro).
 *
 * Este arquivo é carregado com `node --test --require ./scripts/test-tmp-isolado.cjs`.
 * Ele aponta TEMP/TMP/TMPDIR deste processo (e dos filhos, que herdam o ambiente)
 * para uma pasta própria, `lyra-testes-XXXXXX`, apagada quando o processo termina.
 * Assim nenhum teste precisa mudar e nada sobra no %TEMP% real.
 *
 * Para desligar (depurar o conteúdo deixado por um teste):
 *   LYRA_TESTES_TMP_ISOLADO_DESLIGADO=1 npm test
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.LYRA_TESTES_TMP_ISOLADO_DESLIGADO) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-testes-'));

  process.env.TEMP = dir;
  process.env.TMP = dir;
  process.env.TMPDIR = dir;

  let limpo = false;
  const limpar = () => {
    if (limpo) return;
    limpo = true;
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Arquivo ainda em uso (ex.: processo filho vivo): o Windows libera depois.
    }
  };

  process.on('exit', limpar);
  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.once(sinal, () => {
      limpar();
      process.exit(1);
    });
  }
}
