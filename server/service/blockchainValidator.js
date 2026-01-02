import { AttendanceLog } from '../models/AttendanceLog.js';
import crypto from 'crypto';


const calculateBlockHash = (block) => {
    //  use the exact same formula used during the creation process
    const { previousHash, timestamp, childId, action, location } = block;
    const data = JSON.stringify({ childId, action, location });
    
    // Ensure the timestamp is converted to the exact same ISO string format used when created
    const timeStr = new Date(timestamp).toISOString();

    return crypto
        .createHash('sha256')
        .update(previousHash + timeStr + data)
        .digest('hex');
};

export const runFullAudit = async () => {
    //  Fetch all logs in chronological order
    const logs = await AttendanceLog.find().sort({ timestamp: 1 });
    
    let report = {
        isValid: true,
        totalBlocks: logs.length,
        errors: []
    };

    for (let i = 0; i < logs.length; i++) {
        const currentBlock = logs[i];

        //  Data Integrity (Has the content of this block changed?)
        const recalculatedHash = calculateBlockHash(currentBlock);
        if (recalculatedHash !== currentBlock.hash) {
            report.isValid = false;
            report.errors.push({
                index: i,
                blockId: currentBlock._id,
                type: 'DATA_TAMPERED',
                message: `Data in block ${i} was modified after it was written.`
            });
        }

        //  Chain Link (Is this block still linked to the previous one?)
        if (i > 0) {
            const previousBlock = logs[i - 1];
            if (currentBlock.previousHash !== previousBlock.hash) {
                report.isValid = false;
                report.errors.push({
                    index: i,
                    blockId: currentBlock._id,
                    type: 'CHAIN_BROKEN',
                    message: `Block ${i} link to previous block is broken. Records might have been deleted.`
                });
            }
        }
    }

    return report;
};