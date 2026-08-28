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
 * Print the official document by rendering it inside a hidden, off-screen
 * iframe (not a pop-up, so it is never blocked) and invoking the native print
 * dialog on that frame. The preview shows exactly the on-screen document and
 * "Save as PDF" produces a crisp vector PDF identical to the web view.
 */
function printDocument(selector: string, title: string) {
  const root = document.querySelector(selector) as HTMLElement | null;
  if (!root) {
    console.warn(`[officialPdf] wrapper not found: ${selector}`);
    return;
  }
  const css = selector === ".er-doc-wrapper" ? electoralReturnCss : declarationCss;

  // Reuse one hidden iframe to avoid repeated DOM churn.
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

  // Print once the frame content has settled (fonts/images).
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

/** Download / print the Declaration of Results document currently shown. */
export function downloadDeclarationPdf(title: string) {
  printDocument(".decl-doc-wrapper", title);
}

/** Download / print the Official Electoral Return document currently shown. */
export function downloadElectoralReturnPdf(title: string) {
  printDocument(".er-doc-wrapper", title);
}
