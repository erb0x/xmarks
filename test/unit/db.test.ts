import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDb,
  upsertBookmark,
  getBookmarks,
  getMediaCount,
  getArticlesCount,
  insertMedia,
  deleteMediaForBookmark,
  replaceLinksAndArticles,
  getTranscriptByBookmarkAndVideo,
  upsertTranscript,
  enrichBookmarks,
  searchBookmarks,
  getStats,
  deleteAllBookmarks,
  deleteBookmark,
} from '../../lib/db.js';

describe('db', () => {
  let db: ReturnType<typeof initDb>;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('upsertBookmark inserts and updates', () => {
    upsertBookmark(db, { id: 'b1', url: 'https://x.com/1', author: 'A', text: 'Hello' });
    const rows = getBookmarks(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Hello');

    upsertBookmark(db, { id: 'b1', url: 'https://x.com/1', author: 'A', text: 'Updated' });
    const after = getBookmarks(db);
    expect(after).toHaveLength(1);
    expect(after[0].text).toBe('Updated');
  });

  it('getMediaCount and insertMedia', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    expect(getMediaCount(db, 'b1')).toBe(0);
    insertMedia(db, 'b1', '/media/b1/img.jpg');
    insertMedia(db, 'b1', 'https://example.com/2.jpg');
    expect(getMediaCount(db, 'b1')).toBe(2);
  });

  it('deleteMediaForBookmark', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    insertMedia(db, 'b1', '/media/b1/x.jpg');
    deleteMediaForBookmark(db, 'b1');
    expect(getMediaCount(db, 'b1')).toBe(0);
  });

  it('replaceLinksAndArticles replaces links and articles', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    replaceLinksAndArticles(
      db,
      'b1',
      [
        { originalUrl: 'https://t.co/a', resolvedUrl: 'https://example.com/a', isArticle: true },
        { originalUrl: 'https://t.co/b', resolvedUrl: 'https://example.com/b', isArticle: false },
      ],
      [
        {
          url: 'https://example.com/a',
          title: 'Article A',
          author: 'Alice',
          content: '<p>Hi</p>',
          contentMd: 'Hi',
          excerpt: 'Hi',
          siteName: 'Example',
        },
      ]
    );
    expect(getArticlesCount(db, 'b1')).toBe(1);
    replaceLinksAndArticles(db, 'b1', [], []);
    expect(getArticlesCount(db, 'b1')).toBe(0);
  });

  it('articles with pdf_path are stored and returned by enrichBookmarks', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    replaceLinksAndArticles(db, 'b1', [], [
      {
        url: '',
        title: 'PDF Article',
        author: null,
        content: '<p>Content</p>',
        contentMd: 'Content',
        excerpt: 'Content',
        siteName: 'PDF',
        pdf_path: 'b1/article_123.pdf',
      },
    ]);
    const bookmarks = getBookmarks(db);
    const enriched = enrichBookmarks(db, bookmarks);
    expect(enriched[0].articles).toHaveLength(1);
    expect(enriched[0].articles[0].pdf_path).toBe('b1/article_123.pdf');
    expect(enriched[0].articles[0].title).toBe('PDF Article');
  });

  it('getTranscriptByBookmarkAndVideo and upsertTranscript', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    expect(getTranscriptByBookmarkAndVideo(db, 'b1', 'https://youtube.com/v')).toBeUndefined();
    upsertTranscript(db, 'b1', 'https://youtube.com/v', 'Hello world');
    const t = getTranscriptByBookmarkAndVideo(db, 'b1', 'https://youtube.com/v');
    expect(t).toBeDefined();
    expect(t!.transcript).toBe('Hello world');
    upsertTranscript(db, 'b1', 'https://youtube.com/v', 'Updated');
    const t2 = getTranscriptByBookmarkAndVideo(db, 'b1', 'https://youtube.com/v');
    expect(t2!.transcript).toBe('Updated');
  });

  it('enrichBookmarks returns media, articles, transcripts', () => {
    upsertBookmark(db, { id: 'b1', url: 'u1', author: 'A', text: 'T1' });
    insertMedia(db, 'b1', '/media/b1/x.jpg');
    replaceLinksAndArticles(db, 'b1', [], [
      { url: 'https://a.com', title: 'Title', author: null, content: '', contentMd: '# Hi', excerpt: null, siteName: null },
    ]);
    upsertTranscript(db, 'b1', 'https://v.com', 'Transcript text');
    const bookmarks = getBookmarks(db);
    const enriched = enrichBookmarks(db, bookmarks);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].media).toEqual(['/media/b1/x.jpg']);
    expect(enriched[0].articles).toHaveLength(1);
    expect(enriched[0].articles[0].title).toBe('Title');
    expect(enriched[0].transcripts).toHaveLength(1);
    expect(enriched[0].transcripts[0].transcript).toBe('Transcript text');
  });

  it('searchBookmarks finds by text and author', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: 'Alice', text: 'xylophone' });
    upsertBookmark(db, { id: 'b2', url: '', author: 'Bob', text: 'other' });
    expect(searchBookmarks(db, 'xylophone')).toHaveLength(1);
    expect(searchBookmarks(db, 'Alice')).toHaveLength(1);
    expect(searchBookmarks(db, 'none')).toHaveLength(0);
  });

  it('getStats returns counts and lastSynced', () => {
    const empty = getStats(db);
    expect(empty.totalBookmarks).toBe(0);
    expect(empty.totalArticles).toBe(0);
    expect(empty.lastSynced).toBeNull();
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    const one = getStats(db);
    expect(one.totalBookmarks).toBe(1);
    expect(one.lastSynced).toBeTruthy();
  });

  it('deleteBookmark removes bookmark and related rows', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    insertMedia(db, 'b1', '/x.jpg');
    replaceLinksAndArticles(db, 'b1', [{ originalUrl: 'u', resolvedUrl: 'u', isArticle: false }], []);
    upsertTranscript(db, 'b1', 'https://v', 't');
    deleteBookmark(db, 'b1');
    expect(getBookmarks(db)).toHaveLength(0);
    expect(getMediaCount(db, 'b1')).toBe(0);
    expect(getTranscriptByBookmarkAndVideo(db, 'b1', 'https://v')).toBeUndefined();
  });

  it('deleteAllBookmarks clears everything', () => {
    upsertBookmark(db, { id: 'b1', url: '', author: '', text: '' });
    insertMedia(db, 'b1', '/x.jpg');
    deleteAllBookmarks(db);
    expect(getBookmarks(db)).toHaveLength(0);
    expect(getStats(db).totalBookmarks).toBe(0);
  });
});
