import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, CheckCircle2, XCircle, Key, Cpu, Terminal } from 'lucide-react';

interface SettingsData {
    openaiKeyFound: boolean;
    ytDlpFound: boolean;
    ffmpegFound: boolean;
    keyPath: string;
}

export default function SettingsTab() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch settings:', err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="state-loading"><div className="spinner" /></div>;

    return (
        <div className="setup-container">
            <div className="setup-header">
                <div className="setup-header-text">
                    <h3>System Settings & Dependencies</h3>
                    <p>Verify that your environment is correctly configured for video transcription.</p>
                </div>
            </div>

            <div className="settings-grid" style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                {/* OpenAI Key */}
                <div className={`settings-item ${settings?.openaiKeyFound ? 'status-ok' : 'status-bad'}`}>
                    <div className="settings-icon"><Key size={20} /></div>
                    <div className="settings-info">
                        <h4>OpenAI Whisper API</h4>
                        <p>Status: {settings?.openaiKeyFound ? 'Key Found' : 'Key Missing'}</p>
                        <small>Looking in: {settings?.keyPath}</small>
                    </div>
                    <div className="status-indicator">
                        {settings?.openaiKeyFound ? <CheckCircle2 color="var(--success)" /> : <XCircle color="var(--danger)" />}
                    </div>
                </div>

                {/* yt-dlp */}
                <div className={`settings-item ${settings?.ytDlpFound ? 'status-ok' : 'status-bad'}`}>
                    <div className="settings-icon"><Terminal size={20} /></div>
                    <div className="settings-info">
                        <h4>yt-dlp</h4>
                        <p>Status: {settings?.ytDlpFound ? 'Installed' : 'Not Found'}</p>
                        <small>Used for audio extraction from video URLs.</small>
                    </div>
                    <div className="status-indicator">
                        {settings?.ytDlpFound ? <CheckCircle2 color="var(--success)" /> : <XCircle color="var(--danger)" />}
                    </div>
                </div>

                {/* ffmpeg */}
                <div className={`settings-item ${settings?.ffmpegFound ? 'status-ok' : 'status-bad'}`}>
                    <div className="settings-icon"><Cpu size={20} /></div>
                    <div className="settings-info">
                        <h4>FFmpeg</h4>
                        <p>Status: {settings?.ffmpegFound ? 'Installed' : 'Not Found'}</p>
                        <small>Used for audio processing and duration detection.</small>
                    </div>
                    <div className="status-indicator">
                        {settings?.ffmpegFound ? <CheckCircle2 color="var(--success)" /> : <XCircle color="var(--danger)" />}
                    </div>
                </div>
            </div>

            <div className="setup-instructions" style={{ borderTop: '1px solid var(--border)' }}>
                <h4>Troubleshooting</h4>
                <ul className="setup-steps" style={{ marginTop: '0.5rem' }}>
                    <li>If <strong>yt-dlp</strong> or <strong>FFmpeg</strong> are missing, please install them and ensure they are in your system's PATH.</li>
                    <li>The OpenAI key should be a plain text file containing only your <code>sk-...</code> key.</li>
                </ul>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .settings-item {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          transition: all var(--transition-fast);
        }
        .settings-item.status-ok {
           border-left: 4px solid var(--success);
        }
        .settings-item.status-bad {
           border-left: 4px solid var(--danger);
        }
        .settings-icon {
          width: 48px;
          height: 48px;
          background: var(--bg-elevated);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .settings-info {
          flex: 1;
        }
        .settings-info h4 {
          margin: 0;
          font-size: 1rem;
          color: var(--text-primary);
        }
        .settings-info p {
          margin: 2px 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .settings-info small {
          display: block;
          margin-top: 4px;
          color: var(--text-muted);
          font-family: monospace;
          font-size: 0.75rem;
        }
        .status-indicator {
          flex-shrink: 0;
        }
      `}} />
        </div>
    );
}
