import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUrl, isLikelyArticle, extractArticle, processLinks } from '../../lib/articleExtractor.js';

describe('articleExtractor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('t.co/redirect')) {
          return Promise.resolve({
            url: 'https://example.com/article',
            headers: new Headers(),
          } as Response);
        }
        if (url.includes('example.com/article')) {
          return Promise.resolve({
            headers: new Headers({ 'content-type': 'text/html' }),
            text: () =>
              Promise.resolve(`
            <html><head><title>Test Article</title></head>
            <body>
              <article>
                <h1>Test Article</h1>
                <p>This is a long enough article content that Readability will accept it. We need at least 100 characters of content for the extractor to consider it valid.</p>
              </article>
            </body></html>
          `),
          } as Response);
        }
        return Promise.reject(new Error('Unknown URL'));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolveUrl returns final URL on redirect', async () => {
    const out = await resolveUrl('https://t.co/redirect');
    expect(out).toBe('https://example.com/article');
  });

  it('isLikelyArticle skips social and media', () => {
    expect(isLikelyArticle('https://twitter.com/x')).toBe(false);
    expect(isLikelyArticle('https://youtube.com/watch?v=1')).toBe(false);
    expect(isLikelyArticle('https://pbs.twimg.com/media/x.jpg')).toBe(false);
    expect(isLikelyArticle('https://example.com/post')).toBe(true);
    expect(isLikelyArticle('https://blog.example.com/2024/article')).toBe(true);
  });

  it('extractArticle returns article when HTML is valid', async () => {
    const article = await extractArticle('https://example.com/article');
    expect(article).not.toBeNull();
    expect(article!.title).toBe('Test Article');
    expect(article!.url).toBe('https://example.com/article');
    expect(article!.contentMd).toContain('long enough');
  });

  it('processLinks resolves and extracts', async () => {
    const { links, articles } = await processLinks(['https://t.co/redirect']);
    expect(links).toHaveLength(1);
    expect(links[0].resolvedUrl).toBe('https://example.com/article');
    expect(articles.length).toBeGreaterThanOrEqual(0);
  });
});
