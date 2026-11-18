import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "./types";

/** Collect every text run of a PDF together with its position. */
export async function extractItems(doc: PDFDocumentProxy): Promise<TextItem[]> {
  const items: TextItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || it.str.trim() === "") continue;
      items.push({ page, x: it.transform[4], y: it.transform[5], str: it.str });
    }
  }
  return items;
}
