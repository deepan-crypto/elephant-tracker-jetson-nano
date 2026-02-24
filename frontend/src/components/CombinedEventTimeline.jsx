/**
 * CombinedEventTimeline.jsx
 * --------------------------
 * Unified scrollable event feed merging elephant detections + RF intrusions.
 * Polls /api/threat-logs every 10 seconds. Color-coded left border per event type.
 */
import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const LEVEL_CONFIG = {
    SAFE: { color: '#4ade80', icon: '🛡️', label: 'Safe' },
    WILDLIFE_ALERT: { color: '#fbbf24', icon: '🐘', label: 'Wildlife Alert' },
    HUMAN_INTRUSION: { color: '#fb923c', icon: '📡', label: 'Human Intrusion' },
    CRITICAL_ALERT: { color: '#ef4444', icon: '🚨', label: 'Critical Alert' },
};

function EventItem({ event }) {
    const cfg = LEVEL_CONFIG[event.threat_level] || LEVEL_CONFIG.SAFE;
    const time = event.timestamp
        ? new Date(event.timestamp).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';

    return (
        <div className="timeline-item" style={{ borderLeftColor: cfg.color }}>
            <div className="timeline-item-header">
                <span className="timeline-icon">{cfg.icon}</span>
                <span className="timeline-level" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="timeline-time">{time}</span>
            </div>
            <div className="timeline-item-body">
                <div className="timeline-chips">
                    <span className={`timeline-chip ${event.elephant_detected ? 'chip-alert' : 'chip-clear'}`}>
                        🐘 {event.elephant_detected ? 'Elephant Detected' : 'No Elephant'}
                    </span>
                    <span className={`timeline-chip ${event.rf_status === 'INTRUSION' ? 'chip-alert' : 'chip-clear'}`}>
                        📡 RF: {event.rf_status}
                    </span>
                    {event.acknowledged && (
                        <span className="timeline-chip chip-ack">✅ Acknowledged by {event.acknowledged_by}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function CombinedEventTimeline({ socket, token }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);
    const listRef = useRef(null);

    const fetchLogs = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/threat-logs?limit=30`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setEvents(data.logs || []);
            setLoading(false);
            setError(null);
        } catch (e) {
            setError(e.message);
            setLoading(false);
        }
    };

    // Real-time push via socket (prepend new events)
    useEffect(() => {
        if (!socket) return;
        const handler = (payload) => {
            const threat = payload.threat;
            if (!threat || threat.threat_level === 'SAFE') return;
            const newEvent = {
                threat_level: threat.threat_level,
                elephant_detected: threat.elephant_detected,
                rf_status: threat.rf_status,
                timestamp: threat.timestamp,
                acknowledged: false,
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 50));
        };
        socket.on('rf-update', handler);
        socket.on('telemetry-update', (payload) => {
            if (payload.hazards?.length > 0) {
                const newEvent = {
                    threat_level: 'WILDLIFE_ALERT',
                    elephant_detected: true,
                    rf_status: 'SAFE',
                    timestamp: payload.timestamp || new Date().toISOString(),
                    acknowledged: false,
                };
                setEvents(prev => [newEvent, ...prev].slice(0, 50));
            }
        });
        return () => {
            socket.off('rf-update', handler);
            socket.off('telemetry-update');
        };
    }, [socket]);

    // Initial + periodic fetch
    useEffect(() => {
        if (token) {
            fetchLogs();
            pollRef.current = setInterval(fetchLogs, 10_000);
        }
        return () => clearInterval(pollRef.current);
    }, [token]);

    return (
        <div className="timeline-card">
            <div className="timeline-header">
                <span className="timeline-title">🗓 Combined Event Timeline</span>
                <span className="timeline-count">{events.length} events</span>
            </div>

            {loading && <div className="timeline-loading">Loading events...</div>}
            {error && <div className="timeline-error">⚠️ {error}</div>}

            {!loading && events.length === 0 && (
                <div className="timeline-empty">No threat events recorded yet. System is monitoring.</div>
            )}

            <div className="timeline-list" ref={listRef}>
                {events.map((ev, i) => <EventItem key={i} event={ev} />)}
            </div>
        </div>
    );
}
