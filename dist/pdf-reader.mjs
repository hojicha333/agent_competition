import { getDocument, GlobalWorkerOptions } from './vendor/pdf.mjs';
import { pdfItems } from './engine.mjs';

GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;

export async function readPdf(file, readPage) {
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) {
    throw new Error('请选择有效的 PDF 文件。');
  }

  const loading = getDocument({
    data,
    cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  try {
    const pdf = await loading.promise;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const { width, height } = page.getViewport({ scale: 1 });
        readPage(pdfItems(await page.getTextContent(), height), number, width, pdf.numPages);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loading.destroy();
  }
}
