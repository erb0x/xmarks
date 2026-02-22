import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function TampermonkeyScript() {
  const [copied, setCopied] = useState(false);

  const scriptContent = `// ==UserScript==
// @name         XMarks — Bookmark Sync v3
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Syncs X bookmarks to local XMarks server — robust auto-scroll, text + link extraction
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
    let stuckCount = 0;
    let lastScrollY = 0;

    // ── Floating Buttons Container ───────────────────────────
    const container = document.createElement('div');
    container.style.cssText = \\\`
        position: fixed; bottom: 20px; right: 20px; z-index: 99999;
        display: flex; flex-direction: column; gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    \\\`;
    document.body.appendChild(container);

    // ── Sync Button ──────────────────────────────────────────
    const syncBtn = document.createElement('button');
    syncBtn.innerText = "🔴 Start Sync";
    syncBtn.style.cssText = \\\`
        padding: 12px 20px; background: #6366f1; color: white;
        border: none; border-radius: 50px; cursor: pointer;
        font-weight: 700; font-size: 13px;
        box-shadow: 0 4px 16px rgba(99,102,241,0.4);
        transition: all 0.2s ease; min-width: 180px;
    \\\`;
    container.appendChild(syncBtn);

    // ── Auto-Scroll Button ───────────────────────────────────
    const scrollBtn = document.createElement('button');
    scrollBtn.innerText = "⏬ Auto-Scroll";
    scrollBtn.style.cssText = \\\`
        padding: 12px 20px; background: #374151; color: white;
        border: none; border-radius: 50px; cursor: pointer;
        font-weight: 700; font-size: 13px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        transition: all 0.2s ease; min-width: 180px;
    \\\`;
    container.appendChild(scrollBtn);

    // ── Status Counter ───────────────────────────────────────
    const counter = document.createElement('div');
    counter.style.cssText = \\\`
        padding: 8px 16px; background: rgba(0,0,0,0.8); color: #a5b4fc;
        border-radius: 50px; font-size: 12px; font-weight: 600;
        text-align: center; backdrop-filter: blur(4px);
    \\\`;
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
            stuckCount = 0;
            lastScrollY = window.scrollY;
            startAutoScroll();
        } else {
            scrollBtn.innerText = "⏬ Auto-Scroll";
            scrollBtn.style.background = '#374151';
            scrollBtn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
            stopAutoScroll();
        }
    };

    // ── Auto-Scroll Engine (robust) ──────────────────────────
    // Key fixes:
    // 1. Does NOT stop on videos — only stops after 15+ failed scroll attempts
    // 2. Uses scrollY comparison to detect if we're actually moving
    // 3. Pauses videos that might block scrolling
    function startAutoScroll() {
        scrollInterval = setInterval(() => {
            if (!autoScrolling) return;

            // Pause any playing videos to prevent scroll blocking
            const videos = document.querySelectorAll('video');
            videos.forEach(v => { try { v.pause(); } catch(e) {} });

            // Scroll down
            window.scrollBy({ top: 600, behavior: 'smooth' });

            // Check if we actually moved
            setTimeout(() => {
                const currentY = window.scrollY;
                if (Math.abs(currentY - lastScrollY) < 50) {
                    stuckCount++;
                    counter.innerText = processedTweets.size + " synced (loading...)";

                    // If stuck for 15+ cycles (22.5s), we've likely reached the end
                    if (stuckCount >= 15) {
                        autoScrolling = false;
                        scrollBtn.innerText = "✅ Done!";
                        scrollBtn.style.background = '#22c55e';
                        counter.innerText = processedTweets.size + " synced (complete)";
                        stopAutoScroll();
                        return;
                    }

                    // Try a bigger scroll to get past sticky elements
                    window.scrollBy({ top: 1200, behavior: 'instant' });
                } else {
                    stuckCount = 0; // Reset when we're moving
                    counter.innerText = processedTweets.size + " synced";
                }
                lastScrollY = currentY;
            }, 800);
        }, 1500);
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
                // ── Get tweet ID ──────────────────────────────
                const allLinks = tweet.querySelectorAll('a[href*="/status/"]');
                let tweetUrl = null;
                let tweetId = null;

                for (const link of allLinks) {
                    const href = link.href;
                    const match = href.match(/\\/status\\/(\\d+)/);
                    if (match) {
                        tweetUrl = href;
                        tweetId = match[1];
                        break;
                    }
                }

                if (!tweetId) return;
                if (processedTweets.has(tweetId)) return;
                processedTweets.add(tweetId);

                // ── Author ────────────────────────────────────
                const authorEl = tweet.querySelector('[data-testid="User-Name"]');
                const author = authorEl ? authorEl.innerText.replace(/\\n/g, ' · ') : "Unknown";

                // ── Text (multiple fallback strategies) ───────
                let text = "";

                // Strategy 1: data-testid="tweetText"
                const textEl = tweet.querySelector('[data-testid="tweetText"]');
                if (textEl) {
                    text = textEl.innerText || "";
                }

                // Strategy 2: If no text found, look for the main text div
                // Some tweets (quoted, video-only with captions) use different containers
                if (!text) {
                    const altText = tweet.querySelector('[lang]');
                    if (altText && altText.closest('[data-testid="tweet"]') === tweet) {
                        text = altText.innerText || "";
                    }
                }

                // Strategy 3: Get any visible text content in the tweet body
                // Exclude author name area and timestamp
                if (!text) {
                    const tweetBody = tweet.querySelector('[data-testid="tweetText"], [data-testid="tweet"] > div > div > div:nth-child(2)');
                    if (tweetBody) {
                        text = tweetBody.innerText || "";
                    }
                }

                // ── Media ─────────────────────────────────────
                const mediaEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
                const media = Array.from(mediaEls).map(img =>
                    img.src.replace(/&name=small|&name=medium/, '&name=large')
                );

                // Also capture video thumbnails
                const videoEls = tweet.querySelectorAll('video');
                videoEls.forEach(v => {
                    if (v.poster) media.push(v.poster);
                });

                // ── Links (comprehensive extraction) ──────────
                const tweetLinks = [];

                // Links inside tweet text
                if (textEl) {
                    textEl.querySelectorAll('a[href]').forEach(a => {
                        const href = a.href;
                        if (href && !href.includes('/hashtag/') && !href.match(/x\\.com\\/\\w+$/)) {
                            tweetLinks.push(href);
                        }
                    });
                }

                // Card links (article preview cards)
                const cardLinks = tweet.querySelectorAll('[data-testid="card.wrapper"] a[href]');
                cardLinks.forEach(a => {
                    if (a.href) tweetLinks.push(a.href);
                });

                // Links in quoted tweets too
                const quotedTweet = tweet.querySelector('[data-testid="quoteTweet"]');
                if (quotedTweet) {
                    quotedTweet.querySelectorAll('a[href]').forEach(a => {
                        const href = a.href;
                        if (href && href.startsWith('http') && !href.includes('/hashtag/')) {
                            tweetLinks.push(href);
                        }
                    });
                }

                // All other external links in the tweet
                tweet.querySelectorAll('a[href^="https://t.co"]').forEach(a => {
                    tweetLinks.push(a.href);
                });

                // Deduplicate
                const uniqueLinks = [...new Set(tweetLinks)];

                // ── Update counter ────────────────────────────
                counter.innerText = processedTweets.size + " synced";

                // ── Send to server ────────────────────────────
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "http://localhost:3001/api/bookmarks",
                    data: JSON.stringify({
                        id: tweetId,
                        url: tweetUrl,
                        author: author,
                        text: text,
                        media: media,
                        links: uniqueLinks
                    }),
                    headers: { "Content-Type": "application/json" },
                    onload: (res) => console.log("[XMarks] Saved:", tweetId, "| Text:", text.length + "ch", "| Links:", uniqueLinks.length),
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
            <h3>Tampermonkey Userscript v3.0</h3>
            <p>Robust auto-scroll, <strong>full text + article extraction</strong>, video-aware scrolling.</p>
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
              Install <strong>Tampermonkey</strong> from{' '}
              <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer">
                tampermonkey.net
              </a>
            </li>
            <li>
              Click Tampermonkey icon → <strong>Create a new script</strong>
            </li>
            <li>
              Delete the template and <strong>paste the script above</strong>
            </li>
            <li>
              Save with <strong>Ctrl+S</strong>
            </li>
            <li>
              Go to{' '}
              <a href="https://x.com/i/bookmarks" target="_blank" rel="noopener noreferrer">
                x.com/i/bookmarks
              </a>
            </li>
            <li>
              Click <strong>"🔴 Start Sync"</strong> to begin
            </li>
            <li>
              Click <strong>"⏬ Auto-Scroll"</strong> — it will scroll past videos without stopping
            </li>
          </ol>

          <h4 style={{ marginTop: '1.5rem' }}>What's Fixed in v3</h4>
          <ul className="setup-steps">
            <li><strong>Auto-scroll no longer stops on videos</strong> — pauses video players and uses scroll-position tracking instead of DOM markers</li>
            <li><strong>Better text extraction</strong> — multiple fallback strategies for tweets with unusual DOM structures</li>
            <li><strong>Deeper link capture</strong> — extracts links from quoted tweets, card wrappers, and t.co redirects</li>
            <li><strong>Stuck detection</strong> — if scroll position doesn't change for 22.5s, marks as complete</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
