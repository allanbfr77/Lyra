/**
 * Rotas HTTP :3001 do histórico de projeção e relatório de repertório.
 *
 * Extraído do servidor do controlador sem mudar paths nem JSON.
 * A regra de repetição continua em `lib/historicoProjecao`.
 */

'use strict';

const historicoProjecao = require('../lib/historicoProjecao');
const {
  inserirHistoricoProjecaoNoDb,
  listarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoPorPeriodoNoDb,
} = require('../db');

/**
 * @param {import('express').Express} expressApp
 */
function registrarRotasHistorico(expressApp) {
  /**
   * Última música registada nesta sessão do controlador — ver o `POST /api/historico`.
   * @type {{chave: string, em: number} | null}
   */
  let ultimaProjecaoRegistada = null;

  /**
   * Regista que uma música foi ao ar.
   *
   * ## A regra de repetição mora aqui, não no painel
   *
   * O painel corre com `contextIsolation` e não alcança `lib/`, e reimplementá-la lá era a
   * escolha óbvia — e errada: duas cópias da regra dariam dois relatórios diferentes na
   * mesma igreja, consoante quem estivesse a operar. Por isso o painel manda a cada
   * estrofe, sem pensar, e é aqui que se decide se vira linha.
   *
   * `ultimaProjecaoRegistada` vive em memória de propósito: reiniciar o controlador começa
   * uma sessão nova, e um culto que recomeça depois de um crash deve mesmo poder registar
   * a música de abertura outra vez.
   *
   * ## Limitação conhecida: o celular não passa por aqui
   *
   * O app Android projeta emitindo `exibir_musica` directamente no socket da 5510, sem
   * falar com esta API. Uma música projetada só pelo celular NÃO entra no histórico.
   *
   * Fica assim de propósito, e não por esquecimento: cobrir esse caminho significa o
   * controlador passar a registar a partir do estado que recebe do servidor de projeção, e
   * aí tem de distinguir o que ele próprio acabou de projetar do que veio de outro
   * dispositivo — sob pena de contar cada música duas vezes, que é pior do que contar de
   * menos. Enquanto o painel do PC for quem opera o culto, o registo está onde os dados
   * completos existem: só ele conhece o tom da playlist, o ministrante do dia e o culto.
   *
   * ## Porquê 200 e não 400 quando não se grava
   *
   * Uma projeção não pode falhar porque o histórico recusou uma linha. O operador está no
   * meio de um culto e não há nada que ele possa fazer com esse erro — `registado: false`
   * diz o que aconteceu sem transformar isto num problema dele.
   */
  expressApp.post('/api/historico', (req, res) => {
    try {
      const agora = Date.now();
      const reg = historicoProjecao.normalizarRegisto(req.body, agora);
      if (!reg) {
        res.json({ registado: false, motivo: 'sem-titulo' });
        return;
      }
      if (!historicoProjecao.deveRegistar(reg, ultimaProjecaoRegistada, reg.projetadoEm)) {
        res.json({ registado: false, motivo: 'repetida' });
        return;
      }
      const id = inserirHistoricoProjecaoNoDb(reg);
      ultimaProjecaoRegistada = historicoProjecao.marcaDeRegisto(reg, reg.projetadoEm);
      res.status(201).json({ registado: true, id });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Histórico detalhado de um período.
   *
   * `periodo` (`30d` / `90d` / `12m` / `tudo`) é o caminho normal; `de` e `ate` em ms
   * existem para a janela poder pedir um intervalo escolhido à mão sem duplicar a regra
   * dos períodos nomeados.
   */
  expressApp.get('/api/historico', (req, res) => {
    try {
      const { de, ate } = historicoProjecao.intervaloPedido(req.query, Date.now());
      res.json({ de, ate, linhas: listarHistoricoProjecaoNoDb({ de, ate }) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /** O mesmo período, agregado por música: quantas vezes, quando foi a última, que tons. */
  expressApp.get('/api/historico/repertorio', (req, res) => {
    try {
      const { de, ate } = historicoProjecao.intervaloPedido(req.query, Date.now());
      const linhas = listarHistoricoProjecaoNoDb({ de, ate });
      res.json({ de, ate, grupos: historicoProjecao.agregarRepertorio(linhas) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /** Remove uma linha — o registo que entrou por engano, num ensaio ou num teste. */
  expressApp.delete('/api/historico/:id', (req, res) => {
    try {
      res.json({ removido: apagarHistoricoProjecaoNoDb(req.params.id) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Apaga um período inteiro.
   *
   * Exige `confirmar: true` no corpo. Não é cerimónia: é a única rota do histórico que
   * destrói dados em lote e não tem como ser desfeita, e um POST sem corpo disparado por
   * engano levaria anos de registo.
   */
  expressApp.post('/api/historico/limpar', (req, res) => {
    try {
      if (!req.body || req.body.confirmar !== true) {
        res.status(400).json({ erro: 'Falta confirmar: true.' });
        return;
      }
      const { de, ate } = historicoProjecao.intervaloPedido(req.body, Date.now());
      res.json({ removidas: apagarHistoricoProjecaoPorPeriodoNoDb(de, ate) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });
}

module.exports = { registrarRotasHistorico };
