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

## Article quality and alternatives

- **Attach full article:** On any bookmark card, use **Attach full article** to add or replace the saved article by pasting a **URL** (server will fetch and extract with Readability) or by **pasting full text/markdown**. Use this when the tweet’s thread or links didn’t capture the full article.
- **Article quality harness:** Compare saved article content to a reference (e.g. a PDF of the full article):
  ```bash
  REFERENCE_PDF="path/to/article.pdf" BOOKMARK_ID=2025286163641118915 npm run test:article-quality
  ```
  Or use a text file: `REFERENCE_TEXT="test/fixtures/koylan-article-full.txt"`. See [test/fixtures/README.md](test/fixtures/README.md) for env options and `COVERAGE_THRESHOLD`.

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | React 18 + Vite             |
| Backend  | Express + better-sqlite3    |
| Scraper  | Tampermonkey userscript     |
| Styling  | Vanilla CSS (dark mode)     |
