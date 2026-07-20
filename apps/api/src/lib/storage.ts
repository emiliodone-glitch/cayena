import crypto from "crypto";
import fs from "fs";
import path from "path";

// Almacenamiento local en disco por defecto. Para producción con múltiples
// instancias, reemplazar esta función por un adaptador S3/Cloudinary/R2 que
// implemente la misma firma (buffer, nombre, mimetype) => url pública.
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(__dirname, "..", "..", "uploads");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function extensionForMime(mimetype: string): string | null {
  return EXT_BY_MIME[mimetype] ?? null;
}

export async function saveFile(buffer: Buffer, mimetype: string): Promise<string> {
  const ext = extensionForMime(mimetype);
  if (!ext) throw new Error(`Tipo de archivo no soportado: ${mimetype}`);
  const filename = `${crypto.randomUUID()}${ext}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);
  return `/files/${filename}`;
}

export { UPLOADS_DIR };
