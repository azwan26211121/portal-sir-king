import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  const pending = imgs
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 2500);
        })
    );
  return Promise.all(pending).then(() => undefined);
}

export async function buildPaperPdfBlob(containerEl: HTMLElement): Promise<Blob> {
  await waitForImages(containerEl);

  const blocks = Array.from(
    containerEl.querySelectorAll<HTMLElement>('[data-pdf-block="true"]')
  );
  const targets = blocks.length > 0 ? blocks : [containerEl];

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const marginX = 12;
  const marginY = 12;
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const usableWidthMm = pageWidthMm - marginX * 2;
  const usableHeightMm = pageHeightMm - marginY * 2;

  let cursorY = marginY;

  for (const block of targets) {
    if (block.classList.contains('print:hidden')) continue;
    const rect = block.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const canvas = await html2canvas(block, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      ignoreElements: (el) => {
        if (!(el instanceof HTMLElement)) return false;
        return el.classList.contains('print:hidden');
      },
      onclone: (_doc, clonedEl) => {
        if (clonedEl instanceof HTMLElement) {
          clonedEl.style.boxShadow = 'none';
          clonedEl.style.borderRadius = '0';
          if (clonedEl.id === 'jpk-printable-paper') {
            clonedEl.style.border = 'none';
            clonedEl.style.padding = '0';
          }
        }
      },
    });

    if (canvas.width === 0 || canvas.height === 0) continue;

    const imgHeightMm = (canvas.height * usableWidthMm) / canvas.width;

    // Start a fresh page if this block doesn't fit cleanly in remaining space
    if (cursorY > marginY + 1 && cursorY + imgHeightMm > marginY + usableHeightMm) {
      doc.addPage();
      cursorY = marginY;
    }

    if (imgHeightMm <= usableHeightMm) {
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', marginX, cursorY, usableWidthMm, imgHeightMm, undefined, 'FAST');
      cursorY += imgHeightMm + 3;
    } else {
      // Slice oversized block vertically across pages
      const pxPerMm = canvas.width / usableWidthMm;
      const maxSlicePx = Math.floor(usableHeightMm * pxPerMm);
      let offsetPx = 0;

      while (offsetPx < canvas.height) {
        if (cursorY > marginY + 1) {
          doc.addPage();
          cursorY = marginY;
        }
        const sliceHeightPx = Math.min(maxSlicePx, canvas.height - offsetPx);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            offsetPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
        }
        const sliceHeightMm = (sliceHeightPx * usableWidthMm) / canvas.width;
        const sliceData = sliceCanvas.toDataURL('image/png');
        doc.addImage(
          sliceData,
          'PNG',
          marginX,
          cursorY,
          usableWidthMm,
          sliceHeightMm,
          undefined,
          'FAST'
        );
        offsetPx += sliceHeightPx;
        cursorY += sliceHeightMm + 3;
      }
    }
  }

  return doc.output('blob');
}

export async function exportPaperElementToPdf(
  containerEl: HTMLElement,
  fileName: string
): Promise<Blob> {
  const blob = await buildPaperPdfBlob(containerEl);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${safeName || 'Kertas-Tugasan'}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  return blob;
}
