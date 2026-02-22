import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function TampermonkeyScript() {
  const [copied, setCopied] = useState(false);
  const appUrl = (import.meta as any).env.VITE_APP_URL || window.location.origin;

  let hostname = 'localhost';
  try {
    hostname = new URL(appUrl).hostname;
  } catch (e) {
    console.error('Invalid appUrl:', appUrl);
  }

  const scriptContent = `// ==UserScript==
// @name         X Bookmark Sync to Local Markdown
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sends scrolled bookmarks to a local Python server
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        GM_xmlhttpRequest
// @connect      ${hostname}
// ==/UserScript==

(function() {
    'use strict';

    let syncing = false;
    let processedTweets = new Set();

    // 1. Create a Floating Button on the screen
    const btn = document.createElement('button');
    btn.innerText = "🔴 Start Bookmark Sync";
    btn.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; padding:15px 20px; background:#1DA1F2; color:white; border:none; border-radius:50px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-family: sans-serif;";
    document.body.appendChild(btn);

    // 2. Button Click Logic
    btn.onclick = () => {
        syncing = !syncing;
        if (syncing) {
            btn.innerText = "🟢 Syncing (Scroll Down)...";
            btn.style.background = '#17bf63';
            startObserver();
        } else {
            btn.innerText = "🔴 Start Bookmark Sync";
            btn.style.background = '#1DA1F2';
        }
    };

    // 3. The Scraping Engine
    function startObserver() {
        // Check the page every 1 second
        setInterval(() => {
            if (!syncing) return;

            // Only run if we are actually on the bookmarks page
            if (!window.location.pathname.includes('/bookmarks')) return;

            // Find all visible tweets on screen
            const tweets = document.querySelectorAll('[data-testid="tweet"]');
            
            tweets.forEach(tweet => {
                // Get Tweet Link and ID
                const timeLink = tweet.querySelector('a[dir="auto"][href*="/status/"]');
                if (!timeLink) return;
                
                const url = timeLink.href;
                const tweetId = url.match(/\\/status\\/(\\d+)/)[1];

                // Skip if we already sent this one to Python
                if (processedTweets.has(tweetId)) return;
                processedTweets.add(tweetId);

                // Extract Author
                const authorElement = tweet.querySelector('[data-testid="User-Name"]');
                const authorText = authorElement ? authorElement.innerText.replace(/\\n/g, ' - ') : "Unknown Author";
                
                // Extract Text
                const textElement = tweet.querySelector('[data-testid="tweetText"]');
                const tweetText = textElement ? textElement.innerText : "";

                // Extract Images (Upgrade small images to their full-size versions)
                const mediaElements = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
                const mediaUrls = Array.from(mediaElements).map(img => {
                    return img.src.replace(/&name=small|&name=medium/, '&name=large');
                });

                // 4. Send the data to your Local Python Server safely
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "${appUrl}/api/bookmarks",
                    data: JSON.stringify({
                        id: tweetId,
                        url: url,
                        author: authorText,
                        text: tweetText,
                        media: mediaUrls
                    }),
                    headers: { "Content-Type": "application/json" },
                    onload: function(response) {
                        console.log("Locally Saved: " + tweetId);
                    }
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
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Tampermonkey Script</h3>
          <p className="text-sm text-gray-500 mt-1">
            Install this script in your browser to sync bookmarks automatically when you scroll.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy Script
            </>
          )}
        </button>
      </div>
      <div className="p-0 bg-gray-900 overflow-x-auto">
        <pre className="text-sm text-gray-300 p-6 font-mono">
          <code>{scriptContent}</code>
        </pre>
      </div>
    </div>
  );
}
