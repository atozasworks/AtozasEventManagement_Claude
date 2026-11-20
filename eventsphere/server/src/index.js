import dotenv from 'dotenv';
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
import couponRoutes from './routes/coupons.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import vendorRoutes from './routes/vendors.js';
import { emailConfigured } from './services/email.js';
import { startReminderScheduler } from './services/reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

//const PORT = process.env.PORT || 5000;
const PORT = process.env.PORT || 3015;
//const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://emscloudeuser:A1b2c3d4e5@62.72.31.206:57423/emscloude?authSource=emscloude';
//const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const CLIENT_URL = process.env.CLIENT_URL || 'https://emscloude.testatozas.in';
if (!process.env.JWT_SECRET) {
  console.warn(`JWT_SECRET is not set. Upload .env to ${envPath}`);
  process.env.JWT_SECRET = 'dev-insecure-secret';
}

const app = express();
app.set('trust proxy', 1);
// "same-origin-allow-popups": the Razorpay payment window (a pop-up on razorpay.com) must be able to report back
// to this page and close itself. With helmet's default ("same-origin") it stays stuck on "Payment successful".
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
app.use(compression());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Payments first: the Razorpay webhook needs the raw, unparsed body to verify its signature
app.use('/api/payments', paymentRoutes);
app.use(express.json({ limit: '2mb' }));

// Slow down password guessing
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } });
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/google', '/api/auth/reset-password', '/api/auth/verify-email'], authLimiter);
// Stop the "send me a link" forms being used to flood someone's inbox
const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many emails requested. Please wait a few minutes and try again.' } });
app.use(['/api/auth/forgot-password', '/api/auth/resend-verification'], linkLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'eventsphere-api', payments: getGateway().provider, time: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/expo', expoRoutes);
app.use('/api/networking', networkingRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/vendors', vendorRoutes);

// In production, serve the built React app from the live dist folder
// const clientDist = path.resolve(__dirname, '../../client/dist');
const clientDist = '/home/testatozas-emscloude/htdocs/emscloude.testatozas.in/dist';
if (fs.existsSync(clientDist)) {
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
      //console.log(`EventSphere API running on https://emscloude.testatozas.in (port ${PORT})`);
      getGateway(); // logs which payment mode is active
      console.log(`Email: ${emailConfigured() ? `SMTP via ${process.env.SMTP_HOST}` : 'not configured - messages are saved to server/.outbox'}`);
      startReminderScheduler();
    })
  )
  .catch((err) => {
    const safeUri = String(MONGO_URI).replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@');
    console.error('\nCould not connect to MongoDB:', err.message);
    console.error('MONGO_URI:', safeUri);
    if (/auth/i.test(err.message)) {
      console.error('Username or password was rejected. In .env use:');
      console.error('MONGO_URI=mongodb://USER:PASSWORD@127.0.0.1:27017/eventsphere?authSource=admin\n');
    } else {
      console.error('Check that MongoDB is running on this server and MONGO_URI in .env is correct.\n');
    }
    process.exit(1);
  });
