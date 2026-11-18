// Browser entry point: reads a PDF File and returns the parsed statement.
// pdfjs is loaded lazily so it does not weigh on the app start-up.

import { extractItems } from "./extract";
import { parseIntesaItems } from "./intesa";
import type { ParsedStatement } from "./types";

export async function loadStatement(file: File): Promise<ParsedStatement> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    return parseIntesaItems(await extractItems(doc));
  } finally {
    void doc.destroy();
  }
}
