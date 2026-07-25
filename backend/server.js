import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

dotenv.config();

// Strip trailing slash from FRONTEND_URL if present
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

// Allowed origins: local dev + Vercel production frontend
// If FRONTEND_URL is not set we fall back to allowing all origins (safe for free-tier demos)
const ALLOWED_ORIGINS = FRONTEND_URL
    ? [
        FRONTEND_URL,                                    
       'https://elephant-tracker-jetson-nano.vercel.app',   
        'http://localhost:5173',                         // Vite dev server
        'http://localhost:3000',                         // Alt dev port
    ]
    : true;                             // Allow all when not configured

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    },
    maxHttpBufferSize: 10 * 1024 * 1024 // 10MB limit for base64 images
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';
const RF_SERVICE_URL = (process.env.RF_SERVICE_URL || 'http://localhost:8001').replace(/\/$/, '');
const RF_THRESHOLD_DBM = parseFloat(process.env.RF_THRESHOLD_DBM || '-40');

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (ALLOWED_ORIGINS === true || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ── Health / keep-alive endpoints ──────────────────────────────────────────
// GET /health  — Jetson calls this on startup to wake the Render server
// GET /api/ping — Frontend calls this every 10 min to prevent Render sleeping
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
app.get('/api/ping', (_req, res) => {
    res.json({ pong: true, time: new Date().toISOString() });
});

// ── DB readiness helper ─────────────────────────────────────────────────────
// Returns true only when Mongoose has an active connection (state 1 = connected).
// Use this before every DB query so routes short-circuit instantly instead of
// hanging for 10 s waiting for a buffer that never flushes.
const dbReady = () => mongoose.connection.readyState === 1;

// Middleware: respond with 503 immediately if DB is offline
const requireDb = (_req, res, next) => {
    if (!dbReady()) {
        return res.status(503).json({ error: 'Database unavailable — try again shortly' });
    }
    next();
};

// Sanitize MONGO_URI — strip empty query params like &appName= that Atlas sometimes includes
const rawMongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/eletrack-ai';
const MONGO_URI = rawMongoUri.replace(/([&?])[^=&]+=[&$]/g, '$1').replace(/[?&]$/, '');

// ── Mongoose global settings ────────────────────────────────────────────────
// bufferCommands: false  → operations throw IMMEDIATELY when DB is offline
//                          instead of buffering for 10 s then timing out.
//                          This eliminates the "buffering timed out" spam.
mongoose.set('bufferCommands', false);

// MongoDB Connection with resilient options
const MONGO_OPTS = {
    serverSelectionTimeoutMS: 5000,   // Give up selecting a server after 5 s
    socketTimeoutMS: 45000,           // Close idle sockets after 45 s
    connectTimeoutMS: 10000,          // TCP connect timeout
    heartbeatFrequencyMS: 10000,      // Check server health every 10 s
};

function connectMongo() {
    mongoose.connect(MONGO_URI, MONGO_OPTS)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err.message));
}

connectMongo();

// Auto-reconnect: if the connection drops, retry after 15 s
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — retrying in 15 s...');
    setTimeout(connectMongo, 15000);
});
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB Reconnected'));

// Login Log Schema
const LoginLogSchema = new mongoose.Schema({
    username: String,
    status: String, // 'SUCCESS' or 'FAILED'
    ip: String,
    timestamp: { type: Date, default: Date.now },
    userAgent: String
});

const LoginLog = mongoose.model('LoginLog', LoginLogSchema);

// Hardcoded Credentials
const CREDENTIALS = {
    'admin': 'admin123',
    'controller': 'eletrack2026',
    'supervisor': 'wildlife_secure',
    'analyst': 'data_insight',
    'guest': 'view_only'
};

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    console.log(`\n[LOGIN ATTEMPT] User: ${username} | IP: ${ip}`);

    if (CREDENTIALS[username] && CREDENTIALS[username] === password) {
        console.log(`✅ [LOGIN SUCCESS] Access Granted for ${username}`);

        // Generate JWT — respond immediately, don't wait for DB
        const token = jwt.sign({ username, role: username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ success: true, message: 'Login successful', role: username, token });

        // Log to MongoDB in background (non-blocking)
        new LoginLog({ username, status: 'SUCCESS', ip, userAgent }).save()
            .catch(err => console.error('⚠️  Login log write failed (DB may be offline):', err.message));
    } else {
        console.log(`❌ [LOGIN FAILED] Invalid credentials for ${username}`);
        res.status(401).json({ success: false, message: 'Invalid credentials' });

        // Log to MongoDB in background (non-blocking)
        new LoginLog({ username, status: 'FAILED', ip, userAgent }).save()
            .catch(err => console.error('⚠️  Login log write failed (DB may be offline):', err.message));
    }
});

