import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function TampermonkeyScript() {
  const [copied, setCopied] = useState(false);

  const scriptContent = `// ==UserScript==
// @name         XMarks — Bookmark Sync + Article Extraction
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Syncs X bookmarks to a local XMarks server with auto-scroll and link extraction
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    let syncing = false;
    let autoScrolling = false;
    const processedTweets = new Set();
    let scrollInterval = null;

    // ── Floating Buttons Container ───────────────────────────
    const container = document.createElement('div');
    container.style.cssText = \`
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        display: flex; flex-direction: column; gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    \`;
    document.body.appendChild(container);

    // ── Sync Button ──────────────────────────────────────────
    const syncBtn = document.createElement('button');
    syncBtn.innerText = "🔴 Start Sync";
    syncBtn.style.cssText = \`
        padding: 12px 20px; background: #6366f1; color: white;
        border: none; border-radius: 50px; cursor: pointer;
        font-weight: 700; font-size: 13px;
        box-shadow: 0 4px 16px rgba(99,102,241,0.4);
        transition: all 0.2s ease; min-width: 180px;
    \`;
    container.appendChild(syncBtn);

    // ── Auto-Scroll Button ───────────────────────────────────
    const scrollBtn = document.createElement('button');
    scrollBtn.innerText = "⏬ Auto-Scroll";
    scrollBtn.style.cssText = \`
        padding: 12px 20px; background: #374151; color: white;
        border: none; border-radius: 50px; cursor: pointer;
        font-weight: 700; font-size: 13px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        transition: all 0.2s ease; min-width: 180px;
    \`;
    container.appendChild(scrollBtn);

    // ── Status Counter ───────────────────────────────────────
    const counter = document.createElement('div');
    counter.style.cssText = \`
        padding: 8px 16px; background: rgba(0,0,0,0.8); color: #a5b4fc;
        border-radius: 50px; font-size: 12px; font-weight: 600;
        text-align: center; backdrop-filter: blur(4px);
    \`;
    counter.innerText = "0 synced";
    container.appendChild(counter);

    // ── Sync Toggle ──────────────────────────────────────────
    syncBtn.onclick = () => {
        syncing = !syncing;
        if (syncing) {
            syncBtn.innerText = "🟢 Syncing...";
            syncBtn.style.background = '#22c55e';
            syncBtn.style.boxShadow = '0 4px 16px rgba(34,197,94,0.4)';
            startObserver();
        } else {
            syncBtn.innerText = "🔴 Start Sync";
            syncBtn.style.background = '#6366f1';
            syncBtn.style.boxShadow = '0 4px 16px rgba(99,102,241,0.4)';
        }
    };

    // ── Auto-Scroll Toggle ───────────────────────────────────
    scrollBtn.onclick = () => {
        autoScrolling = !autoScrolling;
        if (autoScrolling) {
            scrollBtn.innerText = "⏸️ Stop Scroll";
            scrollBtn.style.background = '#f59e0b';
            scrollBtn.style.boxShadow = '0 4px 16px rgba(245,158,11,0.4)';
            startAutoScroll();
        } else {
            scrollBtn.innerText = "⏬ Auto-Scroll";
            scrollBtn.style.background = '#374151';
            scrollBtn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
            stopAutoScroll();
        }
    };

    // ── Auto-Scroll Engine ───────────────────────────────────
    function startAutoScroll() {
        scrollInterval = setInterval(() => {
            if (!autoScrolling) return;

            // Check if we've reached the end (no more content loading)
            const endMarker = document.querySelector('[data-testid="emptyState"]');
            if (endMarker) {
                autoScrolling = false;
                scrollBtn.innerText = "✅ Done!";
                scrollBtn.style.background = '#22c55e';
                stopAutoScroll();
                return;
            }

            window.scrollBy({ top: 400, behavior: 'smooth' });
        }, 1500); // Scroll every 1.5s to let tweets load
    }

    function stopAutoScroll() {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    }

    // ── Scraping Engine ──────────────────────────────────────
    function startObserver() {
        setInterval(() => {
            if (!syncing) return;
            if (!window.location.pathname.includes('/bookmarks')) return;

            const tweets = document.querySelectorAll('[data-testid="tweet"]');

            tweets.forEach(tweet => {
                const timeLink = tweet.querySelector('a[href*="/status/"]');
                if (!timeLink) return;

                const url = timeLink.href;
                const match = url.match(/\\/status\\/(\\d+)/);
                if (!match) return;
                const tweetId = match[1];

                if (processedTweets.has(tweetId)) return;
                processedTweets.add(tweetId);

                // Author
                const authorEl = tweet.querySelector('[data-testid="User-Name"]');
                const author = authorEl ? authorEl.innerText.replace(/\\n/g, ' · ') : "Unknown";

                // Text
                const textEl = tweet.querySelector('[data-testid="tweetText"]');
                const text = textEl ? textEl.innerText : "";

                // Media (upgrade to large)
                const mediaEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
                const media = Array.from(mediaEls).map(img =>
                    img.src.replace(/&name=small|&name=medium/, '&name=large')
                );

                // ── Extract ALL links from the tweet ──────────
                const tweetLinks = [];

                // Links in tweet text
                if (textEl) {
                    const textAnchors = textEl.querySelectorAll('a[href]');
                    textAnchors.forEach(a => {
                        const href = a.href;
                        if (href && !href.includes('x.com/hashtag') && !href.includes('twitter.com/hashtag')) {
                            tweetLinks.push(href);
                        }
                    });
                }

                // Card links (article previews)
                const cardLink = tweet.querySelector('[data-testid="card.wrapper"] a[href]');
                if (cardLink && cardLink.href) {
                    tweetLinks.push(cardLink.href);
                }

                // Deduplicate links
                const uniqueLinks = [...new Set(tweetLinks)];

                // Update counter
                counter.innerText = processedTweets.size + " synced";

                // Send to local server
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "http://localhost:3001/api/bookmarks",
                    data: JSON.stringify({
                        id: tweetId,
                        url: url,
                        author: author,
                        text: text,
                        media: media,
                        links: uniqueLinks
                    }),
                    headers: { "Content-Type": "application/json" },
                    onload: (res) => console.log("[XMarks] Saved:", tweetId, "| Links:", uniqueLinks.length),
                    onerror: (err) => console.error("[XMarks] Error:", err)
                });
            });
        }, 1000);
    }
})();`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scriptContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="setup-container">
      <div className="setup-card">
        {/* Header */}
        <div className="setup-header">
          <div className="setup-header-text">
            <h3>Tampermonkey Userscript v2.0</h3>
            <p>Syncs bookmarks <strong>+ extracts linked articles</strong> automatically. Includes auto-scroll.</p>
          </div>
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? (
              <><Check size={14} /> Copied!</>
            ) : (
              <><Copy size={14} /> Copy Script</>
            )}
          </button>
        </div>

        {/* Code Block */}
        <div className="setup-code">
          <pre><code>{scriptContent}</code></pre>
        </div>

        {/* Instructions */}
        <div className="setup-instructions">
          <h4>How to Install</h4>
          <ol className="setup-steps">
            <li>
              Install the <strong>Tampermonkey</strong> browser extension from{' '}
              <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer">
                tampermonkey.net
              </a>
            </li>
            <li>
              Click the Tampermonkey icon → <strong>Create a new script</strong>
            </li>
            <li>
              Delete the default template and <strong>paste the script above</strong>
            </li>
            <li>
              Save with <strong>Ctrl+S</strong>
            </li>
            <li>
              Go to{' '}
              <a href="https://x.com/i/bookmarks" target="_blank" rel="noopener noreferrer">
                x.com/i/bookmarks
              </a>{' '}
              while logged in
            </li>
            <li>
              Click <strong>"🔴 Start Sync"</strong> to begin capturing bookmarks
            </li>
            <li>
              Click <strong>"⏬ Auto-Scroll"</strong> to scroll automatically, or scroll manually
            </li>
            <li>
              Articles linked in tweets are <strong>automatically extracted</strong> on the server
            </li>
          </ol>

          <h4 style={{ marginTop: '1.5rem' }}>What's New in v2</h4>
          <ul className="setup-steps">
            <li><strong>Auto-Scroll</strong> — scrolls the page at a safe pace, pausing for content to load</li>
            <li><strong>Link Extraction</strong> — captures all URLs in tweet text and card links</li>
            <li><strong>Article Extraction</strong> — server follows links and extracts full article content</li>
            <li><strong>Sync Counter</strong> — shows how many bookmarks have been captured</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
