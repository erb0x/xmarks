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

## Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | React 18 + Vite             |
| Backend  | Express + better-sqlite3    |
| Scraper  | Tampermonkey userscript     |
| Styling  | Vanilla CSS (dark mode)     |
