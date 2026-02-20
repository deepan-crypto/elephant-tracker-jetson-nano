import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Volume2, Bell } from 'lucide-react';

// Notification container that manages multiple toast notifications
export function NotificationContainer({ notifications, onDismiss }) {
    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md">
            {notifications.map((notification) => (
                <NotificationToast
                    key={notification.id}
                    notification={notification}
                    onDismiss={() => onDismiss(notification.id)}
                />
            ))}
        </div>
    );
}

// Individual notification toast
function NotificationToast({ notification, onDismiss }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        // Auto-dismiss after 8 seconds
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onDismiss, 300);
        }, 8000);

        return () => clearTimeout(timer);
    }, [onDismiss]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 300);
    };

    const severityStyles = {
        high: {
            container: 'bg-red-950/95 border-red-500/50 shadow-red-500/20',
            icon: 'bg-red-500/20 text-red-400',
            title: 'text-red-400',
            badge: 'bg-red-500/20 text-red-400 border-red-500/30',
        },
        medium: {
            container: 'bg-amber-950/95 border-amber-500/50 shadow-amber-500/20',
            icon: 'bg-amber-500/20 text-amber-400',
            title: 'text-amber-400',
            badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        },
        low: {
            container: 'bg-blue-950/95 border-blue-500/50 shadow-blue-500/20',
            icon: 'bg-blue-500/20 text-blue-400',
            title: 'text-blue-400',
            badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        },
    };

    const styles = severityStyles[notification.severity] || severityStyles.medium;

    return (
        <div
            className={`
                ${styles.container}
                backdrop-blur-xl border rounded-xl p-4 shadow-2xl
                transform transition-all duration-300 ease-out
                ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
                animate-slide-in
            `}
        >
            <div className="flex items-start gap-3">
                <div className={`${styles.icon} p-2.5 rounded-lg shrink-0`}>
                    <AlertTriangle className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`${styles.badge} text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider`}>
                            {notification.severity === 'high' ? '🚨 CRITICAL' : notification.severity === 'medium' ? '⚠️ WARNING' : 'ℹ️ INFO'}
                        </span>
                        <span className="text-zinc-500 text-[10px] font-mono">
                            {notification.time}
                        </span>
                    </div>

                    <h4 className={`${styles.title} font-bold text-sm mb-1`}>
                        🐘 Elephant Detected!
                    </h4>

                    <p className="text-zinc-300 text-xs leading-relaxed">
                        {notification.message}
                    </p>

                    <div className="flex items-center gap-2 mt-3">
                        <span className="text-[10px] text-zinc-500 font-mono">
                            Confidence: <span className="text-emerald-400 font-bold">{notification.confidence}</span>
                        </span>
                        {notification.soundTriggered && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                <Volume2 className="w-3 h-3" />
                                Sound Alert Active
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleDismiss}
                    className="text-zinc-500 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// Custom hook to manage notifications
export function useNotifications() {
    const [notifications, setNotifications] = useState([]);

    const addNotification = useCallback((notification) => {
        const id = Date.now() + Math.random();
        setNotifications((prev) => [
            {
                id,
                time: new Date().toLocaleTimeString(),
                ...notification,
            },
            ...prev,
        ].slice(0, 5)); // Keep max 5 notifications

        // Play alert sound for high severity
        if (notification.severity === 'high') {
            playAlertSound();
        }

        return id;
    }, []);

    const dismissNotification = useCallback((id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    return {
        notifications,
        addNotification,
        dismissNotification,
        clearAll,
    };
}

// Play alert sound (browser audio)
function playAlertSound() {
    try {
        // Create an oscillator for a warning beep
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        // Second beep
        setTimeout(() => {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 1000;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.3);
        }, 200);
    } catch (e) {
        console.log('Audio alert not supported:', e);
    }
}

export default NotificationContainer;
