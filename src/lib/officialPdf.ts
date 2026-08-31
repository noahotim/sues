import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import declarationCss from "../declaration.css?raw";
import electoralReturnCss from "../electoralReturn.css?raw";

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

const IFRAME_ID = "official-document-print-frame";

const PAPER: Record<string, string> = {
  decl: "#ffffff",
  er: "#ffffff",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/*  PRINT DIALOG (Print / Save as PDF button) — hidden iframe          */
/* ------------------------------------------------------------------ */

/**
 * Open the official document in a hidden off-screen iframe (never blocked as a
 * pop-up) and invoke the native print dialog. The preview and "Save as PDF"
 * output are a crisp vector copy identical to the on-screen document.
 * NOTE: this opens the browser's print dialog - it does NOT auto-save a file.
 */
function printDocument(wrapperSelector: string, css: string, title: string) {
  const root = document.querySelector(wrapperSelector) as HTMLElement | null;
  if (!root) {
    console.warn(`[officialPdf] wrapper not found: ${wrapperSelector}`);
    return;
  }

  let frame = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = IFRAME_ID;
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.top = "0";
    frame.style.left = "-10000px";
    frame.style.width = "794px"; // 210mm
    frame.style.height = "1123px"; // 297mm
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);
  }

  const frameDoc = frame.contentDocument;
  const frameWin = frame.contentWindow;
  if (!frameDoc || !frameWin) {
    alert("Unable to open the print view in this browser.");
    return;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  ${FONT_LINK}
  <style>${css}</style>
</head>
<body>
  ${root.innerHTML}
</body>
</html>`;

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      /* no-op */
    }
  };
  frame.addEventListener("load", () => setTimeout(doPrint, 300), { once: true });
  setTimeout(doPrint, 1500);
}

/* ------------------------------------------------------------------ */
/*  TRUE DOWNLOAD (Download PDF button) — html2canvas + jsPDF          */
/* ------------------------------------------------------------------ */

/** Isolate a sheet in an off-screen host and capture it as a canvas. */
async function captureSheet(sheet: HTMLElement, key: "decl" | "er"): Promise<HTMLCanvasElement> {
  const clone = sheet.cloneNode(true) as HTMLElement;
  // Remove any position:absolute children offsetting outside the clone bounds
  // could cause bleed; html2canvas handles the clone's own bounding box.
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "top:0",
    "left:-10000px",
    "z-index:-1",
    "width:210mm",
    "height:297mm",
    "overflow:visible",
    "background:" + PAPER[key],
    "pointer-events:none",
  ].join(";");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    // Wait briefly for webfonts/images to settle so the capture is not blank.
    await new Promise((r) => setTimeout(r, 100));
    return await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: PAPER[key],
      width: clone.offsetWidth,
      height: clone.offsetHeight,
      windowWidth: clone.offsetWidth,
      windowHeight: clone.offsetHeight,
    });
  } finally {
    host.remove();
  }
}

/**
 * Build a multi-page A4 PDF from every sheet in the document and trigger a
 * real file download via the browser.
 */
async function buildAndDownload(
  wrapperSelector: string,
  sheetSelector: string,
  key: "decl" | "er",
  filename: string,
) {
  const wrapper = document.querySelector(wrapperSelector) as HTMLElement | null;
  if (!wrapper) return;
  const sheets = Array.from(wrapper.querySelectorAll<HTMLElement>(sheetSelector));
  if (sheets.length === 0) return;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;

  for (let i = 0; i < sheets.length; i++) {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await captureSheet(sheets[i], key);
    } catch (err) {
      console.warn("[officialPdf] sheet capture failed", err);
      continue;
    }
    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage();
    // Fit the sheet exactly to the A4 page (edge-to-edge, no margins), so the
    // full-width header band reaches the physical page edges like the print.
    pdf.addImage(img, "JPEG", 0, 0, pageW, pageH);
  }

  pdf.save(filename);
}

/** Download the Declaration of Results as a PDF file (Download PDF button). */
export async function downloadDeclarationPdf(title: string) {
  const safe = title.replace(/[\\/:*?"<>|]+/g, "").trim() || "Declaration-of-Results";
  await buildAndDownload(
    ".decl-doc-wrapper",
    ".decl-sheet",
    "decl",
    `${safe}-Declaration-of-Results.pdf`,
  );
}

/** Download the Official Electoral Return as a PDF file (Download PDF button). */
export async function downloadElectoralReturnPdf(title: string) {
  const safe = title.replace(/[\\/:*?"<>|]+/g, "").trim() || "Official-Electoral-Return";
  await buildAndDownload(
    ".er-doc-wrapper",
    ".er-sheet",
    "er",
    `${safe}-Official-Electoral-Return.pdf`,
  );
}

/** Print dialog for the Declaration of Results (Print / Save as PDF button). */
export function printDeclarationPdf(title: string) {
  printDocument(".decl-doc-wrapper", declarationCss, title);
}

/** Print dialog for the Official Electoral Return (Print / Save as PDF button). */
export function printElectoralReturnPdf(title: string) {
  printDocument(".er-doc-wrapper", electoralReturnCss, title);
}
