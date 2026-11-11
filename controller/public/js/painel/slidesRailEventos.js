/**
 * Arraste da faixa de slides e da prévia (mousemove/mouseup) e ajuste ao redimensionar a janela. Movido
 * verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasSlidesRailEventos`.
 */
import { LS_SLIDES_PREVIEW_H_PX, LS_SLIDES_RAIL_PX } from '../modules/chavesArmazenamentoLocal.js';
import { ajustarEncaixeGrelhaSlidesModoSlides } from './slidesGrelhaPainel.js';
import { alturaPreviewModAtualPx, aplicarAlturaPreviewMod, clampSlidesRailHeight } from './slidesRailLayout.js';
import { estadoPainel } from './estadoPainel.js';
import { reaplicarAlturasEstrofesEditor } from './editorEstrofes.js';
import { reaplicarFontesPreviewPainel } from './tipografiaPainelPreview.js';

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarSlidesRailEventos() {
  document.addEventListener('mousemove', (e) => {
    if (!estadoPainel.slidesRailDrag.active) return;
    if (estadoPainel.slidesRailDrag.alvo === 'previa') {
      /* Para baixo (dy > 0) = prévias maiores, grelha menor. */
      aplicarAlturaPreviewMod(estadoPainel.slidesRailDrag.startH + (e.clientY - estadoPainel.slidesRailDrag.startY));
      return;
    }
    const dy = estadoPainel.slidesRailDrag.startY - e.clientY;
    const nh = clampSlidesRailHeight(estadoPainel.slidesRailDrag.startH + dy);
    document.documentElement.style.setProperty('--slides-rail-height', nh + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!estadoPainel.slidesRailDrag.active) return;
    estadoPainel.slidesRailDrag.active = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (estadoPainel.slidesRailDrag.alvo === 'previa') {
      localStorage.setItem(LS_SLIDES_PREVIEW_H_PX, String(alturaPreviewModAtualPx()));
    } else {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
      const px = parseInt(raw, 10);
      if (Number.isFinite(px)) localStorage.setItem(LS_SLIDES_RAIL_PX, String(px));
    }
    queueMicrotask(() => {
      if (document.hidden) return;
      ajustarEncaixeGrelhaSlidesModoSlides();
      reaplicarFontesPreviewPainel();
      reaplicarAlturasEstrofesEditor();
    });
  });
  window.addEventListener('resize', () => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
    const px = parseInt(raw, 10);
    if (Number.isFinite(px)) {
      document.documentElement.style.setProperty('--slides-rail-height', clampSlidesRailHeight(px) + 'px');
    }
    if (document.body.style.getPropertyValue('--preview-mod-card-h')) {
      aplicarAlturaPreviewMod(alturaPreviewModAtualPx());
    }
    if (document.hidden) return;
    queueMicrotask(() => {
      ajustarEncaixeGrelhaSlidesModoSlides();
      reaplicarFontesPreviewPainel();
      reaplicarAlturasEstrofesEditor();
    });
  });
}
