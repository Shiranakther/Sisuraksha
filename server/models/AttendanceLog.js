import mongoose from 'mongoose';

const AttendanceBlockSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    childId: String,
    action: String, 
    location: { lat: Number, lon: Number },
    previousHash: String, 
    hash: String,         
    nonce: Number         
});

export const AttendanceLog = mongoose.model('AttendanceLog', AttendanceBlockSchema);