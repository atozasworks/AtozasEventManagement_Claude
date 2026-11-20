import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { HttpError } from '../utils/http.js';

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${allowed.has(ext) ? ext : ''}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.has(ext) || !/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(new HttpError(400, 'Upload a JPG, PNG, WEBP or GIF image'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

router.post('/', protect, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'Image must be 5 MB or smaller') : err);
      return;
    }
    if (!req.file) {
      next(new HttpError(400, 'Choose an image to upload'));
      return;
    }
    res.status(201).json({ url: `/api/uploads/${req.file.filename}` });
  });
});

export { uploadDir };
export default router;
