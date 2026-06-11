/**
 * Express Server Setup with Socket.IO
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend folder or root
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

import queueRoutes from '../routes/queue.js';
import healthRoutes from '../routes/health.js';
import { initDatabase } from './database.js';
import { getState } from './queueService.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Parse CORS origins
const rawCors = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173';
const corsOrigins = rawCors.split(',').map((s) => s.trim());

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ─── Middleware ───

app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ─── Request logging (dev only) ───
if (NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Attach io to requests ───
app.use((req, _res, next) => {
  (req as any).io = io;
  next();
});

// ─── Routes ───
app.use('/api/queue', queueRoutes);
app.use('/api/health', healthRoutes);

// ─── Static files (optional production frontend) ───
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Socket.IO Real-Time Sync ───

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send current state immediately on connect
  try {
    const state = getState();
    socket.emit('state_sync', { type: 'sync', state, senderId: 'server', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Socket] Error sending initial state:', err);
  }

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ─── Start ───

export function startServer(): void {
  try {
    initDatabase();
    console.log('[DB] SQLite initialized.');
  } catch (err) {
    console.error('[DB] Failed to initialize:', err);
    process.exit(1);
  }

  httpServer.listen(PORT, () => {
    console.log(`[Server] Clinic Queue Backend running on http://localhost:${PORT}`);
    console.log(`[Server] Environment: ${NODE_ENV}`);
    console.log(`[Server] CORS origins: ${corsOrigins.join(', ')}`);
  });
}

export { app, io, httpServer };
