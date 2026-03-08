import { AttendanceLog } from '../models/AttendanceLog.js';
import crypto from 'crypto';
import { systemContract } from '../config/blockchain.js';


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
        errors: [],
        validBlocks: []
    };
    
    // Track broken indices
    const invalidIndices = new Set();

    for (let i = 0; i < logs.length; i++) {
        const currentBlock = logs[i];

        //  Data Integrity (Has the content of this block changed?)
        const recalculatedHash = calculateBlockHash(currentBlock);
        if (recalculatedHash !== currentBlock.hash) {
            report.isValid = false;
            invalidIndices.add(i);
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
                invalidIndices.add(i);
                report.errors.push({
                    index: i,
                    blockId: currentBlock._id,
                    type: 'CHAIN_BROKEN',
                    message: `Block ${i} link to previous block is broken. Records might have been deleted.`
                });
            }
        }
        
        // Smart Contract Cross-Validation (Hybrid Architecture)
        try {
            const ethHash = await systemContract.getBlockHash(currentBlock._id.toString());
            // If the Smart Contract returns an empty string or it's not mapped, the tx might still be pending. 
            // We'll check if it differs from the current hash and is not empty.
            if (ethHash && ethHash !== "" && ethHash !== currentBlock.hash) {
                report.isValid = false;
                invalidIndices.add(i);
                report.errors.push({
                    index: i,
                    blockId: currentBlock._id,
                    type: 'ETHEREUM_MISMATCH',
                    message: `Hash mismatch with Ethereum Smart Contract for block ${i}. Local DB might be compromised.`
                });
            }
        } catch (err) {
            console.error(`Failed to verify block ${currentBlock._id} against Ethereum:`, err.message);
            // Optionally: keep isValid as true if Ethereum just fails to respond, to avoid false positives.
        }
    }

    // Populate validBlocks only with blocks that don't have errors
    for (let i = 0; i < logs.length; i++) {
        if (!invalidIndices.has(i)) {
            report.validBlocks.push(logs[i]);
        }
    }

    return report;
};

export const verifySingleBlock = async (mongoId) => {
    try {
        const block = await AttendanceLog.findById(mongoId);
        if (!block) {
            return { status: 'error', message: 'Block not found in local MongoDB.' };
        }

        // Calling a 'view' function doesn't cost any GAS/Money!
        let ethHash = "";
        try {
            ethHash = await systemContract.getBlockHash(mongoId);
        } catch (err) {
            console.error("❌ Error fetching from Ethereum:", err.message);
            return { status: 'error', message: 'Failed to fetch from Ethereum node.' };
        }

        if (!ethHash || ethHash === "") {
            console.log("🔍 No record found on blockchain for this ID.");
            return { status: 'pending', message: 'No record found on Ethereum blockchain yet.', expectedHash: block.hash };
        }

        const isMatch = (ethHash === block.hash);
        if (isMatch) {
            console.log(`✅ Blockchain Hash for ${mongoId} MATCHES: ${ethHash}`);
        } else {
            console.error(`❌ Blockchain Hash MISMATCH for ${mongoId}. ETH: ${ethHash}, LOCAL: ${block.hash}`);
        }

        return {
            status: isMatch ? 'success' : 'tampered',
            mongoId: block._id,
            localHash: block.hash,
            ethHash: ethHash,
            isMatch: isMatch,
            message: isMatch ? 'Hashes match. Record is fully verified on Ethereum network.' : 'Hash mismatch! Local database might be compromised.'
        };
    } catch (error) {
        throw new Error('Verification failed: ' + error.message);
    }
};