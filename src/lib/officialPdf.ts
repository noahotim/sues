import declarationCss from "../declaration.css?raw";
import electoralReturnCss from "../electoralReturn.css?raw";

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

const IFRAME_ID = "official-document-print-frame";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the official document inside a hidden off-screen iframe (never blocked
 * as a pop-up) using the browser's own rendering engine, then invoke the native
 * print/PDF dialog. This produces a copy that is pixel-identical to the on-screen
 * HTML. Choosing "Save as PDF" in the dialog downloads that exact file.
 */
function openPrintDialog(wrapperSelector: string, css: string, title: string) {
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

  let opened = false;
  const doOpen = () => {
    if (opened) return;
    opened = true;
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      /* no-op */
    }
  };
  frame.addEventListener("load", () => setTimeout(doOpen, 300), { once: true });
  setTimeout(doOpen, 1500);
}

/** Download / print the Declaration of Results exactly as the HTML renders. */
export function downloadDeclarationPdf(title: string) {
  openPrintDialog(".decl-doc-wrapper", declarationCss, title);
}

/** Download / print the Official Electoral Return exactly as the HTML renders. */
export function downloadElectoralReturnPdf(title: string) {
  openPrintDialog(".er-doc-wrapper", electoralReturnCss, title);
}

// Backwards-compatible aliases for the "Print / Save as PDF" buttons.
export const printDeclarationPdf = downloadDeclarationPdf;
export const printElectoralReturnPdf = downloadElectoralReturnPdf;
