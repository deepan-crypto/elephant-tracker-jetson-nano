/**
 * RFMonitorPanel.jsx
 * ------------------
 * Displays real-time RF signal status from the Rigol DSA832E spectrum analyzer.
 * Subscribes to Socket.io 'rf-update' events for live updates.
 * Falls back to polling /api/rf-status every 5 seconds if socket unavailable.
 */
import { useState, useEffect, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// ── Sub-components ─────────────────────────────────────────────────────────────

function PowerMeter({ value, threshold }) {
    const MIN_DBM = -100;
    const MAX_DBM = 0;
    const pct = Math.min(100, Math.max(0, ((value - MIN_DBM) / (MAX_DBM - MIN_DBM)) * 100));
    const thresholdPct = ((threshold - MIN_DBM) / (MAX_DBM - MIN_DBM)) * 100;
    const isHot = value >= threshold;

    return (
        <div className="rf-meter-wrapper">
            <div className="rf-meter-labels">
                <span>{MIN_DBM} dBm</span>
                <span style={{ color: isHot ? '#ef4444' : '#4ade80', fontWeight: 700 }}>
                    {value !== null ? `${value.toFixed(1)} dBm` : '—'}
                </span>
                <span>{MAX_DBM} dBm</span>
            </div>
            <div className="rf-meter-track">
                <div
                    className="rf-meter-fill"
                    style={{
                        width: `${pct}%`,
                        background: isHot
                            ? 'linear-gradient(90deg, #16a34a, #f59e0b, #ef4444)'
                            : 'linear-gradient(90deg, #16a34a, #22c55e)',
                    }}
                />
                {/* Threshold marker line */}
                <div
                    className="rf-threshold-marker"
                    style={{ left: `${thresholdPct}%` }}
                    title={`Threshold: ${threshold} dBm`}
                />
            </div>
            <div className="rf-threshold-label" style={{ marginLeft: `${thresholdPct}%` }}>
                {threshold} dBm
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const isIntrusion = status === 'INTRUSION';
    return (
        <div className={`rf-status-badge ${isIntrusion ? 'intrusion' : 'safe'}`}>
            <span className={`rf-status-dot ${isIntrusion ? 'pulse-red' : 'pulse-green'}`} />
            <span className="rf-status-text">{status || 'UNKNOWN'}</span>
        </div>
    );
}

// ── Custom Tooltip for graph ───────────────────────────────────────────────────
function RFTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rf-chart-tooltip">
            <p className="tooltip-label">{label}</p>
            <p style={{ color: payload[0]?.value >= -40 ? '#ef4444' : '#4ade80' }}>
                {payload[0]?.value?.toFixed(1)} dBm
            </p>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RFMonitorPanel({ socket }) {
    const [rfData, setRfData] = useState(null);
    const [history, setHistory] = useState([]);   // [{time, power}] last 30
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const pollRef = useRef(null);

    const updateFromPayload = (payload) => {
        const rf = payload.rf ?? payload;
        setRfData(rf);
        setLastUpdate(new Date());
        setLoading(false);

        const timeLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setHistory(prev => {
            const next = [...prev, { time: timeLabel, power: rf.max_power_dbm ?? -90 }];
            return next.slice(-30); // keep last 30
        });
    };

    // Socket subscription
    useEffect(() => {
        if (!socket) return;
        socket.on('rf-update', updateFromPayload);
        return () => socket.off('rf-update', updateFromPayload);
    }, [socket]);

    // Initial fetch + polling fallback
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const resp = await fetch(`${API_URL}/api/rf-status`);
                if (resp.ok) {
                    const data = await resp.json();
                    updateFromPayload(data);
                }
            } catch {/* ignore */ }
        };

        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 5000);
        return () => clearInterval(pollRef.current);
    }, []);

    const freqMHz = rfData?.center_freq_hz ? (rfData.center_freq_hz / 1e6).toFixed(0) : '—';
    const spanMHz = rfData?.span_hz ? (rfData.span_hz / 1e6).toFixed(0) : '—';

    return (
        <div className="rf-panel-card">
            {/* Header */}
            <div className="rf-panel-header">
                <div className="rf-panel-title-row">
                    <span className="rf-icon">📻</span>
                    <h3 className="rf-panel-title">RF Intrusion Monitor</h3>
                    <span className="rf-subtitle">Rigol DSA832E · SCPI/USB</span>
                </div>
                {rfData && <StatusBadge status={rfData.status} />}
            </div>

            {loading ? (
                <div className="rf-loading">
                    <div className="rf-spinner" />
                    <p>Connecting to RF service...</p>
                </div>
            ) : (
                <>
                    {/* Frequency Info */}
                    <div className="rf-info-grid">
                        <div className="rf-info-cell">
                            <label>Center Frequency</label>
                            <span className="rf-info-value">{freqMHz} <small>MHz</small></span>
                        </div>
                        <div className="rf-info-cell">
                            <label>Span</label>
                            <span className="rf-info-value">{spanMHz} <small>MHz</small></span>
                        </div>
                        <div className="rf-info-cell">
                            <label>Threshold</label>
                            <span className="rf-info-value" style={{ color: '#f59e0b' }}>
                                {rfData?.threshold_dbm ?? '—'} <small>dBm</small>
                            </span>
                        </div>
                        <div className="rf-info-cell">
                            <label>Scan Time</label>
                            <span className="rf-info-value">
                                {rfData?.scan_duration_ms?.toFixed(0) ?? '—'} <small>ms</small>
                            </span>
                        </div>
                    </div>

                    {/* Power Meter */}
                    <div className="rf-section-label">Signal Power</div>
                    <PowerMeter
                        value={rfData?.max_power_dbm ?? -90}
                        threshold={rfData?.threshold_dbm ?? -40}
                    />

                    {/* Historical Graph */}
                    {history.length > 1 && (
                        <>
                            <div className="rf-section-label" style={{ marginTop: '1rem' }}>Signal History</div>
                            <ResponsiveContainer width="100%" height={140}>
                                <AreaChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                                    <defs>
                                        <linearGradient id="rfGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" />
                                    <YAxis domain={[-100, 0]} tick={{ fontSize: 9, fill: '#9ca3af' }} />
                                    <Tooltip content={<RFTooltip />} />
                                    <ReferenceLine y={rfData?.threshold_dbm ?? -40} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Threshold', fill: '#ef4444', fontSize: 9 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="power"
                                        stroke="#22c55e"
                                        fill="url(#rfGradient)"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </>
                    )}

                    {/* Footer */}
                    <div className="rf-panel-footer">
                        <span>Last update: {lastUpdate ? lastUpdate.toLocaleTimeString('en-IN') : '—'}</span>
                        {rfData?.error && <span className="rf-error-tag">⚠️ {rfData.error}</span>}
                    </div>
                </>
            )}
        </div>
    );
}
