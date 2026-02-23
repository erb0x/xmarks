/**
 * Central config from env with sensible defaults.
 * Used by server and TranscriptionService so paths work on any machine and in CI.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDefaultDataDir(): string {
  return path.join(__dirname, '..', 'data');
}

export interface Config {
  dataDir: string;
  openaiKeyPath: string | null;
  ytDlpPath: string | null;
  ffmpegPath: string | null;
  ffprobePath: string | null;
}

function resolveOptionalPath(envValue: string | undefined, exeName: string): string | null {
  if (envValue?.trim()) return envValue.trim();
  const winGetLinks = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links');
  const candidate = path.join(winGetLinks, exeName);
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // ignore
  }
  return null;
}

export function loadConfig(): Config {
  const dataDir = process.env.XMARKS_DATA_DIR?.trim() || getDefaultDataDir();
  const openaiKeyPath = process.env.XMARKS_OPENAI_KEY_PATH?.trim() || null;
  const ytDlpPath = resolveOptionalPath(process.env.XMARKS_YT_DLP_PATH, 'yt-dlp.exe');
  const ffmpegPath = resolveOptionalPath(process.env.XMARKS_FFMPEG_PATH, 'ffmpeg.exe');
  const ffprobePath = resolveOptionalPath(process.env.XMARKS_FFPROBE_PATH, 'ffprobe.exe');

  return {
    dataDir,
    openaiKeyPath,
    ytDlpPath,
    ffmpegPath,
    ffprobePath,
  };
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfig(): void {
  cached = null;
}
