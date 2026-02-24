import fs from 'fs';
import path from 'path';

/**
 * Save a PDF buffer to data/articles/<bookmarkId>/<safeFilename>.pdf.
 * Creates the directory if needed. Returns relative path (from dataDir) and full path.
 */
export async function savePdfForBookmark(
  dataDir: string,
  bookmarkId: string,
  buffer: Buffer
): Promise<{ relativePath: string; fullPath: string; urlPath: string }> {
  const safeId = bookmarkId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200) || 'unknown';
  const dir = path.join(dataDir, 'articles', safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = `article_${Date.now()}.pdf`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buffer);
  const relativePath = path.join('articles', safeId, filename);
  const urlPath = `${safeId}/${filename}`;
  return { relativePath, fullPath, urlPath };
}

/**
 * Extract text from a PDF file using pdf-parse. Returns concatenated document text.
 */
export async function extractTextFromPdf(pdfPath: string): Promise<string> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }
  const buffer = fs.readFileSync(pdfPath);
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}
