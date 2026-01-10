import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import cookieParser from 'cookie-parser';

import './config/postgres.js';
import connectDB from './config/mongodb.js';   // ✅ ADD THIS

// Routes
import authRoutes from './routes/authRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import dailyPresentRoutes from './routes/dailyPresentRoutes.js';

// Middleware
import errorHandler from './middleware/errorHandler.js';

// Tracking routes
import trackingRoutes from './routes/trackingRoutes.js';

const app = express();
const PORT = process.env.PORT || 5001;

/* ==============================
   SECURITY MIDDLEWARE
================================ */
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? 'http://localhost:5173'
      : '*',
    credentials: true,
  })
);

/* ==============================
   BODY PARSERS
================================ */
app.use(express.json());
app.use(cookieParser());

/* ==============================
   HEALTH CHECK
================================ */
app.get('/', (req, res) => {
  res.status(200).send('Smart School Bus API Running');
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/daily-present', dailyPresentRoutes);

app.use(errorHandler);

/* ==============================
   START SERVER (IMPORTANT)
================================ */
async function startServer() {
  // ✅ Connect Mongo (gps_events index will be created inside mongodb.js)
  await connectDB();

  app.listen(PORT, () => {
    console.log(
      `Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
    );
  });
}

startServer().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});