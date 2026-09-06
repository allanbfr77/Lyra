/**
 * Protocolo de mídia do modo apresentação (tipo, URL, item, aviso do card 6).
 *
 * Extraído do AppCore (secção B) sem mudar o critério: Windows com MIME vazio
 * classifica pela extensão; `<img>` só aceita imagem; URL da API própria
 * reconstrói-se pelo id. Grelha, player e playlist continuam no núcleo.
 */

export const APRESENTACAO_CARD6_AVISO_CFG_PADRAO = Object.freeze({
  fontSize: 5.5,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  transparentBackground: false,
  wrapLongLines: true,
  italic: false,
  verticalPosition: 'center',
});

export function detectarKindApresentacaoPorMimeOuNome(mime, nome) {
  const m = String(mime || '').toLowerCase();
  const n = String(nome || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  /* Windows / alguns browsers devolvem type vazio para .jpg/.png — inferir pela extensão. */
  if (/\.(jpe?g|png|gif|webp|bmp|svg|avif|ico)(\?|$)/i.test(n)) return 'image';
  if (m.startsWith('video/')) return 'video';
  /* Mesmo caso no Windows para .mp4/.webm com type vazio. */
  if (/\.(mp4|webm|mov|mkv|m4v|ogv|avi)(\?|$)/i.test(n)) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  /* Mesmo caso do vídeo: o Windows devolve type vazio para .mp3/.wav. */
  if (/\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|wma)(\?|$)/i.test(n)) return 'audio';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'iframe';
}

export function ehArquivoPowerPointLocal(mime, nome) {
  const n = String(nome || '').toLowerCase();
  const m = String(mime || '');
  return /\.pptx?$/.test(n) || /\.odp$/.test(n) || m.includes('powerpoint') || m.includes('presentation');
}

export function rotuloTipoMidiaApresentacao(kind) {
  const k = String(kind || '').toLowerCase();
  const map = {
    image: 'Imagem',
    video: 'Vídeo',
    audio: 'Áudio',
    pdf: 'PDF',
    iframe: 'Apresentação web',
    aviso: 'Aviso',
  };
  return map[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Arquivo');
}

export function svgIconeTipoMidiaApresentacao(kind) {
  const k = String(kind || '').toLowerCase();
  const c = 'ap-card-kind-ic';
  if (k === 'image') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }
  if (k === 'video') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>`;
  }
  if (k === 'pdf') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>`;
  }
  if (k === 'iframe') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }
  if (k === 'aviso') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 8v4M12 16h.01"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
  }
  return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
}

/**
 * URL segura para `<img>` nos cards: só conteúdo **imagem** (`data:image/…`, `blob:` ou
 * `http(s)://…/api/apresentacao/media/id`). PDF/vídeo/áudio usam o mesmo endpoint no servidor
 * mas não são renderizáveis em `<img>` — sem o filtro por tipo aparecia ícone de imagem partida.
 */
