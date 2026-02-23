import OpenAI from 'openai';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import ytDlp, { create as createYtDlp } from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import type { Config } from './config.js';

/** Sanitize bookmark id for use in filenames (avoid path traversal and invalid chars). */
export function sanitizeBookmarkId(bookmarkId: string): string {
  return bookmarkId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200) || 'unknown';
}

function getOpenAI(config: Config): OpenAI | null {
  const keyPath = config.openaiKeyPath;
  if (!keyPath || !existsSync(keyPath)) return null;
  try {
    const apiKey = readFileSync(keyPath, 'utf-8').trim();
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
  } catch (err) {
    console.error('[Transcription] Failed to load OpenAI key:', err);
    return null;
  }
}

function getYtDlpBin(config: Config): string {
  return config.ytDlpPath || 'yt-dlp';
}

function getFfmpegBin(config: Config): string {
  return config.ffmpegPath || 'ffmpeg';
}

function getFfprobeBin(config: Config): string {
  return config.ffprobePath || 'ffprobe';
}

export interface TranscriptionResult {
  transcript: string;
  videoUrl: string;
  strategy: 'local' | 'openai';
}

export interface TranscriptionServiceOptions {
  dataDir: string;
  openaiKeyPath?: string | null;
  ytDlpPath?: string | null;
  ffmpegPath?: string | null;
  ffprobePath?: string | null;
}

/**
 * Service to handle video transcription using a hybrid approach.
 * Accepts Config (from getConfig()) or a plain dataDir string for backward compat.
 */
export class TranscriptionService {
  private tempDir: string;
  private config: Config & { dataDir: string };
  private openai: OpenAI | null;

  constructor(options: Config | string) {
    const cfg: Config & { dataDir: string } =
      typeof options === 'string'
        ? {
            dataDir: options,
            openaiKeyPath: null,
            ytDlpPath: null,
            ffmpegPath: null,
            ffprobePath: null,
          }
        : { ...options, dataDir: options.dataDir };
    this.config = cfg;
    this.tempDir = path.join(cfg.dataDir, 'temp_audio');
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
    const ffmpegBin = getFfmpegBin(cfg);
    const ffprobeBin = getFfprobeBin(cfg);
    ffmpeg.setFfmpegPath(ffmpegBin);
    ffmpeg.setFfprobePath(ffprobeBin);
    this.openai = getOpenAI(cfg);
  }

  /**
   * Transcribe a video from a URL.
   */
  async transcribe(videoUrl: string, bookmarkId: string): Promise<TranscriptionResult> {
    const safeId = sanitizeBookmarkId(bookmarkId);
    const audioPath = path.join(this.tempDir, `${safeId}.mp3`);

    try {
      console.log(`[Transcription] Extracting audio for ${bookmarkId}...`);
      const ytDlpBin = getYtDlpBin(this.config);
      const transcriber = ytDlpBin !== 'yt-dlp' ? createYtDlp(ytDlpBin) : ytDlp;
      const ffmpegBin = getFfmpegBin(this.config);

      await transcriber(videoUrl, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: audioPath,
        noCheckCertificate: true,
        ffmpegLocation: ffmpegBin !== 'ffmpeg' ? path.dirname(ffmpegBin) : undefined,
      });

      const duration = await this.getAudioDuration(audioPath);
      console.log(`[Transcription] Audio duration: ${duration}s`);

      return await this.transcribeWithOpenAI(audioPath, videoUrl);
    } catch (error) {
      console.error(`[Transcription] Failed for ${bookmarkId}:`, error);
      throw error;
    }
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });
  }

  private async transcribeWithOpenAI(filePath: string, videoUrl: string): Promise<TranscriptionResult> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    console.log(`[Transcription] Sending to OpenAI...`);
    const response = await this.openai.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: 'whisper-1',
    });

    return {
      transcript: response.text,
      videoUrl,
      strategy: 'openai',
    };
  }
}
