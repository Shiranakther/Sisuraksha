import crypto from 'crypto';
import { AttendanceLog } from '../models/AttendanceLog.js';

const calculateHash = (previousHash, timestamp, data) => {
    return crypto
        .createHash('sha256')
        .update(previousHash + timestamp + JSON.stringify(data))
        .digest('hex');
};

export const addToBlockchain = async (childId, action, location, deviceTime) => {
    try {
        const lastBlock = await AttendanceLog.findOne().sort({ timestamp: -1 });
        const previousHash = lastBlock ? lastBlock.hash : "GENESIS_HASH_000";
        
        // Prioritize device time for the immutable record
        const timestamp = deviceTime ? new Date(deviceTime).toISOString() : new Date().toISOString();
        const data = { childId, action, location };
        
        const currentHash = calculateHash(previousHash, timestamp, data);
        
        const newBlock = new AttendanceLog({
            childId,
            action,
            location,
            previousHash,
            hash: currentHash,
            timestamp: timestamp
        });

        await newBlock.save();
    } catch (err) {
        console.error("Blockchain entry failed:", err);
    }
};