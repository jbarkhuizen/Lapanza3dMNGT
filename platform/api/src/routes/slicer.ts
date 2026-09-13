import { Router } from 'express';
import multer from 'multer';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { validateStlBuffer } from '../slicer/stlValidator.js';
import { pendingSliceUploads } from '../slicer/worker.js';

export const slicerRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.toLowerCase().endsWith('.stl'));
  },
});

slicerRouter.post('/api/slicer/jobs', requireTenantAuth, requireActiveSubscription, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'A .stl file is required.' });
  }
  try {
    validateStlBuffer(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'Invalid STL file.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const job = await scoped.sliceJobs.create({
    originFileName: req.file.originalname,
    printerId: req.body.printerId || null,
    printerPresetId: req.body.printerPresetId || null,
    filamentId: req.body.filamentId || null,
  });
  // The STL bytes themselves are NOT a SliceJob column — held only in this
  // in-process queue map, not persisted to Postgres, and read/deleted by
  // the worker (src/slicer/worker.ts) when it actually processes the job.
  // Large binary blobs don't belong in a relational row, and the file only
  // needs to exist for the few seconds between upload and slice.
  pendingSliceUploads.set(job.id, req.file.buffer);
  res.status(201).json({ ok: true, job: { id: job.id, status: job.status } });
});

slicerRouter.get('/api/slicer/jobs/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const job = await scoped.sliceJobs.findById(req.params.id);
  if (!job) {
    return res.status(404).json({ ok: false, error: 'Slice job not found.' });
  }
  res.json({ ok: true, job });
});
