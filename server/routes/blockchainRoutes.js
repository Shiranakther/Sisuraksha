import express from 'express';
import { validateBlockchain } from '../controllers/blockchainController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

// Only SuperAdmin can run a blockchain audit
router.get('/validate', authenticateToken, authorizeRole([ROLES.SUPER_ADMIN]), validateBlockchain);

export default router;
