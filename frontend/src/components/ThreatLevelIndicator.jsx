/**
 * ThreatLevelIndicator.jsx
 * -------------------------
 * Large color-coded card showing the current fused threat level.
 * Updates via Socket.io 'rf-update' event or polls /api/threat-status.
 *
 * Levels:
 *   SAFE            → dark green  (no action)
 *   WILDLIFE_ALERT  → amber       (elephant detected)
 *   HUMAN_INTRUSION → orange-red  (RF only)
 *   CRITICAL_ALERT  → pulsing red (elephant + RF)
 */
import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const THREAT_CONFIG = {
    SAFE: {
        icon: '🛡️',
        label: 'SAFE',
        bg: 'linear-gradient(135deg, #14532d 0%, #166534 100%)',
        glow: 'rgba(20, 83, 45, 0.5)',
        badge: '#4ade80',
        pulse: false,
    },
    WILDLIFE_ALERT: {
        icon: '🐘',
        label: 'WILDLIFE ALERT',
        bg: 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
        glow: 'rgba(120, 53, 15, 0.6)',
        badge: '#fbbf24',
        pulse: false,
    },
    HUMAN_INTRUSION: {
        icon: '📡',
        label: 'HUMAN INTRUSION',
        bg: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)',
        glow: 'rgba(124, 45, 18, 0.7)',
        badge: '#fb923c',
        pulse: false,
    },
    CRITICAL_ALERT: {
        icon: '🚨',
        label: 'CRITICAL ALERT',
        bg: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)',
        glow: 'rgba(127, 29, 29, 0.9)',
        badge: '#f87171',
        pulse: true,
    },
};

export default function ThreatLevelIndicator({ socket }) {
    const [threat, setThreat] = useState(null);
    const pollRef = useRef(null);

    const handleThreatData = (data) => {
        const t = data.threat ?? data;
        if (t?.threat_level) setThreat(t);
    };

    // Socket subscription
    useEffect(() => {
        if (!socket) return;
        socket.on('rf-update', handleThreatData);
        return () => socket.off('rf-update', handleThreatData);
    }, [socket]);

    // Polling fallback
    useEffect(() => {
        const fetch_status = async () => {
            try {
                const resp = await fetch(`${API_URL}/api/threat-status`);
                if (resp.ok) handleThreatData(await resp.json());
            } catch {/* ignore */ }
        };
        fetch_status();
        pollRef.current = setInterval(fetch_status, 5000);
        return () => clearInterval(pollRef.current);
    }, []);

    const level = threat?.threat_level || 'SAFE';
    const cfg = THREAT_CONFIG[level] || THREAT_CONFIG.SAFE;
    const ts = threat?.timestamp ? new Date(threat.timestamp).toLocaleTimeString('en-IN') : '—';

    return (
        <div
            className={`threat-card ${cfg.pulse ? 'threat-pulse' : ''}`}
            style={{ background: cfg.bg, boxShadow: `0 0 32px ${cfg.glow}` }}
        >
            {/* Badge row */}
            <div className="threat-badge-row">
                <span className="threat-badge-dot" style={{ background: cfg.badge }} />
                <span className="threat-badge-text" style={{ color: cfg.badge }}>
                    THREAT LEVEL
                </span>
            </div>

            {/* Main display */}
            <div className="threat-icon-row">
                <span className="threat-icon">{cfg.icon}</span>
                <div className="threat-label-col">
                    <h2 className="threat-label">{cfg.label}</h2>
                    <p className="threat-description">{threat?.description || 'Evaluating...'}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="threat-stats-row">
                <div className="threat-stat">
                    <label>Elephant</label>
                    <span style={{ color: threat?.elephant_detected ? '#fb923c' : '#4ade80' }}>
                        {threat?.elephant_detected ? '● Detected' : '○ Clear'}
                    </span>
                </div>
                <div className="threat-stat">
                    <label>RF Signal</label>
                    <span style={{ color: threat?.rf_status === 'INTRUSION' ? '#f87171' : '#4ade80' }}>
                        {threat?.rf_status === 'INTRUSION' ? '● Intrusion' : '○ Clear'}
                    </span>
                </div>
                <div className="threat-stat">
                    <label>Priority</label>
                    <span>{threat?.priority ?? 0} / 3</span>
                </div>
                <div className="threat-stat">
                    <label>Updated</label>
                    <span>{ts}</span>
                </div>
            </div>
        </div>
    );
}
