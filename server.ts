import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ─── Path Setup ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Data Directory ───────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Database ─────────────────────────────────────────────────
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

const db = new Database(path.join(dataDir, 'bookmarks.db'));

// Enable WAL mode for better concurrent read performance
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
`);

// ─── Express App ──────────────────────────────────────────────
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── POST /api/bookmarks ─────────────────────────────────────
app.post('/api/bookmarks', (req, res) => {
  const { id, url, author, text, media } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO bookmarks (id, url, author, text) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(id, url, author, text);

    if (info.changes > 0 && media && Array.isArray(media)) {
      const mediaStmt = db.prepare('INSERT INTO media (bookmark_id, url) VALUES (?, ?)');
      const insertMany = db.transaction((mediaUrls: string[]) => {
        for (const mediaUrl of mediaUrls) {
          mediaStmt.run(id, mediaUrl);
        }
      });
      insertMany(media);
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

    const media = db.prepare('SELECT * FROM media').all() as MediaRow[];

    const mediaByBookmark: Record<string, string[]> = {};
    for (const row of media) {
      if (!mediaByBookmark[row.bookmark_id]) {
        mediaByBookmark[row.bookmark_id] = [];
      }
      mediaByBookmark[row.bookmark_id].push(row.url);
    }

    const result = bookmarks.map((b) => ({
      ...b,
      media: mediaByBookmark[b.id] || [],
    }));

    res.json(result);
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
      `SELECT * FROM bookmarks
       WHERE text LIKE ? OR author LIKE ? OR tags LIKE ?
       ORDER BY saved_at DESC`
    ).all(pattern, pattern, pattern) as BookmarkRow[];

    const media = db.prepare('SELECT * FROM media').all() as MediaRow[];

    const mediaByBookmark: Record<string, string[]> = {};
    for (const row of media) {
      if (!mediaByBookmark[row.bookmark_id]) {
        mediaByBookmark[row.bookmark_id] = [];
      }
      mediaByBookmark[row.bookmark_id].push(row.url);
    }

    const result = bookmarks.map((b) => ({
      ...b,
      media: mediaByBookmark[b.id] || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Error searching bookmarks:', error);
    res.status(500).json({ error: 'Failed to search bookmarks' });
  }
});

// ─── GET /api/stats ──────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as { count: number };
    const latestRow = db.prepare(
      'SELECT saved_at FROM bookmarks ORDER BY saved_at DESC LIMIT 1'
    ).get() as { saved_at: string } | undefined;

    res.json({
      totalBookmarks: countRow.count,
      lastSynced: latestRow?.saved_at || null,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── DELETE /api/bookmarks/:id ───────────────────────────────
app.delete('/api/bookmarks/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.transaction(() => {
      db.prepare('DELETE FROM media WHERE bookmark_id = ?').run(id);
      db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    })();

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[XMarks API] Running on http://localhost:${PORT}`);
});
