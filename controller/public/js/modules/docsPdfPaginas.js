/**
 * Páginas de um PDF para o modo DOCS — miniaturas e prévia, via pdf.js.
 *
 * O Lyra não tinha nada que renderizasse páginas: nas Mídias o PDF vai para o telão
 * dentro de um iframe (visualizador do Chromium), que mostra o documento inteiro e não
 * dá página a página. Aqui cada página é desenhada num canvas e sai como imagem — é isso
 * que alimenta a faixa de miniaturas, a prévia central e o que segue para os monitores.
 *
 * A biblioteca está em `public/vendor/pdfjs` (build «legacy», carregada do disco): o
 * controlador tem de abrir documentos numa igreja sem internet.
 *
 * PowerPoint e Word não entram aqui. Renderizá-los exigiria conversão externa
 * (LibreOffice ou Office instalado na máquina); enquanto isso não existe, o modo DOCS
 * diz-lhe para exportar em PDF — a mesma orientação que o modo Mídias já dá.
 */

let pdfjsPromessa = null;

function carregarPdfJs() {
  if (pdfjsPromessa) return pdfjsPromessa;
  pdfjsPromessa = import('../../vendor/pdfjs/pdf.min.mjs')
    .then((mod) => {
      const lib = mod && mod.getDocument ? mod : mod?.default;
      if (!lib || !lib.getDocument) throw new Error('pdf.js indisponível');
      lib.GlobalWorkerOptions.workerSrc = new URL(
        '../../vendor/pdfjs/pdf.worker.min.mjs',
        import.meta.url
      ).href;
      return lib;
    })
    .catch((e) => {
      pdfjsPromessa = null;
      throw e;
    });
  return pdfjsPromessa;
}

/** Extensões que este módulo sabe abrir. */
export function ehDocumentoRenderizavel(nome) {
  return String(nome || '').toLowerCase().endsWith('.pdf');
}

/**
 * Abre um PDF e devolve um punho para desenhar páginas.
 *
 * @param {Blob|ArrayBuffer} dados ficheiro tal como foi importado
 * @returns {Promise<{numPaginas: number, renderizarPagina: Function, destruir: Function}>}
 */
export async function abrirDocumentoPdf(dados) {
  const lib = await carregarPdfJs();
  const buffer = dados instanceof Blob ? await dados.arrayBuffer() : dados;
  const doc = await lib.getDocument({ data: new Uint8Array(buffer) }).promise;

  /**
   * Desenha uma página e devolve-a como imagem.
   *
   * @param {number} numero 1-based, como no pdf.js
   * @param {number} larguraAlvo largura em pixels do resultado
   * @param {number} qualidade qualidade do JPEG (0–1)
   * @returns {Promise<{src: string, largura: number, altura: number}|null>}
   */
  async function renderizarPagina(numero, larguraAlvo, qualidade = 0.85) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1 || n > doc.numPages) return null;
    const pagina = await doc.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const escala = Math.max(0.05, Number(larguraAlvo) / base.width);
    const viewport = pagina.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    /* Fundo branco: o PDF não pinta o papel, e sem isto o JPEG sai com fundo preto. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    const src = canvas.toDataURL('image/jpeg', qualidade);
    /* Liberta a página e o canvas: um documento de 200 páginas não pode ficar todo em heap. */
    try { pagina.cleanup(); } catch (_) { /* intencional */ }
    canvas.width = 0;
    canvas.height = 0;
    return { src, largura: viewport.width, altura: viewport.height };
  }

  function destruir() {
    try { void doc.destroy(); } catch (_) { /* intencional */ }
  }

  return { numPaginas: doc.numPages, renderizarPagina, destruir };
}
