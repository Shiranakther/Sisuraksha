import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  if (!MONGO_URI) {
    console.error(' FATAL: MONGO_URI is not defined in the environment variables.');
    process.exit(1); 
  }
  
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000, 
      socketTimeoutMS: 45000, 
      autoIndex: process.env.NODE_ENV === 'development', 
    });
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); 
  }
};

export default connectDB;