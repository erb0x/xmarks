import React, { useEffect, useState } from 'react';
import { ExternalLink, Trash2, Image as ImageIcon, Clock } from 'lucide-react';

interface Bookmark {
  id: string;
  url: string;
  author: string;
  text: string;
  saved_at: string;
  media: string[];
}

export default function BookmarksList() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/bookmarks');
      if (!response.ok) {
        throw new Error('Failed to fetch bookmarks');
      }
      const data = await response.json();
      setBookmarks(data);
      setError(null);
    } catch (err) {
      setError('Error loading bookmarks. Make sure the server is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookmarks();
    // Poll for new bookmarks every 5 seconds
    const interval = setInterval(fetchBookmarks, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setBookmarks(bookmarks.filter((b) => b.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete bookmark:', err);
    }
  };

  if (loading && bookmarks.length === 0) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && bookmarks.length === 0) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200">
        <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No bookmarks saved</h3>
        <p className="mt-1 text-sm text-gray-500">
          Install the Tampermonkey script and scroll through your X bookmarks to sync them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Saved Bookmarks ({bookmarks.length})</h2>
      </div>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="p-5 flex-grow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-sm font-medium text-gray-900 truncate pr-4" title={bookmark.author}>
                  {bookmark.author}
                </h3>
                <a 
                  href={bookmark.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-indigo-600 transition-colors"
                  title="View original tweet"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              
              <p className="text-sm text-gray-600 line-clamp-4 mb-4 whitespace-pre-wrap">
                {bookmark.text || <span className="italic text-gray-400">No text content</span>}
              </p>
              
              {bookmark.media && bookmark.media.length > 0 && (
                <div className="mt-auto">
                  <div className="flex items-center text-xs text-gray-500 mb-2">
                    <ImageIcon className="h-3 w-3 mr-1" />
                    {bookmark.media.length} {bookmark.media.length === 1 ? 'Media file' : 'Media files'}
                  </div>
                  <div className="\`grid gap-2 \${bookmark.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}\`">
                    {bookmark.media.slice(0, 2).map((url, i) => (
                      <div key={i} className="relative aspect-video rounded-md overflow-hidden bg-gray-100">
                        <img 
                          src={url} 
                          alt="Tweet media" 
                          className="object-cover w-full h-full"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {i === 1 && bookmark.media.length > 2 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white text-xs font-medium">+{bookmark.media.length - 2} more</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-between items-center">
              <div className="flex items-center text-xs text-gray-500">
                <Clock className="h-3 w-3 mr-1" />
                {new Date(bookmark.saved_at).toLocaleDateString()} {new Date(bookmark.saved_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
              <button 
                onClick={() => handleDelete(bookmark.id)}
                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                title="Delete bookmark"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
