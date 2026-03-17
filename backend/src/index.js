/**
 * ProviderIQ Backend - Main Entry Point
 * Healthcare Staffing Intelligence Platform API
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./db/connection');
const { connectRedis } = require('./utils/redis');
const { setupWorkers } = require('./workers');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const organizationRoutes = require('./routes/organizations');
const userRoutes = require('./routes/users');
const providerRoutes = require('./routes/providers');
const candidateRoutes = require('./routes/candidates');
const jobRoutes = require('./routes/jobs');
const submissionRoutes = require('./routes/submissions');
const activityRoutes = require('./routes/activity');
const analyticsRoutes = require('./routes/analytics');
const aiRoutes = require('./routes/ai');
const communicationRoutes = require('./routes/communications');
const scrapeRoutes = require('./routes/scrape');
const adminRoutes = require('./routes/admin');

const app = express();
const httpServer = createServer(app);

// ─── Socket.IO (Real-time updates) ────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  const { orgId, userId } = socket.handshake.auth;
  if (orgId) {
    socket.join(`org:${orgId}`);
    logger.info(`Socket connected: user=${userId} org=${orgId}`);
  }
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: user=${userId}`);
  });
});

// ─── Security Middleware ───────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// ─── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-ID'],
}));

// ─── General Middleware ────────────────────────────────────────
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'AI request limit exceeded.' },
});

app.use('/api', globalLimiter);

// ─── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/organizations', authenticateToken, organizationRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/providers', authenticateToken, providerRoutes);
app.use('/api/candidates', authenticateToken, candidateRoutes);
app.use('/api/jobs', authenticateToken, jobRoutes);
app.use('/api/submissions', authenticateToken, submissionRoutes);
app.use('/api/activity', authenticateToken, activityRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/ai', authenticateToken, aiLimiter, aiRoutes);
app.use('/api/communications', authenticateToken, communicationRoutes);
app.use('/api/scrape', authenticateToken, scrapeRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

// ─── 404 Handler ──────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function bootstrap() {
  try {
    await connectDB();
    logger.info('✅ PostgreSQL connected');

    await connectRedis();
    logger.info('✅ Redis connected');

    if (process.env.NODE_ENV !== 'test') {
      await setupWorkers();
      logger.info('✅ Background workers initialized');
    }

    httpServer.listen(PORT, () => {
      logger.info(`🚀 ProviderIQ API running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Version: ${process.env.APP_VERSION || '1.0.0'}`);
    });
  } catch (error) {
    logger.error('Failed to bootstrap server:', error);
    process.exit(1);
  }
}

bootstrap();

module.exports = { app, io };
