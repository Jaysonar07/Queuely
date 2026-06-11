/**
 * Queue API Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import * as queue from '../services/queueService.js';

const router = Router();

// ─── Validation Schemas ───

const addPatientSchema = z.object({
  patientName: z.string().min(1).max(50),
  patientPhone: z.string().max(20).optional(),
  ticketNumber: z.string().max(20).optional(),
  isEmergency: z.boolean().optional(),
  eventId: z.string().optional(),
});

const callNextSchema = z.object({
  eventId: z.string().optional(),
});

const undoSchema = z.object({
  backup: z.object({
    currentToken: z.any().nullable(),
    queue: z.array(z.any()),
    history: z.array(z.any()),
  }),
});

const endConsultationSchema = z.object({
  eventId: z.string().optional(),
});

const reorderSchema = z.object({
  index: z.number().int().min(0),
  direction: z.enum(['up', 'down']),
});

const removeSchema = z.object({
  tokenId: z.string().min(1),
});

const configSchema = z.object({
  manualAvgMinutes: z.number().int().min(5).max(60),
});

// ─── GET /api/queue/state ───

router.get('/state', (_req, res) => {
  try {
    const state = queue.getState();
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/patient ───

router.post('/patient', (req, res) => {
  const parse = addPatientSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: parse.error.errors.map((e) => e.message).join(', ') });
    return;
  }

  try {
    const { state, token, event } = queue.addPatient(parse.data, parse.data.eventId);
    broadcastState(req, state, 'patient_added');
    res.json({ success: true, data: { token, state }, event });
  } catch (err: any) {
    if (err.message.startsWith('DUPLICATE_TICKET')) {
      res.status(409).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/call-next ───

router.post('/call-next', (req, res) => {
  const parse = callNextSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  try {
    const { state, calledToken, event } = queue.callNext(parse.data.eventId);
    broadcastState(req, state, 'call_next');
    res.json({ success: true, data: { calledToken, state }, event });
  } catch (err: any) {
    if (err.message.startsWith('EMPTY_QUEUE')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/undo ───

router.post('/undo', (req, res) => {
  const parse = undoSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  try {
    const state = queue.undoCallNext(parse.data.backup);
    broadcastState(req, state, 'undo_called');
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/end-consultation ───

router.post('/end-consultation', (req, res) => {
  const parse = endConsultationSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  try {
    const { state, event } = queue.endConsultation(parse.data.eventId);
    broadcastState(req, state, 'end_consultation');
    res.json({ success: true, data: state, event });
  } catch (err: any) {
    if (err.message.startsWith('NO_ACTIVE_CONSULTATION')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/reorder ───

router.post('/reorder', (req, res) => {
  const parse = reorderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  try {
    const state = queue.reorderQueue(parse.data.index, parse.data.direction);
    broadcastState(req, state, 'reorder');
    res.json({ success: true, data: state });
  } catch (err: any) {
    if (err.message.startsWith('INVALID_REORDER')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/queue/patient/:tokenId ───

router.delete('/patient/:tokenId', (req, res) => {
  try {
    const state = queue.removePatient(req.params.tokenId);
    broadcastState(req, state, 'patient_removed');
    res.json({ success: true, data: state });
  } catch (err: any) {
    if (err.message.startsWith('NOT_FOUND')) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/queue/config ───

router.put('/config', (req, res) => {
  const parse = configSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  try {
    const state = queue.updateConfig(parse.data.manualAvgMinutes);
    broadcastState(req, state, 'config_update');
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/reset ───

router.post('/reset', (_req, res) => {
  try {
    const state = queue.resetQueue();
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/queue/reset-stats ───

router.post('/reset-stats', (req, res) => {
  try {
    const state = queue.resetStats();
    broadcastState(req, state, 'reset_stats');
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helper: broadcast via Socket.IO ───

function broadcastState(req: any, state: any, type: string) {
  const io = req.io;
  if (io) {
    io.emit('state_sync', {
      type,
      state,
      senderId: 'server',
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
