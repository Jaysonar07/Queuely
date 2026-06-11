/**
 * Health Check & Telemetry Routes
 */

import { Router } from 'express';
import { getDb, getTelemetry } from '../services/database.js';

const router = Router();

router.get('/', (_req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/telemetry', (_req, res) => {
  try {
    const logs = getTelemetry(50);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
