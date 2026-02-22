import OpenAI from 'openai';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ytDlp from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenAI Key Setup
const KEY_PATH = 'c:\\Users\\mendj\\keys\\openai_whisper';
let openai: OpenAI | null = null;
try {
    if (existsSync(KEY_PATH)) {
        const apiKey = readFileSync(KEY_PATH, 'utf-8').trim();
        openai = new OpenAI({ apiKey });
    }
} catch (err) {
    console.error('[Transcription] Failed to load OpenAI key:', err);
}

export interface TranscriptionResult {
    transcript: string;
    videoUrl: string;
    strategy: 'local' | 'openai';
}

/**
 * Service to handle video transcription using a hybrid approach.
 */
export class TranscriptionService {
    private tempDir: string;

    constructor(dataDir: string) {
        this.tempDir = path.join(dataDir, 'temp_audio');
        if (!existsSync(this.tempDir)) {
            mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Transcribe a video from a URL.
     */
    async transcribe(videoUrl: string, bookmarkId: string): Promise<TranscriptionResult> {
        const audioPath = path.join(this.tempDir, `${bookmarkId}.mp3`);

        try {
            console.log(`[Transcription] Extracting audio for ${bookmarkId}...`);
            await ytDlp(videoUrl, {
                extractAudio: true,
                audioFormat: 'mp3',
                output: audioPath,
                noCheckCertificates: true,
            });

            const duration = await this.getAudioDuration(audioPath);
            console.log(`[Transcription] Audio duration: ${duration}s`);

            // Strategy: < 10 mins (600s) -> Local (if available), else OpenAI
            // For now, let's focus on OpenAI as the robust baseline
            if (duration < 600) {
                // Future: Add local whisper here
                return await this.transcribeWithOpenAI(audioPath, videoUrl);
            } else {
                return await this.transcribeWithOpenAI(audioPath, videoUrl);
            }
        } catch (error) {
            console.error(`[Transcription] Failed for ${bookmarkId}:`, error);
            throw error;
        } finally {
            // Cleanup temp file (could keep it, but let's be tidy)
            // if (existsSync(audioPath)) fs.unlinkSync(audioPath);
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
        if (!openai) throw new Error('OpenAI client not initialized');

        console.log(`[Transcription] Sending to OpenAI...`);
        const response = await openai.audio.transcriptions.create({
            file: createReadStream(filePath),
            model: 'whisper-1',
        });

        return {
            transcript: response.text,
            videoUrl,
            strategy: 'openai',
        };
    }

    // Placeholder for local whisper implementation
    private async transcribeLocally(filePath: string, videoUrl: string): Promise<TranscriptionResult> {
        // This would involve calling a python script or a local binary
        throw new Error('Local transcription not yet implemented');
    }
}
