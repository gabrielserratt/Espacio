import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const emailCache = new Map<string, { email: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Iniciá sesión para continuar." });
    return;
  }

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    res.status(403).json({
      error: "El acceso administrativo todavía no está configurado.",
      code: "ADMIN_ALLOWLIST_NOT_CONFIGURED",
    });
    return;
  }

  try {
    const cached = emailCache.get(userId);
    let email = cached && cached.expiresAt > Date.now() ? cached.email : "";

    if (!email) {
      const user = await clerkClient.users.getUser(userId);
      email =
        user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? "";
      if (email) {
        emailCache.set(userId, {
          email,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
    }

    if (!email || !allowedEmails.includes(email)) {
      res.status(403).json({ error: "Esta cuenta no tiene acceso de administrador." });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Failed to verify administrator access");
    res.status(503).json({ error: "No se pudo verificar el acceso. Intentá nuevamente." });
  }
};
