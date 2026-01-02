import { runFullAudit } from '../service/blockchainValidator.js';

export const getSystemAudit = async (req, res) => {
    try {
        const auditReport = await runFullAudit();
        
        if (auditReport.isValid) {
            return res.status(200).json({
                status: 'secure',
                message: 'All blockchain records are verified and untampered.',
                total_records: auditReport.totalBlocks
            });
        } else {
            return res.status(418).json({ 
                status: 'compromised',
                message: 'SYSTEM ALERT: Data integrity breach detected!',
                details: auditReport.errors
            });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};