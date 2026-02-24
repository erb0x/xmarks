import Database from 'better-sqlite3';

export interface BookmarkRow {
  id: string;
  url: string;
  author: string;
  text: string;
  tags: string | null;
  saved_at: string;
}

export interface MediaRow {
  id: number;
  bookmark_id: string;
  url: string;
}

export interface LinkRow {
  id: number;
  bookmark_id: string;
  original_url: string;
  resolved_url: string;
  is_article: number;
}

export interface ArticleRow {
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
  pdf_path: string | null;
}

export interface TranscriptRow {
  id: number;
  bookmark_id: string;
  video_url: string;
  transcript: string;
  transcribed_at: string;
}

const SCHEMA = `
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
    pdf_path TEXT,
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
  CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_bookmark_video ON transcripts(bookmark_id, video_url);
`;

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Migration: add pdf_path to articles if missing (existing DBs)
  try {
    db.exec('ALTER TABLE articles ADD COLUMN pdf_path TEXT');
  } catch {
    // Column already exists
  }
  return db;
}

export function runSchema(db: Database.Database): void {
  db.exec(SCHEMA);
}

export function upsertBookmark(
  db: Database.Database,
  row: { id: string; url: string; author: string; text: string }
): void {
  const stmt = db.prepare(
    `INSERT INTO bookmarks (id, url, author, text) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       text = CASE WHEN excluded.text != '' AND excluded.text IS NOT NULL THEN excluded.text ELSE bookmarks.text END,
       author = CASE WHEN excluded.author != '' AND excluded.author IS NOT NULL THEN excluded.author ELSE bookmarks.author END`
  );
  stmt.run(row.id, row.url, row.author, row.text);
}

export function getBookmarks(db: Database.Database): BookmarkRow[] {
  return db.prepare('SELECT * FROM bookmarks ORDER BY saved_at DESC').all() as BookmarkRow[];
}

export function getMediaCount(db: Database.Database, bookmarkId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM media WHERE bookmark_id = ?').get(bookmarkId) as { count: number };
  return row.count;
}

/** Returns stored media URLs for a bookmark (for merge-on-resync). */
export function getMediaUrlsForBookmark(db: Database.Database, bookmarkId: string): string[] {
  const rows = db.prepare('SELECT url FROM media WHERE bookmark_id = ?').all(bookmarkId) as { url: string }[];
  return rows.map((r) => r.url);
}

export function insertMedia(db: Database.Database, bookmarkId: string, url: string): void {
  db.prepare('INSERT INTO media (bookmark_id, url) VALUES (?, ?)').run(bookmarkId, url);
}

export function deleteMediaForBookmark(db: Database.Database, bookmarkId: string): void {
  db.prepare('DELETE FROM media WHERE bookmark_id = ?').run(bookmarkId);
}

export function getArticlesCount(db: Database.Database, bookmarkId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM articles WHERE bookmark_id = ?').get(bookmarkId) as { count: number };
  return row.count;
}

export function getSyntheticArticleMdLength(db: Database.Database, bookmarkId: string): number | null {
  const row = db
    .prepare(
      `SELECT LENGTH(COALESCE(content_md, '')) as len
       FROM articles
       WHERE bookmark_id = ? AND site_name = 'X'
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(bookmarkId) as { len: number } | undefined;
  return row ? row.len : null;
}

export interface LinkInput {
  originalUrl: string;
  resolvedUrl: string;
  isArticle: boolean;
}

export interface ArticleInput {
  url: string;
  title: string;
  author: string | null;
  content: string;
  contentMd: string;
  excerpt: string | null;
  siteName: string | null;
  pdf_path?: string | null;
}

export function replaceLinksAndArticles(
  db: Database.Database,
  bookmarkId: string,
  links: LinkInput[],
  articles: ArticleInput[]
): void {
  db.transaction(() => {
    db.prepare('DELETE FROM links WHERE bookmark_id = ?').run(bookmarkId);
    db.prepare('DELETE FROM articles WHERE bookmark_id = ?').run(bookmarkId);
    const linkStmt = db.prepare(
      'INSERT INTO links (bookmark_id, original_url, resolved_url, is_article) VALUES (?, ?, ?, ?)'
    );
    for (const link of links) {
      linkStmt.run(bookmarkId, link.originalUrl, link.resolvedUrl, link.isArticle ? 1 : 0);
    }
    const articleStmt = db.prepare(
      `INSERT INTO articles (bookmark_id, url, title, author, content, content_md, excerpt, site_name, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const article of articles) {
      articleStmt.run(
        bookmarkId,
        article.url,
        article.title,
        article.author,
        article.content,
        article.contentMd,
        article.excerpt,
        article.siteName,
        article.pdf_path ?? null
      );
    }
  })();
}

