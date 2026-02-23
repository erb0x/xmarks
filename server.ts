import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getConfig } from './lib/config.js';
import {
  initDb,
  upsertBookmark,
  getBookmarks,
  getMediaCount,
  getArticlesCount,
  getSyntheticArticleMdLength,
  insertMedia,
  deleteMediaForBookmark,
  replaceLinksAndArticles,
  enrichBookmarks,
  searchBookmarks,
  getStats,
  deleteAllBookmarks,
  deleteBookmark,
  getTranscriptByBookmarkAndVideo,
  upsertTranscript,
} from './lib/db.js';
import { processLinks, extractArticle } from './lib/articleExtractor.js';
import { exportBookmarks } from './lib/exporter.js';
import { downloadMediaFile } from './lib/mediaService.js';
import { TranscriptionService } from './lib/transcriptionService.js';

// ─── Config & Data Directory ─────────────────────────────────
const config = getConfig();
const dataDir = config.dataDir;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Database ─────────────────────────────────────────────────
const db = initDb(path.join(dataDir, 'bookmarks.db'));

// ─── Express App ──────────────────────────────────────────────
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve locally downloaded media
const mediaDir = path.join(dataDir, 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
app.use('/media', express.static(mediaDir));

// ─── Transcription Service ────────────────────────────────────
const transcriptionService = new TranscriptionService(config);

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── POST /api/bookmarks ─────────────────────────────────────
app.post('/api/bookmarks', async (req, res) => {
  const { id, url, author, text, threadText, threadPartCount, media, links: tweetLinks, forceExtract, forceMedia } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    upsertBookmark(db, { id, url: url || '', author: author || '', text: text || '' });
    const logMsg = `[XMarks] POST bookmark ${id} | text: ${(text || '').length}ch | media: ${media?.length || 0} | links: ${tweetLinks?.length || 0}\n`;
    fs.appendFileSync(path.join(dataDir, 'server.log'), logMsg);
    console.log(logMsg);

    const existingMediaCount = getMediaCount(db, id);
    const runMedia = media && Array.isArray(media) && media.length > 0 && (existingMediaCount === 0 || forceMedia);
    if (runMedia) {
      if (forceMedia && existingMediaCount > 0) {
        deleteMediaForBookmark(db, id);
      }
      (async () => {
        for (const mediaUrl of media) {
          const localPath = await downloadMediaFile(mediaDir, mediaUrl, id);
          insertMedia(db, id, localPath || mediaUrl);
        }
        console.log(`[XMarks] Saved ${media.length} media file(s) for tweet ${id}`);
      })().catch(err => console.error(`[Media] Error for ${id}:`, err));
    }

    const existingArticlesCount = getArticlesCount(db, id);
    const incomingThreadLen = typeof threadText === 'string' ? threadText.trim().length : 0;
    const runExtract = tweetLinks && Array.isArray(tweetLinks) && tweetLinks.length > 0 && (existingArticlesCount === 0 || forceExtract);
    if (runExtract) {
      processLinks(tweetLinks).then(({ links, articles }) => {
        replaceLinksAndArticles(db, id, links, articles);
        if (articles.length > 0) {
          console.log(`[XMarks] Extracted ${articles.length} article(s) for tweet ${id}`);
        }
      }).catch(err => {
        console.error(`[XMarks] Article extraction failed for ${id}:`, err);
      });
    } else {
      const md = (
        typeof threadText === 'string' && threadText.trim().length > 0
          ? threadText.trim()
          : (typeof text === 'string' ? text.trim() : '')
      );
      if (!md) {
        res.json({ status: 'success', saved: true });
        return;
      }
      const hasNoLinks = !tweetLinks || !Array.isArray(tweetLinks) || tweetLinks.length === 0;
      const existingSyntheticLen = getSyntheticArticleMdLength(db, id);
      const shouldSaveSynthetic =
        hasNoLinks && (
          existingArticlesCount === 0 ||
          forceExtract ||
          (existingSyntheticLen !== null && md.length > existingSyntheticLen)
        );
      if (!shouldSaveSynthetic) {
        res.json({ status: 'success', saved: true });
        return;
      }
      const html = `<p>${escapeHtml(md).replace(/\n/g, '<br/>')}</p>`;
      replaceLinksAndArticles(db, id, [], [
        {
          url: url || '',
          title: `X thread by ${author || 'Unknown'}`,
          author: author || null,
          content: html,
          contentMd: md,
          excerpt: md.slice(0, 300),
          siteName: 'X',
        },
      ]);
    }

    res.json({ status: 'success', saved: true });
  } catch (error) {
    console.error('Error saving bookmark:', error);
    res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

// ─── GET /api/bookmarks ──────────────────────────────────────
app.get('/api/bookmarks', (_req, res) => {
  try {
    const bookmarks = getBookmarks(db);
    res.json(enrichBookmarks(db, bookmarks));
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
    const bookmarks = searchBookmarks(db, query.trim());
    res.json(enrichBookmarks(db, bookmarks));
  } catch (error) {
    console.error('Error searching bookmarks:', error);
    res.status(500).json({ error: 'Failed to search bookmarks' });
  }
});

// ─── GET /api/stats ──────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    res.json(getStats(db));
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/settings ───────────────────────────────────────
app.get('/api/settings', async (_req, res) => {
  try {
    const cfg = getConfig();
    const hasOpenAI = !!(cfg.openaiKeyPath && fs.existsSync(cfg.openaiKeyPath));
    const ytDlpPath = cfg.ytDlpPath || 'yt-dlp';
    const ffmpegPath = cfg.ffmpegPath || 'ffmpeg';

    const checkCommand = async (cmd: string, versionFlag: string = '--version') => {
      try {
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execPromise = promisify(exec);
        const quoted = cmd.includes(' ') ? `"${cmd}"` : cmd;
        await execPromise(`${quoted} ${versionFlag}`);
        return true;
      } catch {
        return false;
      }
    };

    const hasYtDlp = await checkCommand(ytDlpPath, '--version');
    const hasFfmpeg = await checkCommand(ffmpegPath, '-version');

    console.log(`[Settings] yt-dlp: ${hasYtDlp} (${ytDlpPath})`);
    console.log(`[Settings] ffmpeg: ${hasFfmpeg} (${ffmpegPath})`);

    res.json({
      openaiKeyFound: hasOpenAI,
      ytDlpFound: hasYtDlp,
      ffmpegFound: hasFfmpeg,
      keyPath: cfg.openaiKeyPath || null,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ─── DELETE /api/bookmarks/all ───────────────────────────────
app.delete('/api/bookmarks/all', (_req, res) => {
  try {
    deleteAllBookmarks(db);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting all bookmarks:', error);
    res.status(500).json({ error: 'Failed to delete all bookmarks' });
  }
});

// ─── DELETE /api/bookmarks/:id ───────────────────────────────
app.delete('/api/bookmarks/:id', (req, res) => {
  try {
    deleteBookmark(db, req.params.id);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// ─── POST /api/bookmarks/:id/article (attach full article by URL or paste) ─
app.post('/api/bookmarks/:id/article', async (req, res) => {
  const id = req.params.id;
  const { url: articleUrl, rawMarkdown } = req.body;

  try {
    const bookmarks = getBookmarks(db);
    const exists = bookmarks.some((b) => b.id === id);
    if (!exists) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    if (articleUrl && typeof articleUrl === 'string' && articleUrl.trim()) {
      const article = await extractArticle(articleUrl.trim());
      if (!article) {
        return res.status(400).json({ error: 'Could not extract article from URL' });
      }
      replaceLinksAndArticles(db, id, [
        { originalUrl: articleUrl.trim(), resolvedUrl: articleUrl.trim(), isArticle: true },
      ], [article]);
      return res.json({ status: 'success', source: 'url' });
    }

    if (rawMarkdown && typeof rawMarkdown === 'string' && rawMarkdown.trim()) {
      const md = rawMarkdown.trim();
      const html = `<p>${escapeHtml(md).replace(/\n/g, '<br/>')}</p>`;
      replaceLinksAndArticles(db, id, [], [
        {
          url: '',
          title: 'Imported article',
          author: null,
          content: html,
          contentMd: md,
          excerpt: md.slice(0, 300),
          siteName: 'Imported',
        },
      ]);
      return res.json({ status: 'success', source: 'paste' });
    }

    return res.status(400).json({ error: 'Provide url or rawMarkdown in body' });
  } catch (error) {
    console.error('Error attaching article:', error);
    res.status(500).json({ error: 'Failed to attach article' });
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

// ─── POST /api/bookmarks/:id/transcribe ──────────────────────
app.post('/api/bookmarks/:id/transcribe', async (req, res) => {
  const { id } = req.params;
  const { videoUrl } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing videoUrl' });
  }

  try {
    const existing = getTranscriptByBookmarkAndVideo(db, id, videoUrl);
    if (existing) {
      return res.json({
        status: 'success',
        transcript: existing.transcript,
        strategy: 'cached',
      });
    }
    console.log(`[XMarks] Triggering transcription for bookmark ${id}...`);
    const result = await transcriptionService.transcribe(videoUrl, id);
    upsertTranscript(db, id, result.videoUrl, result.transcript);
    res.json({
      status: 'success',
      transcript: result.transcript,
      strategy: result.strategy,
    });
  } catch (error) {
    console.error(`[XMarks] Transcription failed for ${id}:`, error);
    res.status(500).json({ error: 'Transcription failed', details: (error as Error).message });
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
