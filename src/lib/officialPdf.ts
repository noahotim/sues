/**
 * Render the on-screen official documents (Declaration of Results & Official
 * Electoral Return) to PDF by rasterising the actual DOM sheets with html2canvas.
 * This guarantees the downloaded PDF looks identical to the web view — no blank
 * pages, no overlapping text.
 */

interface DownloadOptions {
  title: string;
  /** CSS selector for the wrapper containing the .*-sheet elements. */
  wrapper: string;
  /** CSS selector for each A4 sheet to rasterise. */
  sheet: string;
  /** Filename prefix. */
  prefix: string;
}

async function downloadSheetsAsPdf({ title, wrapper, sheet, prefix }: DownloadOptions) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const JsPDF = jsPDF;
  const html2canvas = html2canvasMod.default ?? html2canvasMod;

  const root = document.querySelector(wrapper);
  if (!root) {
    console.warn(`[officialPdf] wrapper not found: ${wrapper}`);
    return;
  }
  const sheets = Array.from(root.querySelectorAll(sheet)) as HTMLElement[];
  if (sheets.length === 0) {
    console.warn(`[officialPdf] no sheets found for selector: ${sheet}`);
    return;
  }

  const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const A4_W = 210;
  const A4_H = 297;

  for (let i = 0; i < sheets.length; i++) {
    // Temporarily force precise A4 rendering: remove shadows/margins for capture.
    const canvas = await html2canvas(sheets[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.93);
    const ratio = canvas.width / canvas.height;
    const imgW = A4_W;
    let imgH = imgW / ratio;
    if (imgH > A4_H) imgH = A4_H;

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, imgW, imgH);
  }

  const safe = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "official-document";
  pdf.save(`${prefix}-${safe}.pdf`);
}

/** Download the Declaration of Results document currently shown on screen. */
export function downloadDeclarationPdf(title: string) {
  return downloadSheetsAsPdf({
    title,
    wrapper: ".decl-doc-wrapper",
    sheet: ".decl-sheet",
    prefix: "SUES-Declaration-of-Results",
  });
}

/** Download the Official Electoral Return document currently shown on screen. */
export function downloadElectoralReturnPdf(title: string) {
  return downloadSheetsAsPdf({
    title,
    wrapper: ".er-doc-wrapper",
    sheet: ".er-sheet",
    prefix: "SUES-Official-Electoral-Return",
  });
}
