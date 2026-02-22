import { useState, useEffect } from 'react';
import { Bookmark, Search, Settings, BarChart3 } from 'lucide-react';
import BookmarksList from './components/BookmarksList';
import TampermonkeyScript from './components/TampermonkeyScript';

type Tab = 'bookmarks' | 'setup';

interface Stats {
    totalBookmarks: number;
    lastSynced: string | null;
}

export default function App() {
    const [activeTab, setActiveTab] = useState<Tab>('bookmarks');
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState<Stats>({ totalBookmarks: 0, lastSynced: null });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/stats');
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch {
                // silently ignore — stats are secondary
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="app">
            {/* Header */}
            <header className="app-header">
                <div className="header-inner">
                    <div className="logo">
                        <span className="logo-icon">✦</span>
                        XMarks
                    </div>
                    <div className="header-stats">
                        <div className="stat-pill">
                            <BarChart3 size={14} />
                            <span className="stat-value">{stats.totalBookmarks}</span> bookmarks
                        </div>
                        {stats.lastSynced && (
                            <div className="stat-pill">
                                Synced {new Date(stats.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <nav className="tab-nav">
                <div className="tab-nav-inner">
                    <button
                        className={`tab-btn ${activeTab === 'bookmarks' ? 'active' : ''}`}
                        onClick={() => setActiveTab('bookmarks')}
                    >
                        <Bookmark size={16} />
                        Bookmarks
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'setup' ? 'active' : ''}`}
                        onClick={() => setActiveTab('setup')}
                    >
                        <Settings size={16} />
                        Setup
                    </button>
                </div>
            </nav>

            {/* Main */}
            <main className="main-content">
                {activeTab === 'bookmarks' && (
                    <>
                        <div className="search-container">
                            <div className="search-bar">
                                <Search size={18} />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search bookmarks by text, author, or tags…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <BookmarksList searchQuery={searchQuery} />
                    </>
                )}
                {activeTab === 'setup' && <TampermonkeyScript />}
            </main>
        </div>
    );
}
