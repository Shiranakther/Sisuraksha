import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  if (!MONGO_URI) {
    console.error("FATAL: MONGO_URI is not defined in the environment variables.");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: process.env.NODE_ENV === "development",
    });

    console.log("MongoDB connected successfully.");

    // ✅ Ensure index for GPS history collection (one-time setup, safe to call on startup)
    const db = mongoose.connection.db;

    await db.collection("gps_events").createIndex({ busId: 1, ts: -1 });

    console.log("MongoDB index ensured: gps_events { busId: 1, ts: -1 }");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

export default connectDB;