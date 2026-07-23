'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');
const extract = require('extract-zip');
const tar = require('tar');

const HTTP_CONTROLLER_PORT = 3001;

const MODEL_FOLDER = 'vosk-model-small-pt-0.3';
const MODEL_ZIP = `${MODEL_FOLDER}.zip`;
const MODEL_TAR = `${MODEL_FOLDER}.tar.gz`;
const MODEL_ZIP_URL = `https://alphacephei.com/vosk/models/${MODEL_ZIP}`;

let baixando = false;

function dirDadosUsuario() {
  return app.getPath('userData');
}

function caminhoZipModelo() {
  return path.join(dirDadosUsuario(), MODEL_ZIP);
}

function caminhoDirModelo() {
  return path.join(dirDadosUsuario(), MODEL_FOLDER);
}

function caminhoTarModelo() {
  return path.join(dirDadosUsuario(), MODEL_TAR);
}

/** Modelos Vosk recentes usam pasta `am/`; o small-pt-0.3 tem `final.mdl` na raiz. */
function dirModeloValido(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  if (fs.existsSync(path.join(dir, 'final.mdl'))) return dir;
  if (fs.existsSync(path.join(dir, 'am', 'final.mdl'))) return dir;
  return null;
}

function resolverDirModeloExtraido() {
  const esperado = caminhoDirModelo();
  const ok = dirModeloValido(esperado);
  if (ok) return ok;

  const dirPai = dirDadosUsuario();
  let entradas = [];
  try {
    entradas = fs.readdirSync(dirPai, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const ent of entradas) {
    if (!ent.isDirectory()) continue;
    const candidato = path.join(dirPai, ent.name);
    if (dirModeloValido(candidato)) return candidato;
    const aninhado = path.join(candidato, MODEL_FOLDER);
    if (dirModeloValido(aninhado)) return aninhado;
  }
  return null;
}

function modeloExtraidoOk() {
  return !!resolverDirModeloExtraido();
}

function baixarArquivo(url, destino) {
  return new Promise((resolve, reject) => {
    const arquivo = fs.createWriteStream(destino);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        arquivo.close();
        fs.unlink(destino, () => {});
        baixarArquivo(res.headers.location, destino).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        arquivo.close();
        fs.unlink(destino, () => {});
        reject(new Error(`Download falhou (HTTP ${res.statusCode})`));
        return;
      }
      res.pipe(arquivo);
      arquivo.on('finish', () => arquivo.close(() => resolve()));
      arquivo.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function garantirModeloTarGz() {
  const tarPath = caminhoTarModelo();
  if (fs.existsSync(tarPath) && fs.statSync(tarPath).size > 1_000_000) return tarPath;

  if (baixando) {
    while (baixando) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300));
    }
    if (fs.existsSync(tarPath)) return tarPath;
    throw new Error('Download do modelo de voz falhou');
  }

  baixando = true;
  try {
    const dirPai = dirDadosUsuario();
    fs.mkdirSync(dirPai, { recursive: true });

    if (!modeloExtraidoOk()) {
      const zipPath = caminhoZipModelo();
      if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1_000_000) {
        await baixarArquivo(MODEL_ZIP_URL, zipPath);
      }
      await extract(zipPath, { dir: dirPai });
    }

    const dirModelo = resolverDirModeloExtraido();
    if (!dirModelo) {
      throw new Error('Modelo pt-BR inválido após extração');
    }

    if (!fs.existsSync(tarPath) || fs.statSync(tarPath).size < 1_000_000) {
      await tar.c(
        {
          gzip: true,
          file: tarPath,
          cwd: dirModelo,
        },
        ['.']
      );
    }
  } finally {
    baixando = false;
  }

  if (!fs.existsSync(tarPath)) {
    throw new Error('Arquivo do modelo (.tar.gz) não foi gerado');
  }
  return tarPath;
}

async function obterUrlModeloVozSlides() {
  await garantirModeloTarGz();
  return {
    ok: true,
    url: `http://127.0.0.1:${HTTP_CONTROLLER_PORT}/vosk-model/${MODEL_TAR}`,
  };
}

module.exports = {
  garantirModeloTarGz,
  obterUrlModeloVozSlides,
  caminhoTarModelo,
  MODEL_TAR,
};