export function srcImagemApresentacaoSeguro(src, itemOuKind) {
  const s = String(src || '').trim();
  if (!s) return '';
  const sl = s.toLowerCase();
  if (sl.startsWith('javascript:') || sl.startsWith('vbscript:')) return '';
  const kind =
    itemOuKind && typeof itemOuKind === 'object'
      ? String(itemOuKind.kind || '').toLowerCase()
      : String(itemOuKind || '').toLowerCase();
  const mime =
    itemOuKind && typeof itemOuKind === 'object' ? String(itemOuKind.mime || '').toLowerCase() : '';
  const tratarComoImagem = kind === 'image' || mime.startsWith('image/');
  if (sl.startsWith('data:image/')) {
    const comma = s.indexOf(',');
    const meta = comma === -1 ? s : s.slice(0, comma);
    // eslint-disable-next-line no-control-regex -- intencional: rejeitar control chars em URL de imagem
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(meta)) return '';
    return s;
  }
  if (sl.startsWith('blob:') && /^blob:[^"'<>\s]+$/i.test(s)) {
    if (!tratarComoImagem) return '';
    return s;
  }
  try {
    const u = new URL(s, typeof window !== 'undefined' ? window.location.href : undefined);
    if (!/^https?:$/i.test(u.protocol)) return '';
    const p = (u.pathname || '').replace(/\/+$/, '');
    if (!/\/api\/apresentacao\/media\/[^/]+$/i.test(p)) return '';
    // eslint-disable-next-line no-control-regex -- intencional: rejeitar control chars em URL de imagem
    if (/[\u0000-\u001f\s"']/.test(s)) return '';
    if (!tratarComoImagem) return '';
    return s;
  } catch (_) {
    return '';
  }
}

export function fmtTempoAudio(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function obterThumbVideoApresentacao(item) {
  const t = String(item?.thumb || '').trim();
  return /^data:image\//i.test(t) ? t : '';
}

/**
 * No modo local os telões são desta máquina: `:3001` já serve o vídeo e `:5510`
 * não tem proxy — manter a URL original.
 *
 * @param {string} url
 * @param {{ local?: boolean, ip?: string }} [opts]
 */
export function reescreverUrlVideoParaTelas(url, opts = {}) {
  const u = String(url || '').trim();
  if (!u) return u;
  if (opts.local) return u;
  const ip = String(opts.ip || '').trim();
  if (!ip) return u;
  return u
    .replace(
      /^https?:\/\/127\.0\.0\.1:3001(?=\/api\/apresentacao\/(?:video|midia)\/)/i,
      `http://${ip}:5510`
    )
    .replace(
      /^https?:\/\/localhost:3001(?=\/api\/apresentacao\/(?:video|midia)\/)/i,
      `http://${ip}:5510`
    );
}

/** URL da mídia importada (áudio ou vídeo). O servidor acha o ficheiro pelo id. */
export function urlMidiaApresentacaoHttpPorId(id, apiBase) {
  const mid = String(id || '').trim();
  if (!mid) return '';
  return `${apiBase}/api/apresentacao/midia/${encodeURIComponent(mid)}`;
}

export function normalizarItemApresentacao(raw, apiBase) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const src = String(raw.src || '').trim();
  const name = String(raw.name || '').trim();
  const filePath = String(raw.filePath || '').trim();
  const thumb = String(raw.thumb || '').trim();
  let kind = String(raw.kind || '').trim();
  if (!id || !name) return null;
  if (!src && !filePath) return null;
  if ((kind === 'video' || kind === 'audio') && !src && filePath) {
    /* src HTTP será restaurado ao reentrar no modo. */
  } else if (!src) return null;
  /* Itens antigos: MIME vazio classificou como iframe mas o src é data:image — corrige para prévia e projeção. */
  if ((!kind || kind === 'iframe') && /^data:image\//i.test(src)) kind = 'image';
  if (!kind) return null;
  /*
   * URL da nossa própria API: reconstruir a partir do id em vez de confiar na gravada.
   * A base pode ter mudado de porta entre sessões, e os ficheiros que versões anteriores
   * gravaram respondiam em `/video/` — a rota nova acha-os na mesma pasta antiga.
   */
  const srcDaApiPropria = /\/api\/apresentacao\/(?:video|midia)\//i.test(src);
  const out = {
    id,
    kind,
    src: !src || srcDaApiPropria ? urlMidiaApresentacaoHttpPorId(id, apiBase) : src,
    mime: String(raw.mime || ''),
    name,
    title: String(raw.title || name),
  };
  if (filePath) out.filePath = filePath;
  if (/^data:image\//i.test(thumb)) out.thumb = thumb;
  return out;
}

export function clonarCfgAvisoCard6Padrao() {
  return { ...APRESENTACAO_CARD6_AVISO_CFG_PADRAO };
}

export function normalizarCorHexCard6Aviso(valor, fallback) {
  const s = String(valor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

export function normalizarCfgAvisoCard6(raw) {
  const base = clonarCfgAvisoCard6Padrao();
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const fontSize = Number(cfg.fontSize);
  if (Number.isFinite(fontSize)) {
    /* Até 40 vh: palavra curta (ex. «ORAÇÃO») de ponta a ponta numa TV 42" 16:9. */
    base.fontSize = Math.min(40, Math.max(2.2, fontSize));
  }
  base.textColor = normalizarCorHexCard6Aviso(cfg.textColor, base.textColor);
  base.backgroundColor = normalizarCorHexCard6Aviso(cfg.backgroundColor, base.backgroundColor);
  base.transparentBackground = cfg.transparentBackground === true;
  base.wrapLongLines = cfg.wrapLongLines !== false;
  base.italic = cfg.italic === true;
  base.verticalPosition =
    cfg.verticalPosition === 'top' || cfg.verticalPosition === 'bottom'
      ? cfg.verticalPosition
      : 'center';
  return base;
}

export function cfgAvisoCard6TemPersonalizacao(raw) {
  const cfg = normalizarCfgAvisoCard6(raw);
  const padrao = APRESENTACAO_CARD6_AVISO_CFG_PADRAO;
  return (
    cfg.fontSize !== padrao.fontSize ||
    cfg.textColor !== padrao.textColor ||
    cfg.backgroundColor !== padrao.backgroundColor ||
    cfg.transparentBackground !== padrao.transparentBackground ||
    cfg.wrapLongLines !== padrao.wrapLongLines ||
    cfg.italic !== padrao.italic ||
    cfg.verticalPosition !== padrao.verticalPosition
  );
}