// Verify Token Middleware
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided' });

    jwt.verify(token.split(' ')[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Unauthorized' });
        req.user = decoded;
        next();
    });
};

// Protected Logs Route
app.get('/api/logs', verifyToken, requireDb, async (req, res) => {
    try {
        const logs = await LoginLog.find().sort({ timestamp: -1 }).limit(20);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// ==================== RF + THREAT MONITORING SCHEMAS ====================

// RF Scan Log Schema
const RFLogSchema = new mongoose.Schema({
    timestamp: String,
    frequency_hz: Number,
    span_hz: Number,
    max_power_dbm: Number,
    threshold_dbm: Number,
    raw_trace_peak: Number,
    status: { type: String, enum: ['SAFE', 'INTRUSION'], default: 'SAFE' },
    scan_duration_ms: Number,
    error: String,
    createdAt: { type: Date, default: Date.now, expires: 259200 }  // TTL 3 days
});
const RFLog = mongoose.model('RFLog', RFLogSchema);

// Fused Threat Log Schema
const ThreatLogSchema = new mongoose.Schema({
    timestamp: String,
    elephant_detected: Boolean,
    rf_status: { type: String, enum: ['SAFE', 'INTRUSION'] },
    threat_level: { type: String, enum: ['SAFE', 'WILDLIFE_ALERT', 'HUMAN_INTRUSION', 'CRITICAL_ALERT'] },
    location: { lat: Number, lon: Number },
    acknowledged: { type: Boolean, default: false },
    acknowledged_by: String,
    createdAt: { type: Date, default: Date.now, expires: 2592000 } // TTL 30 days
});
const ThreatLog = mongoose.model('ThreatLog', ThreatLogSchema);

// Elephant Detection Log Schema (dedicated collection)
const ElephantLogSchema = new mongoose.Schema({
    timestamp: String,
    source: { type: String, default: 'jetson' },
    elephant_count: Number,
    confidence_avg: Number,
    location: { lat: Number, lon: Number },
    image_snapshot: String,
    createdAt: { type: Date, default: Date.now, expires: 604800 } // TTL 7 days
});
const ElephantLog = mongoose.model('ElephantLog', ElephantLogSchema);

// In-memory latest RF state (for low-latency /api/rf-status)
let latestRFReading = null;
let latestThreatState = {
    threat_level: 'SAFE',
    elephant_detected: false,
    rf_status: 'SAFE',
    color: '#14532d',
    priority: 0,
    description: 'System initializing...',
    timestamp: new Date().toISOString()
};

// Threat fusion logic (mirrors Python threat_fusion.py)
function fuseThreatLevel(elephantDetected, rfStatus) {
    if (elephantDetected && rfStatus === 'INTRUSION') return 'CRITICAL_ALERT';
    if (elephantDetected && rfStatus === 'SAFE') return 'WILDLIFE_ALERT';
    if (!elephantDetected && rfStatus === 'INTRUSION') return 'HUMAN_INTRUSION';
    return 'SAFE';
}

const THREAT_COLORS = {
    'SAFE': '#14532d',
    'WILDLIFE_ALERT': '#92400e',
    'HUMAN_INTRUSION': '#9a3412',
    'CRITICAL_ALERT': '#7f1d1d'
};

const THREAT_PRIORITY = {
    'SAFE': 0, 'WILDLIFE_ALERT': 1, 'HUMAN_INTRUSION': 2, 'CRITICAL_ALERT': 3
};

const THREAT_DESCRIPTIONS = {
    'SAFE': 'All systems normal. No elephant or RF intrusion detected.',
    'WILDLIFE_ALERT': '🐘 Elephant detected near railway border. RF channel is clear.',
    'HUMAN_INTRUSION': '📡 Suspicious RF signal detected. Possible illegal communication device.',
    'CRITICAL_ALERT': '🚨 CRITICAL: Elephant present AND unauthorized RF signal detected — possible poacher activity!'
};

// ==================== TELEMETRY & EDGE AI ROUTES ====================

// Telemetry Data Schema
const TelemetrySchema = new mongoose.Schema({
    timestamp: String,
    gps_location: {
        lat: Number,
        lon: Number
    },
    hazards: [{
        class: Number,
        name: String,
        confidence: Number,
        xmin: Number,
        ymin: Number,
        xmax: Number,
        ymax: Number
    }],
    image_stream: String, // Base64 encoded image
    createdAt: { type: Date, default: Date.now, expires: 3600 } // Auto-delete after 1 hour
});

const Telemetry = mongoose.model('Telemetry', TelemetrySchema);

// POST endpoint to receive Jetson Orin Nano telemetry
app.post('/api/telemetry', (req, res) => {
    const { timestamp, gps_location, hazards, image_stream } = req.body;

    // Validate payload
    if (!timestamp || !gps_location || !hazards || !image_stream) {
        return res.status(400).json({
            error: 'Missing required fields: timestamp, gps_location, hazards, image_stream'
        });
    }

    console.log(`\n📹 [TELEMETRY RECEIVED] Time: ${timestamp} | Elephants Detected: ${hazards.length}`);
    for (const hazard of hazards) {
        console.log(`   🐘 ${hazard.name} (Confidence: ${(hazard.confidence * 100).toFixed(2)}%)`);
    }

    // ── STEP 1: Broadcast IMMEDIATELY to all WebSocket clients ──────────────
    // This runs BEFORE the DB write so the frontend ALWAYS gets the live feed
    // even when MongoDB is slow or offline (Render free tier timeout issue).
    const payload = {
        timestamp,
        gps_location,
        hazards,
        image_stream,
        receivedAt: new Date().toISOString()
    };
    io.emit('telemetry-update', payload);

    // ── STEP 2: Respond to Jetson immediately ────────────────────────────────
    res.json({
        success: true,
        message: 'Telemetry received and broadcasted',
        hazardCount: hazards.length
    });

    // ── STEP 3: Save to MongoDB in the background (fire-and-forget) ─────────
    // Uses setImmediate so it runs after the response is sent.
    // A MongoDB timeout here will NEVER block or crash the socket broadcast.
    setImmediate(() => {
        new Telemetry({ timestamp, gps_location, hazards, image_stream })
            .save()
            .then(() => { /* saved ok */ })
            .catch(err => console.warn('⚠️  [TELEMETRY DB SAVE FAILED] (non-fatal):', err.message));
    });
});

// GET endpoint to retrieve recent telemetry data
app.get('/api/telemetry/recent', verifyToken, requireDb, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const telemetryData = await Telemetry.find()
            .sort({ createdAt: -1 })
            .limit(limit);
        res.json(telemetryData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recent telemetry' });
    }
});

// ==================== RF MONITORING ROUTES ====================

// Internal ingest — called by Python RF monitor service every scan interval
// Updates in-memory state, logs to DB, and broadcasts to all WebSocket clients
app.post('/api/rf-ingest', async (req, res) => {
    const {
        status, max_power_dbm, threshold_dbm, center_freq_hz,
        span_hz, timestamp, scan_duration_ms, error,
        elephant_detected = false, location = null
    } = req.body;

    // Update in-memory RF state
    latestRFReading = {
        status, max_power_dbm, threshold_dbm, center_freq_hz,
        span_hz, timestamp, scan_duration_ms, error,
        receivedAt: new Date().toISOString()
    };

    // Fuse threat level
    const rfStatus = status || 'SAFE';
    const threat_level = fuseThreatLevel(elephant_detected, rfStatus);
    latestThreatState = {
        threat_level,
        elephant_detected,
        rf_status: rfStatus,
        color: THREAT_COLORS[threat_level],
        priority: THREAT_PRIORITY[threat_level],
        description: THREAT_DESCRIPTIONS[threat_level],
        timestamp: timestamp || new Date().toISOString()
    };

    // Broadcast to all connected WebSocket clients immediately
    io.emit('rf-update', {
        rf: latestRFReading,
        threat: latestThreatState
    });

    if (rfStatus === 'INTRUSION') {
        console.log(`📡 [RF INTRUSION] Power: ${max_power_dbm} dBm | Threat: ${threat_level}`);
    }

    // Respond immediately
    res.json({ received: true, threat_level, timestamp });

    // Log to MongoDB in background (non-blocking)
    setImmediate(async () => {
        try {
            await new RFLog({
                timestamp, frequency_hz: center_freq_hz, span_hz,
                max_power_dbm, threshold_dbm, raw_trace_peak: max_power_dbm,
                status: rfStatus, scan_duration_ms, error
            }).save();
        } catch (e) {
            console.warn('⚠️  [RF] DB log failed:', e.message);
        }
        // Log threat changes (only INTRUSION or WARNING levels)
        if (threat_level !== 'SAFE') {
            try {
                await new ThreatLog({
                    timestamp, elephant_detected, rf_status: rfStatus,
                    threat_level, location
                }).save();
            } catch (e) {
                console.warn('⚠️  [THREAT] DB log failed:', e.message);
            }
        }
    });
});

// GET /api/rf-status — current RF reading (open, no auth)
app.get('/api/rf-status', (_req, res) => {
    if (!latestRFReading) {
        return res.json({
            status: 'UNKNOWN',
            message: 'No RF scan data yet. RF service may be initializing.',
            threshold_dbm: RF_THRESHOLD_DBM,
            service_url: RF_SERVICE_URL
        });
    }
    res.json(latestRFReading);
});

// GET /api/rf-logs — RF scan history (JWT protected)
app.get('/api/rf-logs', verifyToken, requireDb, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await RFLog.find().sort({ createdAt: -1 }).limit(Math.min(limit, 200));
        res.json({ count: logs.length, logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch RF logs' });
    }
});

// GET /api/threat-status — current fused threat level (open, no auth)
app.get('/api/threat-status', (_req, res) => {
    res.json(latestThreatState);
});

// GET /api/threat-logs — threat history (JWT protected)
app.get('/api/threat-logs', verifyToken, requireDb, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await ThreatLog.find().sort({ createdAt: -1 }).limit(Math.min(limit, 200));
        res.json({ count: logs.length, logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch threat logs' });
    }
});

// GET /api/elephant-logs — elephant detection history (JWT protected)
app.get('/api/elephant-logs', verifyToken, requireDb, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await ElephantLog.find().sort({ createdAt: -1 }).limit(Math.min(limit, 100));
        res.json({ count: logs.length, logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch elephant logs' });
    }
});

// GET endpoint to retrieve telemetry with hazards only
app.get('/api/telemetry/hazards', verifyToken, requireDb, async (req, res) => {
    try {
        const hazardData = await Telemetry.find({ hazards: { $ne: [] } })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(hazardData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch hazard data' });
    }
});

// ==================== WEBSOCKET HANDLERS ====================

io.on('connection', (socket) => {
    console.log(`✅ [WS] Client connected: ${socket.id} | Total connections: ${io.engine.clientsCount}`);

    // Send current connection status
    socket.emit('connection-status', {
        status: 'connected',
        clientId: socket.id,
        timestamp: new Date().toISOString()
    });

    // Handle custom events from frontend
    socket.on('request-latest-telemetry', async () => {
        // Only attempt DB query if Mongoose is actually connected (state 1 = connected)
        // Skips the query entirely when MongoDB is offline → avoids 10-second hang in logs
        if (mongoose.connection.readyState !== 1) {
            console.warn('⚠️  [WS] Skipping latest-telemetry query — MongoDB not connected');
            return;
        }
        try {
            const latestTelemetry = await Telemetry.findOne().sort({ createdAt: -1 });
            if (latestTelemetry) {
                socket.emit('latest-telemetry', latestTelemetry);
            }
        } catch (err) {
            console.warn('⚠️  [WS] latest-telemetry query failed (non-fatal):', err.message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ [WS] Client disconnected: ${socket.id} | Remaining connections: ${io.engine.clientsCount}`);
    });

    socket.on('error', (error) => {
        console.error(`⚠️  [WS] Socket error for ${socket.id}:`, error);
    });
});

// ==================== SERVER STARTUP ====================

httpServer.listen(PORT, () => {
    console.log(`🚀 EleTrack AI Hybrid Surveillance Server running on http://localhost:${PORT}`);
    console.log(`🔒 JWT Authentication Enabled`);
    console.log(`📡 WebSocket (Socket.io) Server running on ws://localhost:${PORT}`);
    console.log(`📸 Telemetry endpoint:   POST /api/telemetry`);
    console.log(`📻 RF ingest endpoint:   POST /api/rf-ingest`);
    console.log(`🎯 Threat level:         GET  /api/threat-status`);
    console.log(`📊 Max payload size: 10MB`);
    console.log(`🔗 RF Python service: ${RF_SERVICE_URL}`);
    console.log(`\n📋 Default Credentials:`);
    Object.keys(CREDENTIALS).forEach(user => {
        console.log(`   - ${user} : ${CREDENTIALS[user]}`);
    });
});
