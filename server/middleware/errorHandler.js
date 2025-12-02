import AppError from '../utils/appError.js';

const handlePostgresUniqueError = (err) => {
    
    if (err.code === '23505') {
        const fieldMatch = err.detail.match(/\((.*?)\)=\((.*?)\)/);
        const field = fieldMatch ? fieldMatch[1] : 'Field';
        const value = fieldMatch ? fieldMatch[2] : 'value';
        const message = `Duplicate value: ${value}. The ${field} must be unique.`;
        return new AppError(message, 400); // 400 Bad Request
    }
    return err;
};

// Global Error Handling Middleware 
const errorHandler = (err, req, res, next) => {
    // Log the error for developer debugging
    console.error(' GLOBAL ERROR HANDLER:', err);

    // Set default status/message
    let error = { ...err };
    error.statusCode = error.statusCode || 500;
    error.status = error.status || 'error';
    error.message = error.message || 'Internal Server Error';

    //  Handle specific operational errors 
    if (error.code) error = handlePostgresUniqueError(error);

    // Send the response
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // In production, only send general message for 500 errors
    const responseMessage = (error.isOperational || error.statusCode < 500 || isDevelopment) 
        ? error.message 
        : 'Something went very wrong on the server.';

    res.status(error.statusCode).json({
        status: error.status,
        message: responseMessage,
        // Only include stack trace in development
        ...(isDevelopment && { stack: err.stack }),
    });
};

export default errorHandler;