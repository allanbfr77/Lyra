/**
 * Rotas HTTP :3001 do modo apresentação (estado em RAM e mídias no disco).
 *
 * Extraído do servidor do controlador sem mudar paths, Range nem MIME.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Estado do modo apresentação persistido só na RAM (sincronização entre clientes na mesma máquina/rede). */
let apresentacaoStateMem = {};

/** Vídeos do card 5 — servidos por HTTP a partir do disco, nunca da memória. */
let apresentacaoVideosDirPath = '';
/** Pasta das mídias importadas por caminho — áudio e vídeo. Ver `apresentacaoMidiasDir`. */
let apresentacaoMidiasDirPath = '';

/** Extensões que a importação por caminho aceita. */
const EXTENSOES_MIDIA_APRESENTACAO = new Set([
  '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac', '.opus', '.wma',
  '.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.m4v',
]);

const MIMES_MIDIA_APRESENTACAO = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4',
};

/** MIME pela extensão, para áudio e vídeo. Cai em `mimePorCaminhoVideo` no desconhecido. */
function mimePorCaminhoMidia(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIMES_MIDIA_APRESENTACAO[ext] || mimePorCaminhoVideo(filePath);
}

/**
 * Procura o ficheiro de uma mídia pelo id, nas duas pastas.
 *
 * A pasta nova primeiro; a antiga (`apresentacao-videos`) a seguir, para os vídeos que já
 * lá estavam antes de a importação passar a copiar por caminho.
 */
function resolverArquivoMidiaApresentacao(id) {
  const safe = String(id || '').replace(/[^\w.-]+/g, '_');
  if (!safe) return null;
  for (const dir of [apresentacaoMidiasDirPath, apresentacaoVideosDirPath]) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) continue;
      const found = fs.readdirSync(dir).find((f) => f.startsWith(safe + '.'));
      if (found) return path.join(dir, found);
    } catch (_) {
      // intencional — uma pasta ilegível não impede de tentar a outra
    }
  }
  return null;
}

function extensaoMimeVideo(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return '.webm';
  if (m.includes('ogg')) return '.ogv';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  if (m.includes('avi')) return '.avi';
  return '.mp4';
}

function caminhoVideoApresentacaoNoDisco(id, mime) {
  const safe = String(id || '').replace(/[^\w.-]+/g, '_');
  return path.join(apresentacaoVideosDirPath, `${safe}${extensaoMimeVideo(mime)}`);
}

function salvarVideoApresentacaoNoDisco(id, buf, mime) {
  if (!apresentacaoVideosDirPath || !buf?.length) return;
  try {
    fs.mkdirSync(apresentacaoVideosDirPath, { recursive: true });
    fs.writeFileSync(caminhoVideoApresentacaoNoDisco(id, mime), buf);
  } catch (_) {
    // intencional — erro ignorado
  }
}

function mimePorCaminhoVideo(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.ogv') return 'video/ogg';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'video/mp4';
}

/** Entrega a mídia com suporte a Range — leitura em fluxo do disco (buffer do SO). */
function enviarMidiaApresentacaoComRange(req, res, filePath, mime) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const tipo = mime || mimePorCaminhoVideo(filePath);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      const start = match[1] !== '' ? parseInt(match[1], 10) : 0;
      let end = match[2] !== '' ? parseInt(match[2], 10) : total - 1;
      if (Number.isFinite(start) && start < total) {
        end = Math.min(end, total - 1);
        const chunkLen = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunkLen));
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
  }
  res.setHeader('Content-Length', String(total));
  fs.createReadStream(filePath).pipe(res);
}

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   paths: object,
 *   soDestaMaquina: Function,
 *   porta: number,
 * }} deps
 */
