import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncRoute, HttpError } from "../middleware/errorHandler";
import { extensionForMime, saveFile } from "../lib/storage";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// RF-04/RF-07: adjuntar fotos a actividades y obras.
uploadsRouter.post(
  "/",
  upload.single("file"),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No se recibió ningún archivo");
    if (!extensionForMime(req.file.mimetype)) {
      throw new HttpError(400, "Formato de imagen no soportado (usa JPG, PNG, WEBP o GIF)");
    }
    const url = await saveFile(req.file.buffer, req.file.mimetype);
    res.status(201).json({ url });
  }),
);
