/**
 * Grelha de slides do painel: instância de `criarSlidesGrelha` e as funções de zoom, colunas por linha,
 * encaixe e revelação de chips. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasSlidesGrelhaPainel`.
 */
import { criarSlidesGrelha } from '../modules/slidesGrelha.js';
import { estadoPainel } from './estadoPainel.js';
import { ehModoSlidesOperador } from './modosUi.js';

export const slidesGrelha = criarSlidesGrelha({
  ehModoSlidesOperador,
  getMusicaAtiva: () => estadoPainel.musicaAtiva,
  getEstrofeAtiva: () => estadoPainel.estrofeAtiva,
  getFaixaHabilitada: () => estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getProjecaoEmitida: () => estadoPainel.projecaoMusicaEmitidaNoServidor,
});

export function podeAtualizarSomenteAtivoFaixaSlides() { return slidesGrelha.podeAtualizarSomenteAtivoFaixaSlides(); }
export function atualizarSomenteAtivoFaixaSlides() { slidesGrelha.atualizarSomenteAtivoFaixaSlides(); }
export function revelarChipEstrofeFocado(idx, opts) { slidesGrelha.revelarChipEstrofeFocado(idx, opts); }
export function ajustarEncaixeGrelhaSlidesModoSlides() { slidesGrelha.ajustarEncaixeGrelhaSlidesModoSlides(); }
export function setupSlidesGridViewportFitObserver() { slidesGrelha.setupSlidesGridViewportFitObserver(); }
export function initSlidesChipZoomFromStorage() { slidesGrelha.initSlidesChipZoomFromStorage(); }
export function setupSlidesChipZoomButtons() { slidesGrelha.setupSlidesChipZoomButtons(); }
export function initSlidesPorLinhaFromStorage() { slidesGrelha.initSlidesPorLinhaFromStorage(); }
export function setupSlidesPorLinhaButtons() { slidesGrelha.setupSlidesPorLinhaButtons(); }
