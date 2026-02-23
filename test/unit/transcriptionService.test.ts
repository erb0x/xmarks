import { describe, it, expect } from 'vitest';
import { sanitizeBookmarkId, TranscriptionService } from '../../lib/transcriptionService.js';

describe('transcriptionService', () => {
  describe('sanitizeBookmarkId', () => {
    it('keeps alphanumeric, underscore, hyphen', () => {
      expect(sanitizeBookmarkId('abc123')).toBe('abc123');
      expect(sanitizeBookmarkId('id_with-hyphen')).toBe('id_with-hyphen');
    });

    it('replaces invalid path chars with underscore', () => {
      expect(sanitizeBookmarkId('a/b\\c')).toBe('a_b_c');
      expect(sanitizeBookmarkId('a:b*c?d')).toBe('a_b_c_d');
    });

    it('truncates to 200 chars', () => {
      const long = 'a'.repeat(300);
      expect(sanitizeBookmarkId(long).length).toBe(200);
    });

    it('returns "unknown" for empty input', () => {
      expect(sanitizeBookmarkId('')).toBe('unknown');
    });
  });

  describe('TranscriptionService', () => {
    it('constructs with string dataDir (backward compat)', () => {
      const svc = new TranscriptionService('/tmp/data');
      expect(svc).toBeDefined();
    });

    it('constructs with config object', () => {
      const svc = new TranscriptionService({
        dataDir: '/tmp/data',
        openaiKeyPath: null,
        ytDlpPath: null,
        ffmpegPath: null,
        ffprobePath: null,
      });
      expect(svc).toBeDefined();
    });
  });
});
