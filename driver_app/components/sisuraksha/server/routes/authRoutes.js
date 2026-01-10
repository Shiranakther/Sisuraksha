import express from 'express';
import asyncHandler from '../utils/asyncHandler.js'; 
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));


router.post('/logout', asyncHandler(authController.logout));
router.post('/refresh', asyncHandler(authController.refresh));

export default router;