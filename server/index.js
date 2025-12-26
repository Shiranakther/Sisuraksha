import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import cookieParser from 'cookie-parser';

import './config/postgres.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

// Middleware
import errorHandler from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5001;

/* ==============================
  DATABASE CONNECTION (Supabase/PostgreSQL)
================================ */

/* ==============================
   SECURITY MIDDLEWARE
================================ */
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
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
  res.status(200).send('Smart School Bus API Running 🚍');
});


app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);

app.use(errorHandler);


app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
  );
});
