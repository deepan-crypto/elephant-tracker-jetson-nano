/**
 * CriticalAlertPopup.jsx
 * -----------------------
 * Full-screen overlay alert that appears ONLY on CRITICAL_ALERT threat level.
 * Auto-dismisses after 30 seconds. Plays a browser Audio API alarm tone.
 * Manual dismiss resets the 30-second timer.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const DISMISS_SECONDS = 30;

// ── Alarm tone generator using Web Audio API ─────────────────────────────────
function playAlarmTone() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const frequencies = [880, 1100, 880, 1100, 660];
        let t = ctx.currentTime;
        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
            t += 0.35;
        });
    } catch {/* silently fail if audio not permitted */ }
}

export default function CriticalAlertPopup({ threat, onDismiss }) {
    const [visible, setVisible] = useState(false);
    const [countdown, setCountdown] = useState(DISMISS_SECONDS);
    const timerRef = useRef(null);
    const countRef = useRef(null);
    const shownLevel = useRef(null);

    const dismiss = useCallback(() => {
        clearInterval(timerRef.current);
        clearInterval(countRef.current);
        setVisible(false);
        shownLevel.current = null;
        onDismiss?.();
    }, [onDismiss]);

    // Show popup when threat escalates to CRITICAL_ALERT
    useEffect(() => {
        if (threat?.threat_level === 'CRITICAL_ALERT' && shownLevel.current !== 'CRITICAL_ALERT') {
            shownLevel.current = 'CRITICAL_ALERT';
            setCountdown(DISMISS_SECONDS);
            setVisible(true);
            playAlarmTone();

            // Countdown display
            countRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        dismiss();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            // Auto-dismiss
            timerRef.current = setTimeout(dismiss, DISMISS_SECONDS * 1000);
        } else if (threat?.threat_level !== 'CRITICAL_ALERT') {
            shownLevel.current = null;
        }
        return () => {
            clearTimeout(timerRef.current);
            clearInterval(countRef.current);
        };
    }, [threat?.threat_level]);

    if (!visible) return null;

    const ts = threat?.timestamp
        ? new Date(threat.timestamp).toLocaleString('en-IN')
        : new Date().toLocaleString('en-IN');

    return (
        <div className="critical-overlay" role="alertdialog" aria-modal="true">
            <div className="critical-popup">
                {/* Pulsing alert icon */}
                <div className="critical-icon-wrapper">
                    <span className="critical-icon pulse-red-icon">🚨</span>
                </div>

                <h1 className="critical-title">CRITICAL ALERT</h1>
                <p className="critical-subtitle">
                    Potential Poacher Activity Detected
                </p>

                <div className="critical-info-grid">
                    <div className="critical-info-cell">
                        <label>🐘 Elephant</label>
                        <span className="cell-alert">DETECTED</span>
                    </div>
                    <div className="critical-info-cell">
                        <label>📡 RF Signal</label>
                        <span className="cell-alert">INTRUSION</span>
                    </div>
                    {threat?.max_power_dbm !== undefined && (
                        <div className="critical-info-cell">
                            <label>Signal Power</label>
                            <span>{threat.max_power_dbm?.toFixed(1)} dBm</span>
                        </div>
                    )}
                    <div className="critical-info-cell">
                        <label>Time</label>
                        <span>{ts}</span>
                    </div>
                </div>

                <p className="critical-instruction">
                    Immediately alert forest officers and verify camera feed.
                    Avoid entering the zone without backup.
                </p>

                <div className="critical-action-row">
                    <button className="critical-btn-dismiss" onClick={dismiss}>
                        ✅ Acknowledge Alert
                    </button>
                    <div className="critical-countdown">
                        Auto-dismiss in <strong>{countdown}s</strong>
                    </div>
                </div>

                {/* Progress bar for countdown */}
                <div className="critical-progress-track">
                    <div
                        className="critical-progress-bar"
                        style={{ width: `${(countdown / DISMISS_SECONDS) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
