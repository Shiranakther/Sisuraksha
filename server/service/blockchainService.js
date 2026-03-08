import crypto from 'crypto';
import { AttendanceLog } from '../models/AttendanceLog.js';
import { systemContract } from '../config/blockchain.js';

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

        const savedBlock = await newBlock.save();

        // Asynchronously save to Ethereum blockchain (Hybrid Architecture)
        // Fire-and-forget to avoid slowing down the IoT response
        systemContract.storeBlock(savedBlock._id.toString(), currentHash)
            .then(tx => {
                console.log(`Stored block ${savedBlock._id} to Ethereum. Tx: ${tx.hash}`);
            })
            .catch(err => {
                console.error(`Failed to store block ${savedBlock._id} to Ethereum:`, err);
            });

    } catch (err) {
        console.error("Blockchain entry failed:", err);
    }
};