export function getTranscriptByBookmarkAndVideo(
  db: Database.Database,
  bookmarkId: string,
  videoUrl: string
): TranscriptRow | undefined {
  return db
    .prepare('SELECT * FROM transcripts WHERE bookmark_id = ? AND video_url = ?')
    .get(bookmarkId, videoUrl) as TranscriptRow | undefined;
}

export function insertTranscript(
  db: Database.Database,
  bookmarkId: string,
  videoUrl: string,
  transcript: string
): void {
  db.prepare(
    'INSERT INTO transcripts (bookmark_id, video_url, transcript) VALUES (?, ?, ?)'
  ).run(bookmarkId, videoUrl, transcript);
}

/** Idempotent: insert or update transcript for (bookmark_id, video_url). */
export function upsertTranscript(
  db: Database.Database,
  bookmarkId: string,
  videoUrl: string,
  transcript: string
): void {
  db.prepare(
    `INSERT INTO transcripts (bookmark_id, video_url, transcript) VALUES (?, ?, ?)
     ON CONFLICT(bookmark_id, video_url) DO UPDATE SET transcript = excluded.transcript, transcribed_at = CURRENT_TIMESTAMP`
  ).run(bookmarkId, videoUrl, transcript);
}

export function getAllMedia(db: Database.Database): MediaRow[] {
  return db.prepare('SELECT * FROM media').all() as MediaRow[];
}

export function getAllArticles(db: Database.Database): ArticleRow[] {
  return db.prepare('SELECT * FROM articles').all() as ArticleRow[];
}

export function getAllTranscripts(db: Database.Database): TranscriptRow[] {
  try {
    return db.prepare('SELECT * FROM transcripts').all() as TranscriptRow[];
  } catch {
    return [];
  }
}

export interface EnrichedBookmark extends BookmarkRow {
  media: string[];
  articles: Array<{
    id: number;
    url: string;
    title: string;
    author: string | null;
    excerpt: string | null;
    site_name: string | null;
    content_md: string;
    extracted_at: string;
    pdf_path: string | null;
  }>;
  transcripts: TranscriptRow[];
}

export function enrichBookmarks(db: Database.Database, bookmarks: BookmarkRow[]): EnrichedBookmark[] {
  const allMedia = getAllMedia(db);
  const allArticles = getAllArticles(db);
  const allTranscripts = getAllTranscripts(db);

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

  const transcriptMap: Record<string, TranscriptRow[]> = {};
  for (const t of allTranscripts) {
    if (!transcriptMap[t.bookmark_id]) transcriptMap[t.bookmark_id] = [];
    transcriptMap[t.bookmark_id].push(t);
  }

  return bookmarks.map((b) => ({
    ...b,
    media: mediaMap[b.id] || [],
    articles: (articleMap[b.id] || []).map((a) => ({
      id: a.id,
      url: a.url,
      title: a.title,
      author: a.author,
      excerpt: a.excerpt,
      site_name: a.site_name,
      content_md: a.content_md,
      extracted_at: a.extracted_at,
      pdf_path: a.pdf_path ?? null,
    })),
    transcripts: transcriptMap[b.id] || [],
  }));
}

export function searchBookmarks(db: Database.Database, pattern: string): BookmarkRow[] {
  const p = `%${pattern}%`;
  return db
    .prepare(
      `SELECT DISTINCT b.* FROM bookmarks b
       LEFT JOIN articles a ON a.bookmark_id = b.id
       WHERE b.text LIKE ? OR b.author LIKE ? OR b.tags LIKE ?
         OR a.title LIKE ? OR a.content_md LIKE ?
       ORDER BY b.saved_at DESC`
    )
    .all(p, p, p, p, p) as BookmarkRow[];
}

export function getStats(db: Database.Database): {
  totalBookmarks: number;
  totalArticles: number;
  lastSynced: string | null;
} {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM bookmarks').get() as { count: number };
  const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
  const latestRow = db
    .prepare('SELECT saved_at FROM bookmarks ORDER BY saved_at DESC LIMIT 1')
    .get() as { saved_at: string } | undefined;
  return {
    totalBookmarks: countRow.count,
    totalArticles: articleCount.count,
    lastSynced: latestRow?.saved_at ?? null,
  };
}

export function deleteAllBookmarks(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('DELETE FROM transcripts').run();
    db.prepare('DELETE FROM articles').run();
    db.prepare('DELETE FROM links').run();
    db.prepare('DELETE FROM media').run();
    db.prepare('DELETE FROM bookmarks').run();
  })();
}

export function deleteBookmark(db: Database.Database, id: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM transcripts WHERE bookmark_id = ?').run(id);
    db.prepare('DELETE FROM articles WHERE bookmark_id = ?').run(id);
    db.prepare('DELETE FROM links WHERE bookmark_id = ?').run(id);
    db.prepare('DELETE FROM media WHERE bookmark_id = ?').run(id);
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  })();
}
