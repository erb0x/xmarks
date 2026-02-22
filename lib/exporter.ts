import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import Database from 'better-sqlite3';

interface BookmarkExport {
    id: string;
    url: string;
    author: string;
    text: string;
    saved_at: string;
    media: string[];
    articles: Array<{
        title: string;
        author: string | null;
        content_md: string;
        excerpt: string | null;
        site_name: string | null;
        url: string;
    }>;
    transcripts: Array<{
        video_url: string;
        transcript: string;
    }>;
}

/**
 * Generate a slug-safe filename from text.
 */
function slugify(text: string, maxLen = 50): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, maxLen);
}

/**
 * Generate a Markdown file for a single bookmark.
 */
function bookmarkToMarkdown(bookmark: BookmarkExport, index: number): string {
    const lines: string[] = [];

    // Header
    const authorClean = bookmark.author.split('\n')[0].trim();
    lines.push(`# ${authorClean}`);
    lines.push('');
    lines.push(`> Saved: ${new Date(bookmark.saved_at).toLocaleString()}`);
    lines.push(`> Tweet: [${bookmark.url}](${bookmark.url})`);
    lines.push('');

    // Tweet text
    if (bookmark.text) {
        lines.push('## Tweet');
        lines.push('');
        lines.push(bookmark.text);
        lines.push('');
    }

    // Media
    if (bookmark.media.length > 0) {
        lines.push('## Media');
        lines.push('');
        for (const url of bookmark.media) {
            lines.push(`![media](${url})`);
        }
        lines.push('');
    }

    // Articles
    for (const article of bookmark.articles) {
        lines.push('---');
        lines.push('');
        lines.push(`## 📄 ${article.title}`);
        lines.push('');
        if (article.author) lines.push(`*By ${article.author}*`);
        if (article.site_name) lines.push(`*Source: ${article.site_name}*`);
        lines.push(`*URL: [${article.url}](${article.url})*`);
        lines.push('');
        if (article.excerpt) {
            lines.push(`> ${article.excerpt}`);
            lines.push('');
        }
        lines.push(article.content_md);
        lines.push('');
    }

    // Transcripts
    for (const t of bookmark.transcripts) {
        lines.push('---');
        lines.push('');
        lines.push(`## 🎥 Video Transcript`);
        lines.push(`*Source: ${t.video_url}*`);
        lines.push('');
        lines.push(t.transcript);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Export all bookmarks as a zip of Markdown files.
 * Returns the path to the generated zip file.
 */
export async function exportBookmarks(db: Database.Database, dataDir: string): Promise<string> {
    // Fetch all data
    const bookmarks = db.prepare('SELECT * FROM bookmarks ORDER BY saved_at DESC').all() as any[];
    const media = db.prepare('SELECT * FROM media').all() as any[];
    const articles = db.prepare('SELECT * FROM articles').all() as any[];

    let transcripts: any[] = [];
    try {
        transcripts = db.prepare('SELECT * FROM transcripts').all() as any[];
    } catch { /* table may not exist yet */ }

    // Group by bookmark
    const mediaMap: Record<string, string[]> = {};
    for (const m of media) {
        if (!mediaMap[m.bookmark_id]) mediaMap[m.bookmark_id] = [];
        mediaMap[m.bookmark_id].push(m.url);
    }

    const articleMap: Record<string, any[]> = {};
    for (const a of articles) {
        if (!articleMap[a.bookmark_id]) articleMap[a.bookmark_id] = [];
        articleMap[a.bookmark_id].push(a);
    }

    const transcriptMap: Record<string, any[]> = {};
    for (const t of transcripts) {
        if (!transcriptMap[t.bookmark_id]) transcriptMap[t.bookmark_id] = [];
        transcriptMap[t.bookmark_id].push(t);
    }

    const enriched: BookmarkExport[] = bookmarks.map(b => ({
        ...b,
        media: mediaMap[b.id] || [],
        articles: articleMap[b.id] || [],
        transcripts: transcriptMap[b.id] || [],
    }));

    // Generate markdown files
    const exportDir = path.join(dataDir, 'exports');
    const timestamp = new Date().toISOString().slice(0, 10);
    const exportName = `xmarks_${timestamp}`;
    const exportPath = path.join(exportDir, exportName);

    if (fs.existsSync(exportPath)) {
        fs.rmSync(exportPath, { recursive: true });
    }
    fs.mkdirSync(path.join(exportPath, 'bookmarks'), { recursive: true });

    // Index file
    const indexLines = [`# XMarks Export — ${timestamp}`, '', `**${enriched.length} bookmarks**`, '', '## Contents', ''];

    for (let i = 0; i < enriched.length; i++) {
        const b = enriched[i];
        const authorSlug = slugify(b.author.split('\n')[0]);
        const filename = `${String(i + 1).padStart(3, '0')}_${authorSlug}_${b.id}.md`;
        const markdown = bookmarkToMarkdown(b, i);

        fs.writeFileSync(path.join(exportPath, 'bookmarks', filename), markdown, 'utf-8');
        indexLines.push(`${i + 1}. [${b.author.split('\n')[0]}](bookmarks/${filename}) — ${b.articles.length} article(s)`);
    }

    fs.writeFileSync(path.join(exportPath, 'index.md'), indexLines.join('\n'), 'utf-8');

    // Create zip
    const zipPath = path.join(exportDir, `${exportName}.zip`);
    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(exportPath, exportName);
        archive.finalize();
    });

    return zipPath;
}
