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


const app = express();
const PORT = process.env.PORT || 5001;

// Connect Mongodb Databases
connectMongo(); 

app.use(helmet()); 

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'http://localhost:5173/' : '*',
}));

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


app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode.`);
});