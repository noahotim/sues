import declarationCss from "../declaration.css?raw";
import electoralReturnCss from "../electoralReturn.css?raw";

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Open the official document in a dedicated print window containing ONLY the
 * document markup + its stylesheet, then invoke the native print dialog.
 * The preview shows exactly what is on screen, and "Save as PDF" produces a
 * crisp vector PDF identical to the web view.
 */
function openPrintWindow(selector: string, title: string) {
  const root = document.querySelector(selector) as HTMLElement | null;
  if (!root) {
    console.warn(`[officialPdf] wrapper not found: ${selector}`);
    return;
  }
  const css = selector === ".er-doc-wrapper" ? electoralReturnCss : declarationCss;

  const win = window.open("", "_blank", "noopener=no");
  if (!win) {
    alert("Your browser blocked the pop-up. Please allow pop-ups and try again.");
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

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  // Let fonts/images settle before printing.
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* no-op */
    }
  }, 1500);
}

/** Download / print the Declaration of Results document currently shown. */
export function downloadDeclarationPdf(title: string) {
  openPrintWindow(".decl-doc-wrapper", title);
}

/** Download / print the Official Electoral Return document currently shown. */
export function downloadElectoralReturnPdf(title: string) {
  openPrintWindow(".er-doc-wrapper", title);
}
