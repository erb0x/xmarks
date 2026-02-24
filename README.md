# XMarks

Scrape and organize your **X (Twitter) bookmarks** into a searchable local knowledgebase.

## How It Works

1. A **Tampermonkey userscript** runs in your browser and detects visible tweets on the X bookmarks page.
2. As you scroll, each bookmark is sent via `POST` to a local **Express API server** and stored in **SQLite**.
3. A **React dashboard** lets you browse, search, and manage your saved bookmarks.

## Quick Start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**, go to the **Setup** tab, and follow the Tampermonkey installation instructions.

## Articles, tweets, and videos

- **Articles (PDF-first):** The primary way to save a full article is to **upload a PDF** for a bookmark. The server stores the PDF under `data/articles/<bookmark_id>/`, extracts text from it for search and display, and links “View PDF” in the UI. You can also attach by **URL** (Readability extraction) or **paste** text/markdown.
- **Tweet posts:** Tweet and thread text are extracted as-is (synthetic article when there are no external links). No PDF is created for tweets.
- **Videos:** Whisper transcription is used for saved video media; transcripts are stored and shown in the dashboard.

## Article quality harness

Compare saved article content to a reference (e.g. a PDF of the full article):

```bash
REFERENCE_PDF="path/to/article.pdf" BOOKMARK_ID=2025286163641118915 npm run test:article-quality
```

Or use a text file: `REFERENCE_TEXT="test/fixtures/koylan-article-full.txt"`. See [test/fixtures/README.md](test/fixtures/README.md) for env options and `COVERAGE_THRESHOLD`.

## Testing harness

- **Unit tests:** `npm run test:unit` — Vitest, covers DB, PDF service, article extractor, transcription service.
- **Integration tests:** `npm run test:integration` — Full pipeline against a running server (port 3001): bookmark save, PDF attach, synthetic thread article, article extraction, search, export. Start the server with `npm run dev` in another terminal first.
- **Article quality:** `npm run test:article-quality` — Optional; requires `REFERENCE_PDF` or `REFERENCE_TEXT` and compares saved article content to the reference.
- **All:** `npm run test` runs unit then integration tests.

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | React 18 + Vite             |
| Backend  | Express + better-sqlite3    |
| Scraper  | Tampermonkey userscript     |
| Styling  | Vanilla CSS (dark mode)     |