function registrarRotasApresentacao(expressApp, deps) {
  const { paths, soDestaMaquina, porta } = deps;

  apresentacaoVideosDirPath =
    typeof paths.apresentacaoVideosDir === 'function' ? paths.apresentacaoVideosDir() : '';
  apresentacaoMidiasDirPath =
    typeof paths.apresentacaoMidiasDir === 'function' ? paths.apresentacaoMidiasDir() : '';
  for (const dir of [apresentacaoVideosDirPath, apresentacaoMidiasDirPath]) {
    if (!dir) continue;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function urlMidiaApresentacao(id) {
    return `http://127.0.0.1:${porta}/api/apresentacao/midia/${encodeURIComponent(id)}`;
  }

  expressApp.get('/api/apresentacao/state', (_req, res) => {
    try {
      const out = apresentacaoStateMem && typeof apresentacaoStateMem === 'object' ? apresentacaoStateMem : {};
      res.json(out);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/apresentacao/state', (req, res) => {
    try {
      apresentacaoStateMem =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Importa uma mídia do modo Apresentação copiando o ficheiro — sem Base64 pelo meio.
   *
   * O caminho antigo era: o painel lia o ficheiro inteiro, transformava-o numa string
   * Base64 (~1,33x o tamanho), embrulhava-a em JSON e mandava-a por HTTP; deste lado o
   * body-parser guardava tudo em memória e descodificava de volta. Medido: um MP3 de
   * 7 MB custava ~92 ms e ~47 MB de heap; um vídeo de 100 MB, 1,4 s e 667 MB — que num
   * PC de 4 GB é o que faz a máquina ir para a memória virtual. `fs.copyFile` faz o
   * mesmo trabalho em 5,6 ms e 203 ms, e sem ocupar memória nenhuma.
   *
   * Só da própria máquina: o corpo traz um caminho de ficheiro, e aceitar caminhos
   * arbitrários da rede daria a qualquer aparelho da LAN uma forma de ler ficheiros
   * deste PC — bastava mandar copiar e depois pedir o GET.
   */
  expressApp.post('/api/apresentacao/midia/importar', soDestaMaquina, (req, res) => {
    void (async () => {
      try {
        const id = String((req.body && req.body.id) || '').trim();
        const origem = String((req.body && req.body.filePath) || '').trim();
        if (!id || !origem) {
          return res.status(400).json({ ok: false, erro: 'id e filePath são obrigatórios' });
        }
        if (!apresentacaoMidiasDirPath) {
          return res.status(500).json({ ok: false, erro: 'pasta de mídias indisponível' });
        }
        const ext = path.extname(origem).toLowerCase();
        if (!EXTENSOES_MIDIA_APRESENTACAO.has(ext)) {
          return res
            .status(400)
            .json({ ok: false, erro: `extensão não suportada: ${ext || '(nenhuma)'}` });
        }
        const safe = id.replace(/[^\w.-]+/g, '_');
        const destino = path.join(apresentacaoMidiasDirPath, `${safe}${ext}`);
        await fs.promises.mkdir(apresentacaoMidiasDirPath, { recursive: true });
        /* Mesmo id com outra extensão deixaria dois ficheiros a responder ao mesmo GET. */
        const anterior = resolverArquivoMidiaApresentacao(id);
        if (anterior && anterior !== destino) {
          try {
            await fs.promises.unlink(anterior);
          } catch (_) {
            // intencional — o que interessa é a cópia nova ficar de pé
          }
        }
        await fs.promises.copyFile(origem, destino);
        const stat = await fs.promises.stat(destino);
        res.json({
          ok: true,
          url: urlMidiaApresentacao(id),
          bytes: stat.size,
          mime: mimePorCaminhoMidia(destino),
        });
      } catch (e) {
        if (!res.headersSent) {
          res.status(500).json({ ok: false, erro: (e && e.message) || String(e) });
        }
      }
    })();
  });

  /** Serve a mídia importada. Em fluxo e com Range — o player pede aos pedaços. */
  expressApp.get('/api/apresentacao/midia/:id', (req, res) => {
    try {
      const arquivo = resolverArquivoMidiaApresentacao(req.params.id);
      if (!arquivo) return res.status(404).end();
      return enviarMidiaApresentacaoComRange(req, res, arquivo, mimePorCaminhoMidia(arquivo));
    } catch (_) {
      return res.status(500).end();
    }
  });

  expressApp.put('/api/apresentacao/video/:id', (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const data = String(req.body?.data || '');
      let mime = String(req.body?.mime || 'video/mp4');
      if (!id || !data) {
        return res.status(400).json({ ok: false, erro: 'id e data são obrigatórios' });
      }
      let b64 = data;
      const m = data.match(/^data:([^;]+);base64,(.+)$/i);
      if (m) {
        mime = m[1] || mime;
        b64 = m[2];
      }
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length) {
        return res.status(400).json({ ok: false, erro: 'vídeo vazio' });
      }
      /*
       * Só disco. Guardar também o Buffer aqui deixava o vídeo inteiro residente na RAM
       * do processo principal — 667 MB medidos para um ficheiro de 100 MB — e o GET já
       * preferia o disco de qualquer maneira. Era despesa pura.
       */
      salvarVideoApresentacaoNoDisco(id, buf, mime);
      const url = `http://127.0.0.1:${porta}/api/apresentacao/video/${encodeURIComponent(id)}`;
      res.json({ ok: true, url });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /**
   * Rota antiga, mantida para os vídeos que versões anteriores gravaram e para o app de
   * celular. Serve do disco, como a rota nova — não há mais cópia em memória.
   */
  expressApp.get('/api/apresentacao/video/:id', (req, res) => {
    try {
      const arquivo = resolverArquivoMidiaApresentacao(req.params.id);
      if (!arquivo) return res.status(404).end();
      return enviarMidiaApresentacaoComRange(req, res, arquivo, mimePorCaminhoMidia(arquivo));
    } catch (_) {
      return res.status(500).end();
    }
  });
}

module.exports = { registrarRotasApresentacao };
