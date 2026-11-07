/** Geometria local da prévia: nunca confia em coordenadas de outra resolução. */
export function limitarPreviaHome(saved = {}, viewport = {}) {
  const finite = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const vw = Math.max(1, finite(viewport.width, 1024));
  const vh = Math.max(1, finite(viewport.height, 640));
  const margin = Math.min(8, vw / 4, vh / 4);
  const top = Math.min(Math.max(margin, finite(viewport.top, margin)), vh - margin);
  const availableH = Math.max(1, vh - top - margin);
  // 104 px para título/controles; a imagem conserva a proporção 16:9.
  const maxW = Math.max(1, Math.min(680, vw - margin * 2, (availableH - 104) * 16 / 9));
  const width = Math.min(maxW, Math.max(Math.min(260, maxW), finite(saved.width, 380)));
  const height = Math.min(availableH, width * 9 / 16 + 104);
  const x = Math.min(vw - width - margin, Math.max(margin, finite(saved.x, (vw - width) / 2)));
  const y = Math.min(vh - height - margin, Math.max(top, finite(saved.y, vh - height - 24)));
  return { x, y, width, height };
}
