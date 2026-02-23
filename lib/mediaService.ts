import path from 'path';
import fs from 'fs';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export interface DownloadMediaOptions {
  timeoutMs?: number;
  retries?: number;
}

/**
 * Download a media file from URL to mediaDir/bookmarkId/filename.
 * On 403 (e.g. Twitter CDN without cookies), returns null so caller can store original URL.
 * Retries up to retries times with delay on failure.
 */
export async function downloadMediaFile(
  mediaDir: string,
  url: string,
  bookmarkId: string,
  options: DownloadMediaOptions = {}
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const tweetDir = path.join(mediaDir, bookmarkId);
      if (!fs.existsSync(tweetDir)) {
        fs.mkdirSync(tweetDir, { recursive: true });
      }

      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname);
      if (!filename || filename === '/') {
        filename = `img_${Date.now()}`;
      }
      filename = filename.replace(/[?#].*$/, '');

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 403) {
        console.error(`[Media] 403 Forbidden for ${url} — store original URL only`);
        return null;
      }

      if (!response.ok) {
        console.error(`[Media] Failed to download ${url}: ${response.status}`);
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS);
        }
        continue;
      }

      const ext = path.extname(filename);
      if (!ext) {
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
        const detectedExt = MIME_TO_EXT[contentType] || '.jpg';
        filename += detectedExt;
      }

      const filePath = path.join(tweetDir, filename);
      if (fs.existsSync(filePath)) {
        return `/media/${bookmarkId}/${filename}`;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      console.log(`[Media] Downloaded: ${filename} (${Math.round(buffer.length / 1024)}KB)`);
      return `/media/${bookmarkId}/${filename}`;
    } catch (err) {
      lastError = err;
      console.error(`[Media] Error downloading ${url} (attempt ${attempt + 1}/${retries + 1}):`, err);
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
