import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

dotenv.config();

// Allowed origins: local dev + Vercel production frontend
// If FRONTEND_URL is not set we fall back to allowing all origins (safe for free-tier demos)
const ALLOWED_ORIGINS = process.env.FRONTEND_URL
    ? [
        'http://localhost:5173',
        'http://localhost:3000',
        process.env.FRONTEND_URL,       // e.g. https://rail-rakshak.vercel.app
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

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
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

// Sanitize MONGO_URI — strip empty query params like &appName= that Atlas sometimes includes
const rawMongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/eletrack-ai';
const MONGO_URI = rawMongoUri.replace(/([&?])[^=&]+=[&$]/g, '$1').replace(/[?&]$/, '');

// MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

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
app.get('/api/logs', verifyToken, async (req, res) => {
    try {
        const logs = await LoginLog.find().sort({ timestamp: -1 }).limit(20);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

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
app.post('/api/telemetry', async (req, res) => {
    try {
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

        // Save to MongoDB for historical tracking
        const telemetryEntry = new Telemetry({
            timestamp,
            gps_location,
            hazards,
            image_stream
        });
        await telemetryEntry.save();

        // Broadcast to all connected WebSocket clients in real-time
        io.emit('telemetry-update', {
            timestamp,
            gps_location,
            hazards,
            image_stream,
            receivedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Telemetry received and broadcasted',
            hazardCount: hazards.length
        });
    } catch (err) {
        console.error('❌ [TELEMETRY ERROR]:', err.message);
        res.status(500).json({ error: 'Failed to process telemetry', details: err.message });
    }
});

// GET endpoint to retrieve recent telemetry data
app.get('/api/telemetry/recent', verifyToken, async (req, res) => {
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

// GET endpoint to retrieve telemetry with hazards only
app.get('/api/telemetry/hazards', verifyToken, async (req, res) => {
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
        try {
            const latestTelemetry = await Telemetry.findOne().sort({ createdAt: -1 });
            if (latestTelemetry) {
                socket.emit('latest-telemetry', latestTelemetry);
            }
        } catch (err) {
            console.error('Error fetching latest telemetry:', err);
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
    console.log(`� EleTrack AI Server running on http://localhost:${PORT}`);
    console.log(`🔒 JWT Authentication Enabled`);
    console.log(`📡 WebSocket (Socket.io) Server running on ws://localhost:${PORT}`);
    console.log(`📸 Telemetry endpoint: POST /api/telemetry`);
    console.log(`📊 Max payload size: 10MB`);
    console.log(`\n📋 Default Credentials:`);
    Object.keys(CREDENTIALS).forEach(user => {
        console.log(`   - ${user} : ${CREDENTIALS[user]}`);
    });
});
