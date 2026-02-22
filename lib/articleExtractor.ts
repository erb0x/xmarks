import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});

export interface ExtractedArticle {
    url: string;
    title: string;
    author: string | null;
    content: string;       // HTML
    contentMd: string;     // Markdown
    excerpt: string | null;
    siteName: string | null;
}

/**
 * Resolve a t.co (or other) shortened URL to the final destination.
 */
export async function resolveUrl(shortUrl: string): Promise<string> {
    try {
        const response = await fetch(shortUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        return response.url || shortUrl;
    } catch {
        // If HEAD fails, try GET
        try {
            const response = await fetch(shortUrl, {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            return response.url || shortUrl;
        } catch {
            return shortUrl;
        }
    }
}

/**
 * Check if a URL is likely to be an article (not an image, video, or social media post).
 */
export function isLikelyArticle(url: string): boolean {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Skip social media, image, and video hosts
    const skipHosts = [
        'x.com', 'twitter.com', 'pic.twitter.com',
        'youtube.com', 'youtu.be', 'tiktok.com',
        'instagram.com', 'facebook.com',
        'pbs.twimg.com', 'video.twimg.com',
        'giphy.com', 'imgur.com',
    ];
    if (skipHosts.some(h => host.includes(h))) return false;

    // Skip direct media file URLs
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.svg'];
    if (mediaExtensions.some(ext => path.endsWith(ext))) return false;

    return true;
}

/**
 * Fetch a URL and extract the article content using Readability.
 */
export async function extractArticle(url: string): Promise<ExtractedArticle | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000), // 15s timeout
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return null;
        }

        const html = await response.text();
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content || article.content.length < 100) {
            return null; // Not a real article
        }

        const markdown = turndown.turndown(article.content);

        return {
            url,
            title: article.title || 'Untitled',
            author: article.byline || null,
            content: article.content,
            contentMd: markdown,
            excerpt: article.excerpt || null,
            siteName: article.siteName || null,
        };
    } catch (error) {
        console.error(`[ArticleExtractor] Failed to extract from ${url}:`, error);
        return null;
    }
}

/**
 * Process a list of URLs from a tweet: resolve redirects, filter for articles, extract content.
 */
export async function processLinks(urls: string[]): Promise<{
    links: Array<{ originalUrl: string; resolvedUrl: string; isArticle: boolean }>;
    articles: ExtractedArticle[];
}> {
    const links: Array<{ originalUrl: string; resolvedUrl: string; isArticle: boolean }> = [];
    const articles: ExtractedArticle[] = [];

    for (const originalUrl of urls) {
        try {
            const resolvedUrl = await resolveUrl(originalUrl);
            const likelyArticle = isLikelyArticle(resolvedUrl);

            links.push({
                originalUrl,
                resolvedUrl,
                isArticle: false, // Will update if extraction succeeds
            });

            if (likelyArticle) {
                const article = await extractArticle(resolvedUrl);
                if (article) {
                    articles.push(article);
                    // Mark this link as an article
                    links[links.length - 1].isArticle = true;
                }
            }
        } catch (error) {
            console.error(`[ArticleExtractor] Error processing ${originalUrl}:`, error);
            links.push({ originalUrl, resolvedUrl: originalUrl, isArticle: false });
        }
    }

    return { links, articles };
}
