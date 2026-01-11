import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import connectMongo from './config/mongodb.js';
import { pool as pgPool } from './config/postgres.js';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import errorHandler from './middleware/errorHandler.js';

import testRoutes from './routes/testRoutes.js'
import profileRoutes from './routes/profileRoutes.js';

import attendanceRoutes from './routes/attendanceRoute.js'
import assignRoutes from './routes/assignRoute.js'
import driverRoutes from './routes/driverRoute.js'
import parentRoutes from './routes/parentRoute.js'
import driverMonitorRoutes from './routes/driverMonitorRoutes.js'
import safetyRoutes from './routes/safetyRoutes.js'


const app = express();
const PORT = process.env.PORT || 5001;

// Connect Mongodb Databases
connectMongo();

app.use(helmet());

// CORS must come BEFORE rate limiter so headers are always set
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, origin);
    }
    // In production, restrict to specific origins
    return callback(null, 'http://localhost:5173');
  },
  credentials: true
}));

// Rate Limiting - increased for development with real-time polling
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Higher limit in development
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json());
app.use(cookieParser());


// Routes
app.get('/', (req, res) => {
  res.send('Smart School Bus API Running!');
});

/* auth routes */
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

app.use('/api', testRoutes);

app.use('/api/attendance', attendanceRoutes);

app.use('/api/assign', assignRoutes);

app.use('/api/driver', driverRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/driver-monitor', driverMonitorRoutes);
app.use('/api/safety', safetyRoutes);

app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode.`);
});