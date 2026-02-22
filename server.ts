import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { processLinks } from './lib/articleExtractor.js';
import { exportBookmarks } from './lib/exporter.js';

// ─── Path Setup ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Data Directory ───────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────
interface BookmarkRow {
  id: string;
  url: string;
  author: string;
  text: string;
  tags: string | null;
  saved_at: string;
}

interface MediaRow {
  id: number;
  bookmark_id: string;
  url: string;
}

interface LinkRow {
  id: number;
  bookmark_id: string;
  original_url: string;
  resolved_url: string;
  is_article: number;
}

interface ArticleRow {
  id: number;
  bookmark_id: string;
  url: string;
  title: string;
  author: string | null;
  content: string;
  content_md: string;
  excerpt: string | null;
  site_name: string | null;
  extracted_at: string;
}

// ─── Database ─────────────────────────────────────────────────
const db = new Database(path.join(dataDir, 'bookmarks.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    url TEXT,
    author TEXT,
    text TEXT,
    tags TEXT DEFAULT NULL,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id TEXT,
    url TEXT,
    FOREIGN KEY(bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id TEXT,
    original_url TEXT,
    resolved_url TEXT,
    is_article INTEGER DEFAULT 0,
    FOREIGN KEY(bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id TEXT,
    url TEXT,
    title TEXT,
    author TEXT,
    content TEXT,
    content_md TEXT,
    excerpt TEXT,
    site_name TEXT,
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id TEXT,
    video_url TEXT,
    transcript TEXT,
    transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
  );
`);

// ─── Express App ──────────────────────────────────────────────
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Helpers ──────────────────────────────────────────────────

/** Enrich bookmarks with their media, articles, and transcripts */
function enrichBookmarks(bookmarks: BookmarkRow[]) {
  const allMedia = db.prepare('SELECT * FROM media').all() as MediaRow[];
  const allArticles = db.prepare('SELECT * FROM articles').all() as ArticleRow[];

  let allTranscripts: Array<{ bookmark_id: string; video_url: string; transcript: string }> = [];
  try {
    allTranscripts = db.prepare('SELECT * FROM transcripts').all() as any[];
  } catch { /* table may not exist */ }

  const mediaMap: Record<string, string[]> = {};
  for (const m of allMedia) {
    if (!mediaMap[m.bookmark_id]) mediaMap[m.bookmark_id] = [];
    mediaMap[m.bookmark_id].push(m.url);
  }

  const articleMap: Record<string, ArticleRow[]> = {};
  for (const a of allArticles) {
    if (!articleMap[a.bookmark_id]) articleMap[a.bookmark_id] = [];
    articleMap[a.bookmark_id].push(a);
  }

  const transcriptMap: Record<string, typeof allTranscripts> = {};
  for (const t of allTranscripts) {
    if (!transcriptMap[t.bookmark_id]) transcriptMap[t.bookmark_id] = [];
    transcriptMap[t.bookmark_id].push(t);
  }

  return bookmarks.map((b) => ({
    ...b,
    media: mediaMap[b.id] || [],
    articles: (articleMap[b.id] || []).map(a => ({
      id: a.id,
      url: a.url,
      title: a.title,
      author: a.author,
      excerpt: a.excerpt,
      site_name: a.site_name,
      content_md: a.content_md,
      extracted_at: a.extracted_at,
    })),
    transcripts: transcriptMap[b.id] || [],
  }));
}

// ─── POST /api/bookmarks ─────────────────────────────────────
app.post('/api/bookmarks', async (req, res) => {
  const { id, url, author, text, media, links: tweetLinks } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO bookmarks (id, url, author, text) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(id, url, author, text);

    if (info.changes > 0) {
      // Save media
      if (media && Array.isArray(media)) {
        const mediaStmt = db.prepare('INSERT INTO media (bookmark_id, url) VALUES (?, ?)');
        const insertMedia = db.transaction((mediaUrls: string[]) => {
          for (const mediaUrl of mediaUrls) {
            mediaStmt.run(id, mediaUrl);
          }
        });
        insertMedia(media);
      }

      // Process links and extract articles (async, don't block response)
      if (tweetLinks && Array.isArray(tweetLinks) && tweetLinks.length > 0) {
        processLinks(tweetLinks).then(({ links, articles }) => {
          // Save links
          const linkStmt = db.prepare(
            'INSERT INTO links (bookmark_id, original_url, resolved_url, is_article) VALUES (?, ?, ?, ?)'
          );
          for (const link of links) {
            linkStmt.run(id, link.originalUrl, link.resolvedUrl, link.isArticle ? 1 : 0);
          }

          // Save articles
          const articleStmt = db.prepare(
            `INSERT INTO articles (bookmark_id, url, title, author, content, content_md, excerpt, site_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const article of articles) {
            articleStmt.run(
              id, article.url, article.title, article.author,
              article.content, article.contentMd, article.excerpt, article.siteName
            );
          }

          if (articles.length > 0) {
            console.log(`[XMarks] Extracted ${articles.length} article(s) for tweet ${id}`);
          }
        }).catch(err => {
          console.error(`[XMarks] Article extraction failed for ${id}:`, err);
        });
      }
    }

    res.json({ status: 'success', saved: info.changes > 0 });
  } catch (error) {
    console.error('Error saving bookmark:', error);
    res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

// ─── GET /api/bookmarks ──────────────────────────────────────
app.get('/api/bookmarks', (_req, res) => {
  try {
    const bookmarks = db.prepare(
      'SELECT * FROM bookmarks ORDER BY saved_at DESC'
    ).all() as BookmarkRow[];

    res.json(enrichBookmarks(bookmarks));
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// ─── GET /api/bookmarks/search ───────────────────────────────
app.get('/api/bookmarks/search', (req, res) => {
  const query = (req.query.q as string) || '';
  if (!query.trim()) {
    return res.json([]);
  }

  try {
    const pattern = `%${query}%`;
    const bookmarks = db.prepare(
      `SELECT DISTINCT b.* FROM bookmarks b
       LEFT JOIN articles a ON a.bookmark_id = b.id
       WHERE b.text LIKE ? OR b.author LIKE ? OR b.tags LIKE ?
         OR a.title LIKE ? OR a.content_md LIKE ?
       ORDER BY b.saved_at DESC`
    ).all(pattern, pattern, pattern, pattern, pattern) as BookmarkRow[];

    res.json(enrichBookmarks(bookmarks));
  } catch (error) {
    console.error('Error searching bookmarks:', error);
    res.status(500).json({ error: 'Failed to search bookmarks' });
  }
});

// ─── GET /api/stats ──────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as { count: number };
    const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
    const latestRow = db.prepare(
      'SELECT saved_at FROM bookmarks ORDER BY saved_at DESC LIMIT 1'
    ).get() as { saved_at: string } | undefined;

    res.json({
      totalBookmarks: countRow.count,
      totalArticles: articleCount.count,
      lastSynced: latestRow?.saved_at || null,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── DELETE /api/bookmarks/all ───────────────────────────────
app.delete('/api/bookmarks/all', (_req, res) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM transcripts').run();
      db.prepare('DELETE FROM articles').run();
      db.prepare('DELETE FROM links').run();
      db.prepare('DELETE FROM media').run();
      db.prepare('DELETE FROM bookmarks').run();
    })();

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting all bookmarks:', error);
    res.status(500).json({ error: 'Failed to delete all bookmarks' });
  }
});

// ─── DELETE /api/bookmarks/:id ───────────────────────────────
app.delete('/api/bookmarks/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.transaction(() => {
      db.prepare('DELETE FROM transcripts WHERE bookmark_id = ?').run(id);
      db.prepare('DELETE FROM articles WHERE bookmark_id = ?').run(id);
      db.prepare('DELETE FROM links WHERE bookmark_id = ?').run(id);
      db.prepare('DELETE FROM media WHERE bookmark_id = ?').run(id);
      db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    })();

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// ─── POST /api/export ────────────────────────────────────────
app.post('/api/export', async (_req, res) => {
  try {
    const zipPath = await exportBookmarks(db, dataDir);
    const filename = path.basename(zipPath);
    res.json({ status: 'success', filename });
  } catch (error) {
    console.error('Error exporting:', error);
    res.status(500).json({ error: 'Failed to export bookmarks' });
  }
});

// ─── GET /api/export/download/:filename ──────────────────────
app.get('/api/export/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(dataDir, 'exports', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename);
});

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[XMarks API] Running on http://localhost:${PORT}`);
});
