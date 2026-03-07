import { runFullAudit } from '../service/blockchainValidator.js';
import AppError from '../utils/appError.js';

export const validateBlockchain = async (req, res, next) => {
    try {
        const report = await runFullAudit();
        
        res.status(200).json({
            status: 'success',
            data: report
        });
    } catch (err) {
        next(new AppError('Failed to run blockchain audit: ' + err.message, 500));
    }
};
