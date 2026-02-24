import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { savePdfForBookmark, extractTextFromPdf } from '../../lib/pdfService.js';

describe('pdfService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `xmarks-pdf-test-${Date.now()}`);
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe('savePdfForBookmark', () => {
    it('creates directory and writes file', async () => {
      const buffer = Buffer.from('%PDF-1.4\n%%EOF');
      const result = await savePdfForBookmark(dataDir, 'bookmark-123', buffer);
      expect(result.relativePath).toContain('articles');
      expect(result.relativePath).toContain('bookmark-123');
      expect(result.relativePath.endsWith('.pdf')).toBe(true);
      expect(result.fullPath).toBe(path.join(dataDir, result.relativePath));
      expect(fs.existsSync(result.fullPath)).toBe(true);
      expect(fs.readFileSync(result.fullPath).toString()).toBe('%PDF-1.4\n%%EOF');
    });

    it('returns urlPath for frontend', async () => {
      const buffer = Buffer.from('%PDF-1.4\n%%EOF');
      const result = await savePdfForBookmark(dataDir, 'id_abc', buffer);
      expect(result.urlPath).toMatch(/^id_abc\/article_\d+\.pdf$/);
      expect(result.urlPath).not.toContain('\\');
    });

    it('sanitizes bookmark id in path', async () => {
      const buffer = Buffer.from('%PDF-1.4\n%%EOF');
      const result = await savePdfForBookmark(dataDir, 'bad/id\\here', buffer);
      expect(result.fullPath).toContain('bad_id_here');
      expect(fs.existsSync(result.fullPath)).toBe(true);
    });
  });

  describe('extractTextFromPdf', () => {
    it('throws when file does not exist', async () => {
      await expect(extractTextFromPdf(path.join(dataDir, 'nonexistent.pdf'))).rejects.toThrow(/not found/);
    });

    it('returns string for valid PDF file', async () => {
      const pdfPath = path.join(dataDir, 'sample.pdf');
      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
      );
      fs.writeFileSync(pdfPath, minimalPdf);
      const text = await extractTextFromPdf(pdfPath);
      expect(typeof text).toBe('string');
    });
  });
});
