/**
 * Article quality harness: compare saved article content to a reference (PDF or text).
 *
 * Env:
 *   REFERENCE_PDF  - Path to reference PDF (text extracted and used as ground truth).
 *   REFERENCE_TEXT - Path to reference .txt or .md file (alternative to PDF).
 *   BOOKMARK_ID    - Bookmark ID to compare, or "latest" for most recent (default: latest).
 *   DB_PATH        - Optional path to bookmarks.db (default: dataDir/bookmarks.db from config).
 *   COVERAGE_THRESHOLD - Fail if word coverage < this 0..1 (default: 0.5).
 *
 * Run: npx tsx scripts/compare-article.ts
 *      REFERENCE_PDF="path/to/article.pdf" BOOKMARK_ID=2025286163641118915 npx tsx scripts/compare-article.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../lib/config.js';
import { initDb, getBookmarks, getAllArticles } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .trim();
}

function getWords(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

async function loadReferenceText(): Promise<string> {
  const pdfPath = process.env.REFERENCE_PDF?.trim();
  let textPath = process.env.REFERENCE_TEXT?.trim();
  if (!textPath && !pdfPath) {
    const defaultText = path.join(PROJECT_ROOT, 'test', 'fixtures', 'koylan-article-full.txt');
    if (fs.existsSync(defaultText)) textPath = defaultText;
  }

  if (textPath) {
    const resolved = path.isAbsolute(textPath) ? textPath : path.join(PROJECT_ROOT, textPath);
    if (!fs.existsSync(resolved)) {
      console.error(`REFERENCE_TEXT file not found: ${resolved}`);
      process.exit(2);
    }
    return fs.readFileSync(resolved, 'utf-8');
  }

  if (pdfPath) {
    const resolved = path.isAbsolute(pdfPath) ? pdfPath : path.join(PROJECT_ROOT, pdfPath);
    if (!fs.existsSync(resolved)) {
      console.error(`REFERENCE_PDF file not found: ${resolved}`);
      process.exit(2);
    }
    const buffer = fs.readFileSync(resolved);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }

  console.error('Set REFERENCE_PDF or REFERENCE_TEXT to a file path.');
  process.exit(2);
}

function loadSavedContent(dbPath: string, bookmarkId: string): { bookmarkId: string; content: string } {
  const db = initDb(dbPath);
  const bookmarks = getBookmarks(db);
  const target =
    bookmarkId === 'latest' || !bookmarkId
      ? bookmarks[0]
      : bookmarks.find((b) => b.id === bookmarkId);

  if (!target) {
    console.error(`Bookmark not found: ${bookmarkId}`);
    process.exit(2);
  }

  const articles = getAllArticles(db).filter((a) => a.bookmark_id === target.id);
  const content = articles.map((a) => a.content_md || '').join('\n\n');
  return { bookmarkId: target.id, content };
}

function computeCoverage(referenceWords: string[], savedWords: string[]): number {
  if (referenceWords.length === 0) return 1;
  const savedSet = new Set(savedWords);
  const matched = referenceWords.filter((w) => savedSet.has(w)).length;
  return matched / referenceWords.length;
}

function referenceSample(reference: string, maxChars: number = 200): string {
  return normalize(reference).slice(0, maxChars);
}

async function main(): Promise<void> {
  const referenceText = await loadReferenceText();
  const bookmarkId = process.env.BOOKMARK_ID?.trim() || 'latest';
  const config = getConfig();
  const dbPath =
    process.env.DB_PATH?.trim() || path.join(config.dataDir, 'bookmarks.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(2);
  }

  const { bookmarkId: bid, content: savedContent } = loadSavedContent(dbPath, bookmarkId);

  const refWords = getWords(referenceText);
  const savedWords = getWords(savedContent);
  const coverage = computeCoverage(refWords, savedWords);
  const threshold = Math.min(1, Math.max(0, parseFloat(process.env.COVERAGE_THRESHOLD || '0.5') || 0.5));

  const refChars = referenceText.length;
  const savedChars = savedContent.length;
  const sample = referenceSample(referenceText);

  console.log('\n--- Article quality report ---');
  console.log(`Bookmark ID:     ${bid}`);
  console.log(`Reference:       ${refChars} chars, ${refWords.length} words`);
  console.log(`Saved content:   ${savedChars} chars, ${savedWords.length} words`);
  console.log(`Word coverage:   ${(coverage * 100).toFixed(1)}%`);
  console.log(`Threshold:       ${(threshold * 100).toFixed(0)}%`);
  if (coverage < 0.9 && sample) {
    console.log(`Reference starts: "${sample}..."`);
  }
  console.log('--------------------------------\n');

  if (coverage < threshold) {
    console.error(`Coverage ${(coverage * 100).toFixed(1)}% is below threshold ${(threshold * 100).toFixed(0)}%.`);
    process.exit(1);
  }
  console.log('Coverage passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
