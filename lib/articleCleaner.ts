/**
 * Optional OpenAI-based cleaning of extracted article text:
 * strip headers, footers, sidebars, page numbers, and other non-article content.
 */
import OpenAI from 'openai';
import { existsSync, readFileSync } from 'fs';
import type { Config } from './config.js';

function getOpenAI(config: Config): OpenAI | null {
  const keyPath = config.openaiKeyPath;
  if (!keyPath || !existsSync(keyPath)) return null;
  try {
    const apiKey = readFileSync(keyPath, 'utf-8').trim();
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
  } catch (err) {
    console.error('[ArticleCleaner] Failed to load OpenAI key:', err);
    return null;
  }
}

const CLEAN_SYSTEM =
  'You are a text cleaner. Given raw text extracted from a PDF or document (e.g. via OCR), ' +
  'return ONLY the main article body. Remove: headers, footers, page numbers, sidebars, ' +
  'repeated titles, "Share this article", copyright lines, and any text that is not part of ' +
  'the main article content. Preserve paragraphs and line breaks. If the input is already ' +
  'just article content, return it with minimal changes. Output plain text only, no commentary.';

/**
 * Clean extracted text so only the main article body remains (no side text).
 * Uses the same OpenAI API key as transcription (XMARKS_OPENAI_KEY_PATH).
 * Returns original text if no key, API error, or empty cleaned result.
 */
export async function cleanArticleTextWithOpenAI(
  config: Config,
  rawText: string
): Promise<string> {
  const trimmed = rawText?.trim();
  if (!trimmed || trimmed.length < 50) return trimmed || rawText;

  const openai = getOpenAI(config);
  if (!openai) return rawText;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CLEAN_SYSTEM },
        { role: 'user', content: trimmed },
      ],
      max_tokens: 16000,
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 0) return content;
  } catch (err) {
    console.error('[ArticleCleaner] OpenAI request failed:', err);
  }
  return rawText;
}
