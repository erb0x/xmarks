# Article quality reference files

Use these for the **article quality harness** (`npm run test:article-quality`).

- **REFERENCE_PDF** – Path to a PDF file (e.g. full article). Example:  
  `REFERENCE_PDF="test/fixtures/my-article.pdf"` or an absolute path.  
  Place the PDF here or set the env var to any path.

- **REFERENCE_TEXT** – Path to a `.txt` or `.md` file with the full article text (e.g. exported from PDF).  
  Example: `REFERENCE_TEXT="test/fixtures/koylan-article-full.txt"`

- **BOOKMARK_ID** – Bookmark to compare against (default: `latest`, i.e. most recently saved).  
  Example: `BOOKMARK_ID=2025286163641118915`

- **COVERAGE_THRESHOLD** – Fail if word coverage is below this (0–1, default: 0.5).

Example:

```bash
REFERENCE_TEXT="test/fixtures/koylan-article-full.txt" BOOKMARK_ID=2025286163641118915 npm run test:article-quality
```
