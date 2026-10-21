import { Readable } from "node:stream";
import {
  GetReceiptQueryParams,
  RequestReceiptUploadUrlBody,
  RequestReceiptUploadUrlResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();
const storage = new ObjectStorageService();
router.use(requireAdmin);

const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

router.post(
  "/storage/uploads/request-url",
  async (req, res): Promise<void> => {
    const parsed = RequestReceiptUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!ALLOWED_RECEIPT_TYPES.has(parsed.data.contentType)) {
      res.status(415).json({ error: "Formato de comprobante no admitido." });
      return;
    }
    try {
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestReceiptUploadUrlResponse.parse({ uploadURL, objectPath }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Failed to create receipt upload URL");
      res.status(500).json({ error: "No se pudo preparar la carga del comprobante." });
    }
  },
);

router.get("/storage/objects", async (req, res): Promise<void> => {
  const parsed = GetReceiptQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const path = parsed.data.path;
  if (
    !path.startsWith("/objects/") ||
    path.includes("..") ||
    path.includes("\\")
  ) {
    res.status(400).json({ error: "Ruta de comprobante no válida." });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(path);
    const response = await storage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Comprobante no encontrado." });
      return;
    }
    req.log.error({ err: error }, "Failed to serve receipt");
    res.status(500).json({ error: "No se pudo abrir el comprobante." });
  }
});

export default router;
