import { useState, useEffect } from 'react';
import { Bookmark, Search, Settings, BarChart3, FileText, Download, Trash2 } from 'lucide-react';
import BookmarksList from './components/BookmarksList';
import TampermonkeyScript from './components/TampermonkeyScript';

type Tab = 'bookmarks' | 'setup';

interface Stats {
    totalBookmarks: number;
    totalArticles: number;
    lastSynced: string | null;
}

export default function App() {
    const [activeTab, setActiveTab] = useState<Tab>('bookmarks');
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState<Stats>({ totalBookmarks: 0, totalArticles: 0, lastSynced: null });
    const [exporting, setExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/stats');
                if (res.ok) setStats(await res.json());
            } catch { /* stats are secondary */ }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/export', { method: 'POST' });
            if (!res.ok) throw new Error('Export failed');
            const data = await res.json();
            // Trigger download
            window.open(`/api/export/download/${data.filename}`, '_blank');
        } catch (err) {
            console.error('Export error:', err);
            alert('Export failed. Check the console for details.');
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteAll = async () => {
        const confirmed = window.confirm(
            `Delete ALL ${stats.totalBookmarks} bookmarks and their articles? This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            const res = await fetch('/api/bookmarks/all', { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            setStats(prev => ({ ...prev, totalBookmarks: 0, totalArticles: 0 }));
            setRefreshKey(k => k + 1);
        } catch (err) {
            console.error('Delete all error:', err);
            alert('Failed to delete bookmarks.');
        }
    };

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
                        <div className="stat-pill">
                            <FileText size={14} />
                            <span className="stat-value">{stats.totalArticles}</span> articles
                        </div>
                        {stats.lastSynced && (
                            <div className="stat-pill">
                                Synced {new Date(stats.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}
                        <button
                            className="delete-all-btn"
                            onClick={handleDeleteAll}
                            disabled={stats.totalBookmarks === 0}
                            title="Delete all bookmarks"
                        >
                            <Trash2 size={14} />
                            Delete All
                        </button>
                        <button
                            className="export-btn"
                            onClick={handleExport}
                            disabled={exporting || stats.totalBookmarks === 0}
                            title="Export all bookmarks as Markdown + ZIP"
                        >
                            <Download size={14} />
                            {exporting ? 'Exporting…' : 'Export'}
                        </button>
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
                                    placeholder="Search bookmarks, articles, authors…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <BookmarksList searchQuery={searchQuery} refreshKey={refreshKey} />
                    </>
                )}
                {activeTab === 'setup' && <TampermonkeyScript />}
            </main>
        </div>
    );
}
