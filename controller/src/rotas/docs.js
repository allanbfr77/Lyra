/**
 * Rota HTTP :3001 da conversão de documentos do modo DOCS.
 *
 * O painel manda o ficheiro original; a resposta é o PDF equivalente, que ele guarda como
 * representação interna para renderizar. O original do utilizador não é tocado: o que fica
 * em disco aqui são dois ficheiros temporários, apagados no fim da chamada.
 *
 * PDF não passa por aqui — segue direto para o pdf.js, como sempre.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { tipoOfficeDoNome, converterOfficeParaPdf } = require('../lib/officeParaPdf');

/** Limite generoso: uma apresentação com vídeo e imagens grandes ainda é um ficheiro só. */
const LIMITE_UPLOAD = '800mb';

function nomeSeguroTemporario(nome) {
  const ext = path.extname(String(nome || '')).toLowerCase();
  const marca = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `lyra_docs_${marca}${ext}`;
}

function apagarSilencioso(caminho) {
  if (!caminho) return;
  try {
    fs.unlinkSync(caminho);
  } catch (_) {
    // intencional — temporário que não sai não é motivo para falhar a resposta
  }
}

/**
 * @param {object} expressApp
 * @param {{soDestaMaquina: Function}} deps
 */
function registrarRotasDocs(expressApp, deps) {
  const { soDestaMaquina } = deps;

  expressApp.post(
    '/api/docs/converter-pdf',
    soDestaMaquina,
    express.raw({ type: '*/*', limit: LIMITE_UPLOAD }),
    (req, res) => {
      void (async () => {
        const nome = String((req.query && req.query.nome) || '').trim();
        const tipo = tipoOfficeDoNome(nome);
        if (!tipo) {
          return res
            .status(400)
            .json({ ok: false, erro: 'Este formato não é convertido pelo Office.' });
        }
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
          return res.status(400).json({ ok: false, erro: 'Nenhum arquivo recebido.' });
        }
        const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-docs-'));
        const origem = path.join(dirTemp, nomeSeguroTemporario(nome));
        const destino = `${origem}.pdf`;
        try {
          fs.writeFileSync(origem, req.body);
          const r = await converterOfficeParaPdf({ origem, destino });
          if (!r.ok) {
            return res.status(422).json({ ok: false, erro: r.erro });
          }
          const pdf = fs.readFileSync(destino);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', String(pdf.length));
          return res.end(pdf);
        } catch (e) {
          if (!res.headersSent) {
            return res.status(500).json({ ok: false, erro: (e && e.message) || String(e) });
          }
          return undefined;
        } finally {
          apagarSilencioso(origem);
          apagarSilencioso(destino);
          /* O script grava aqui o motivo da falha; se o Node já o leu, isto não encontra nada. */
          apagarSilencioso(`${destino}.erro.txt`);
          try {
            fs.rmSync(dirTemp, { recursive: true, force: true });
          } catch (_) {
            // intencional — a pasta fica no temp do sistema, que é limpo pelo Windows
          }
        }
      })();
    }
  );
}

module.exports = { registrarRotasDocs };
