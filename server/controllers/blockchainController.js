import { runFullAudit, verifySingleBlock } from '../service/blockchainValidator.js';
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

export const verifyBlock = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return next(new AppError('Block ID is required', 400));
        }

        const report = await verifySingleBlock(id);
        
        res.status(200).json({
            status: report.status === 'error' ? 'fail' : 'success',
            data: report
        });
    } catch (err) {
        next(new AppError('Failed to verify block: ' + err.message, 500));
    }
};
