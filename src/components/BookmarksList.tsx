import { useEffect, useState, useCallback } from 'react';
import {
  ExternalLink, Trash2, Image as ImageIcon, Clock,
  ChevronDown, ChevronUp, AlertCircle, FileText, Globe
} from 'lucide-react';

interface Article {
  id: number;
  url: string;
  title: string;
  author: string | null;
  excerpt: string | null;
  site_name: string | null;
  content_md: string;
  extracted_at: string;
}

interface Bookmark {
  id: string;
  url: string;
  author: string;
  text: string;
  saved_at: string;
  media: string[];
  articles: Article[];
}

interface Props {
  searchQuery: string;
  refreshKey: number;
}

export default function BookmarksList({ searchQuery, refreshKey }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const fetchBookmarks = useCallback(async () => {
    try {
      const endpoint = searchQuery.trim()
        ? `/api/bookmarks/search?q=${encodeURIComponent(searchQuery)}`
        : '/api/bookmarks';

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch bookmarks');

      const data = await response.json();
      setBookmarks(data);
      setError(null);
    } catch (err) {
      setError('Error loading bookmarks. Make sure the server is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, refreshKey]);

  useEffect(() => {
    setLoading(true);
    fetchBookmarks();

    if (!searchQuery.trim()) {
      const interval = setInterval(fetchBookmarks, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchBookmarks, searchQuery, refreshKey]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timeout = setTimeout(fetchBookmarks, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, fetchBookmarks]);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete bookmark:', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleArticle = (key: string) => {
    setExpandedArticles((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ─── Loading State ─────────────────────────────────
  if (loading && bookmarks.length === 0) {
    return <div className="state-loading"><div className="spinner" /></div>;
  }

  // ─── Error State ───────────────────────────────────
  if (error && bookmarks.length === 0) {
    return <div className="state-error"><AlertCircle /><span>{error}</span></div>;
  }

  // ─── Empty State ───────────────────────────────────
  if (bookmarks.length === 0) {
    return (
      <div className="state-empty">
        <ImageIcon />
        <h3>{searchQuery ? 'No results found' : 'No bookmarks saved'}</h3>
        <p>
          {searchQuery
            ? `No bookmarks match "${searchQuery}".`
            : 'Go to the Setup tab, install the Tampermonkey script, then scroll through your X bookmarks to sync them here.'}
        </p>
      </div>
    );
  }

  // ─── Bookmark Grid ─────────────────────────────────
  return (
    <div>
      <div className="bookmarks-header">
        <h2>
          {searchQuery ? 'Search Results' : 'Saved Bookmarks'}
          <span className="bookmarks-count">({bookmarks.length})</span>
        </h2>
      </div>

      <div className="bookmarks-grid">
        {bookmarks.map((bookmark) => {
          const isExpanded = expandedIds.has(bookmark.id);
          const isLongText = (bookmark.text?.length || 0) > 200;

          return (
            <div key={bookmark.id} className="bookmark-card">
              <div className="bookmark-card-body">
                {/* Author + Link */}
                <div className="bookmark-card-top">
                  <span className="bookmark-author" title={bookmark.author}>
                    {bookmark.author}
                  </span>
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bookmark-link"
                    title="View original tweet"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                {/* Tweet URL (prominent) */}
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tweet-url-link"
                >
                  <Globe size={11} />
                  {bookmark.url.replace('https://', '')}
                </a>

                {/* Text */}
                {bookmark.text ? (
                  <>
                    <p className={`bookmark-text ${isExpanded ? 'expanded' : ''}`}>
                      {bookmark.text}
                    </p>
                    {isLongText && (
                      <button className="expand-btn" onClick={() => toggleExpand(bookmark.id)}>
                        {isExpanded ? <>Show less <ChevronUp size={12} /></> : <>Show more <ChevronDown size={12} /></>}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="bookmark-text bookmark-text-empty">No text content</p>
                )}

                {/* Media */}
                {bookmark.media && bookmark.media.length > 0 && (
                  <div className="bookmark-media">
                    <div className="media-label">
                      <ImageIcon size={12} />
                      {bookmark.media.length} {bookmark.media.length === 1 ? 'media file' : 'media files'}
                    </div>
                    <div className={`media-grid ${bookmark.media.length > 1 ? 'cols-2' : 'cols-1'}`}>
                      {bookmark.media.slice(0, 2).map((url, i) => (
                        <div key={i} className="media-item">
                          <img src={url} alt="Tweet media" loading="lazy" referrerPolicy="no-referrer" />
                          {i === 1 && bookmark.media.length > 2 && (
                            <div className="media-overlay"><span>+{bookmark.media.length - 2} more</span></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Articles */}
                {bookmark.articles && bookmark.articles.length > 0 && (
                  <div className="article-section">
                    {bookmark.articles.map((article) => {
                      const articleKey = `${bookmark.id}-${article.id}`;
                      const isArticleExpanded = expandedArticles.has(articleKey);

                      return (
                        <div key={article.id} className="article-card">
                          <div className="article-card-header" onClick={() => toggleArticle(articleKey)}>
                            <div className="article-card-title">
                              <FileText size={14} />
                              <div>
                                <h4>{article.title}</h4>
                                {article.site_name && (
                                  <span className="article-source">{article.site_name}</span>
                                )}
                              </div>
                            </div>
                            {isArticleExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                          {article.excerpt && !isArticleExpanded && (
                            <p className="article-excerpt">{article.excerpt}</p>
                          )}
                          {isArticleExpanded && (
                            <div className="article-content">
                              <a href={article.url} target="_blank" rel="noopener noreferrer" className="article-url">
                                <Globe size={11} /> {article.url}
                              </a>
                              <div className="article-md" dangerouslySetInnerHTML={{
                                __html: article.content_md
                                  .replace(/</g, '&lt;')
                                  .replace(/>/g, '&gt;')
                                  .replace(/\n/g, '<br/>')
                              }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bookmark-card-footer">
                <div className="bookmark-time">
                  <Clock size={12} />
                  {new Date(bookmark.saved_at).toLocaleDateString()}{' '}
                  {new Date(bookmark.saved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {bookmark.articles.length > 0 && (
                    <span className="article-badge">{bookmark.articles.length} article{bookmark.articles.length > 1 ? 's' : ''}</span>
                  )}
                </div>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(bookmark.id)}
                  title="Delete bookmark"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
