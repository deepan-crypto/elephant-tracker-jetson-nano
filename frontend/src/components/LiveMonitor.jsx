import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, MapPin, Gauge, Send, ScanLine, WifiOff, Wifi, Volume2 } from 'lucide-react';
import { NotificationContainer, useNotifications } from './Notification';

// Socket + API URL from env — falls back to localhost for dev
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function LiveMonitor({ cameraId }) {
    const [connected, setConnected] = useState(false);
    const [telemetry, setTelemetry] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const socketRef = useRef(null);
    const lastNotificationRef = useRef(null);
    const { notifications, addNotification, dismissNotification } = useNotifications();

    useEffect(() => {
        // Connect to Socket.io backend
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Socket.io connected:', socket.id);
            setConnected(true);
            // Request the latest telemetry snapshot on connect
            socket.emit('request-latest-telemetry');
        });

        socket.on('disconnect', () => {
            console.log('❌ Socket.io disconnected');
            setConnected(false);
        });

        // Real-time telemetry from Jetson Nano → backend → browser
        socket.on('telemetry-update', (data) => {
            setTelemetry(data);

            // Build alert list from hazards
            if (data.hazards && data.hazards.length > 0) {
                const newAlerts = data.hazards.map((h, i) => ({
                    id: `${data.timestamp}-${i}`,
                    time: new Date(data.receivedAt || data.timestamp).toLocaleTimeString(),
                    severity:
                        h.confidence > 0.85 ? 'high' :
                            h.confidence > 0.65 ? 'medium' : 'low',
                    text: h.name,
                    prob: `${(h.confidence * 100).toFixed(1)}%`,
                    bbox: { xmin: h.xmin, ymin: h.ymin, xmax: h.xmax, ymax: h.ymax },
                }));
                setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20)); // Keep last 20

                // Trigger real-time notification for new elephant detections
                const now = Date.now();
                if (!lastNotificationRef.current || now - lastNotificationRef.current > 3000) {
                    lastNotificationRef.current = now;
                    const highestConfidence = Math.max(...data.hazards.map(h => h.confidence));
                    const severity = highestConfidence > 0.85 ? 'high' : highestConfidence > 0.65 ? 'medium' : 'low';
                    
                    addNotification({
                        severity,
                        message: `${data.hazards.length} elephant${data.hazards.length > 1 ? 's' : ''} detected near railway track. Sound alert ${soundEnabled ? 'triggered' : 'disabled'}.`,
                        confidence: `${(highestConfidence * 100).toFixed(1)}%`,
                        soundTriggered: soundEnabled,
                    });
                }
            }
        });

        // Also handle the snapshot response from 'request-latest-telemetry'
        socket.on('latest-telemetry', (data) => {
            if (data) setTelemetry(data);
        });

        // ── Keep-alive ping every 10 min so Render free-tier doesn't sleep ──
        // This hits /health while the user has the dashboard open.
        const keepAlive = setInterval(() => {
            fetch(`${API_URL}/health`).catch(() => { });
        }, 10 * 60 * 1000);

        return () => {
            clearInterval(keepAlive);
            socket.disconnect();
        };
    }, [addNotification, soundEnabled]);

    const gps = telemetry?.gps_location;
    const hazards = telemetry?.hazards || [];
    const imageBase64 = telemetry?.image_stream;

    // Compute bounding box overlay positions as % of the image container
    const getBboxStyle = (bbox, containerW = 1280, containerH = 720) => ({
        left: `${(bbox.xmin / containerW) * 100}%`,
        top: `${(bbox.ymin / containerH) * 100}%`,
        width: `${((bbox.xmax - bbox.xmin) / containerW) * 100}%`,
        height: `${((bbox.ymax - bbox.ymin) / containerH) * 100}%`,
    });

    return (
        <div className="p-8 h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
            {/* Real-time Notification Toast Container */}
            <NotificationContainer 
                notifications={notifications} 
                onDismiss={dismissNotification} 
            />
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">

                {/* Main Video Feed Area */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative aspect-video group shadow-2xl shadow-black/50">

                        {/* Live Camera Feed from Jetson Nano */}
                        {imageBase64 ? (
                            <img
                                src={imageBase64}
                                alt="Jetson Nano Live Detection Feed"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            /* Waiting state */
                            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                <div
                                    className="w-full h-full opacity-20"
                                    style={{
                                        backgroundImage: 'radial-gradient(circle at 50% 50%, #3f3f46 1px, transparent 1px)',
                                        backgroundSize: '20px 20px',
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-zinc-600 flex flex-col items-center gap-4">
                                        <ScanLine className="w-16 h-16 opacity-50 animate-pulse" />
                                        <p className="text-sm font-mono opacity-70">
                                            {connected ? 'Waiting for Jetson Orin Nano feed…' : 'Connecting to server…'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dynamic bounding box overlays from Jetson hazard data */}
                        {hazards.map((h, i) => {
                            const style = getBboxStyle(h);
                            const isHigh = h.confidence > 0.85;
                            const color = isHigh ? 'red' : h.confidence > 0.65 ? 'amber' : 'blue';
                            const colorClass = {
                                red: 'border-red-500/80 bg-red-500/10 shadow-red-500/20',
                                amber: 'border-amber-500/80 bg-amber-500/10 shadow-amber-500/20',
                                blue: 'border-blue-500/80 bg-blue-500/10 shadow-blue-500/20',
                            }[color];
                            const labelClass = {
                                red: 'bg-red-500/90 text-white',
                                amber: 'bg-amber-500/90 text-black',
                                blue: 'bg-blue-500/90 text-white',
                            }[color];
                            return (
                                <div
                                    key={i}
                                    className={`absolute border-2 backdrop-blur-[2px] ${colorClass} shadow-lg`}
                                    style={{ ...style, position: 'absolute' }}
                                >
                                    <span className={`absolute -top-5 left-0 ${labelClass} text-[10px] px-2 py-0.5 rounded-t-sm font-bold whitespace-nowrap`}>
                                        {h.name} ({(h.confidence * 100).toFixed(1)}%)
                                    </span>
                                </div>
                            );
                        })}

                        {/* Status Overlays */}
                        <div className="absolute top-6 left-6 flex items-center gap-3">
                            <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/5 text-xs font-mono text-emerald-400 flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${imageBase64 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                                {imageBase64 ? 'LIVE FEED' : 'NO SIGNAL'}
                            </div>
                            <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/5 text-xs font-mono text-zinc-300">
                                {cameraId} • Jetson Orin Nano
                            </div>
                        </div>

                        {/* WebSocket connection badge + Sound Toggle */}
                        <div className="absolute top-6 right-6 flex items-center gap-2">
                            <button
                                onClick={() => setSoundEnabled(!soundEnabled)}
                                className={`px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 backdrop-blur-md border transition-all ${
                                    soundEnabled 
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                                        : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/20'
                                }`}
                                title={soundEnabled ? 'Sound alerts ON' : 'Sound alerts OFF'}
                            >
                                <Volume2 className="w-3 h-3" />
                                {soundEnabled ? 'SOUND ON' : 'SOUND OFF'}
                            </button>
                            <div className={`px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5 backdrop-blur-md border ${connected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                {connected ? 'WS CONNECTED' : 'DISCONNECTED'}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Telemetry Panel */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg">
                            <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Gauge className="w-4 h-4 text-indigo-500" /> Elephant Detection Telemetry
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-950/50 p-5 rounded-xl border border-zinc-800/50 group hover:border-zinc-700 transition-all">
                                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-2 font-bold">Elephants Detected</span>
                                    <div className="text-3xl font-bold text-white font-mono flex items-end gap-2">
                                        {hazards.length}
                                        <span className="text-sm text-zinc-500 font-sans mb-1">active</span>
                                    </div>
                                    <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${hazards.length > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                            style={{ width: hazards.length > 0 ? '100%' : '10%' }}
                                        />
                                    </div>
                                </div>
                                <div className="bg-zinc-950/50 p-5 rounded-xl border border-zinc-800/50 group hover:border-zinc-700 transition-all">
                                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-2 font-bold">Last Update</span>
                                    <div className="text-sm font-bold text-emerald-400 font-mono">
                                        {telemetry?.receivedAt
                                            ? new Date(telemetry.receivedAt).toLocaleTimeString()
                                            : '—'}
                                    </div>
                                    <div className="mt-2 text-[10px] text-zinc-600 font-mono">
                                        {telemetry?.timestamp || 'No data yet'}
                                    </div>
                                </div>
                                <div className="col-span-2 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50 flex items-center justify-between group hover:border-zinc-700 transition-all">
                                    <div>
                                        <span className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-1 font-bold">GPS Location</span>
                                        <div className="text-zinc-300 font-mono text-sm tracking-tight">
                                            {gps
                                                ? `${gps.lat.toFixed(6)}° N, ${gps.lon.toFixed(6)}° E`
                                                : 'Awaiting GPS data…'}
                                        </div>
                                    </div>
                                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                                        <MapPin className="w-5 h-5 text-indigo-500" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Detection Summary */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-lg">
                            <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">
                                Detection Summary
                            </h3>
                            {hazards.length > 0 ? (
                                <div className="space-y-3">
                                    {hazards.slice(0, 4).map((h, i) => (
                                        <div key={i} className="flex items-center justify-between bg-zinc-950/50 px-4 py-3 rounded-xl border border-zinc-800/50">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className={`w-4 h-4 ${h.confidence > 0.85 ? 'text-red-500' : h.confidence > 0.65 ? 'text-amber-500' : 'text-blue-500'}`} />
                                                <span className="text-zinc-300 text-sm font-medium">{h.name}</span>
                                            </div>
                                            <span className="text-xs font-mono text-zinc-400">
                                                {(h.confidence * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-32 text-zinc-600 text-sm flex-col gap-2">
                                    <ScanLine className="w-8 h-8 opacity-30" />
                                    <span>{connected ? 'No elephants detected' : 'Not connected'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Alerts Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-lg h-full">
                    <div className="p-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-sm">
                        <h3 className="text-zinc-300 font-bold flex items-center gap-2.5 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Live Alert Feed
                        </h3>
                        {alerts.length > 0 && (
                            <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-red-500/20 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                {alerts.filter(a => a.severity === 'high').length} Critical
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {alerts.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-zinc-600 text-sm flex-col gap-3">
                                <Wifi className="w-8 h-8 opacity-30" />
                                <span className="text-center font-mono text-xs leading-relaxed">
                                    {connected
                                        ? 'Monitoring area...\nNo alerts yet.'
                                        : 'Connecting to backend...'}
                                </span>
                            </div>
                        ) : (
                            alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-xl hover:border-zinc-700 transition-all duration-300 group hover:bg-zinc-900 hover:shadow-lg hover:shadow-black/20 hover:translate-x-1"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border shadow-sm ${alert.severity === 'high'
                                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                            : alert.severity === 'medium'
                                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                            }`}>
                                            {alert.severity}
                                        </div>
                                        <span className="text-zinc-600 text-[10px] font-mono group-hover:text-zinc-500 transition-colors">
                                            {alert.time}
                                        </span>
                                    </div>
                                    <p className="text-zinc-300 text-sm font-medium leading-relaxed mb-3 group-hover:text-white transition-colors">
                                        {alert.text}
                                    </p>
                                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                            AI Conf:{' '}
                                            <span className={`font-bold ${parseFloat(alert.prob) > 85 ? 'text-emerald-500' :
                                                parseFloat(alert.prob) > 65 ? 'text-amber-500' : 'text-blue-500'
                                                }`}>
                                                {alert.prob}
                                            </span>
                                        </span>
                                        <button className="text-[10px] bg-zinc-800 hover:bg-indigo-600 hover:border-indigo-500 text-zinc-400 hover:text-white border border-zinc-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-300 shadow-sm">
                                            Trigger Alert <Send className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
