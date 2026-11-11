import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import paymentRoutes from './routes/payments.js';
import { getGateway } from './services/payments.js';
import { Server } from 'socket.io';

import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './utils/http.js';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import orderRoutes from './routes/orders.js';
import ticketRoutes from './routes/tickets.js';
import venueRoutes from './routes/venues.js';
import expoRoutes from './routes/expo.js';
import networkingRoutes from './routes/networking.js';

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set - using an insecure development default. Create server/.env from .env.example.');
  process.env.JWT_SECRET = 'dev-insecure-secret';
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Payments first: the Razorpay webhook needs the raw, unparsed body to verify its signature
app.use('/api/payments', paymentRoutes);
app.use(express.json({ limit: '2mb' }));

// Slow down password guessing
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } });
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'eventsphere-api', payments: getGateway().provider, time: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/expo', expoRoutes);
app.use('/api/networking', networkingRoutes);

// In production, serve the built React app from the same server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_URL } });
initSocket(io);

connectDB(MONGO_URI)
  .then(() =>
    server.listen(PORT, () => {
      console.log(`EventSphere API running on http://localhost:${PORT}`);
      getGateway(); // logs which payment mode is active
    })
  )
  .catch((err) => {
    console.error('\nCould not connect to MongoDB:', err.message);
    console.error('Is the MongoDB service running? (Windows: Services -> "MongoDB Server" -> Start)\n');
    process.exit(1);
  });
