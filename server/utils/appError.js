
// Custom error class for operational errors 
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Mark as an error we expected to happen
        
        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;