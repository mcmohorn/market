import admin from "firebase-admin";
import { pool } from "./db.js";
import type { Request, Response, NextFunction } from "express";

const PRO_WHITELIST = (process.env.PRO_WHITELIST || "mcmohorn@gmail.com,pbretts@yahoo.com")
  .split(",")
  .map(e => e.trim().toLowerCase());

let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
  if (adminApp) return adminApp;
  if (!process.env.GOOGLE_CREDENTIALS_JSON) throw new Error("GOOGLE_CREDENTIALS_JSON not set");
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(creds),
    projectId: creds.project_id,
  });
  return adminApp;
}

export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getAdminApp();
  return admin.auth(app).verifyIdToken(idToken);
}

export async function upsertUser(decoded: admin.auth.DecodedIdToken): Promise<AppUser> {
  const email = (decoded.email || "").toLowerCase();
  const displayName = decoded.name || email.split("@")[0];
  const uid = decoded.uid;
  const accountType = PRO_WHITELIST.includes(email) ? "pro" : "free";

  const result = await pool.query(
    `INSERT INTO users (email, display_name, account_type, firebase_uid, last_login)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       firebase_uid = EXCLUDED.firebase_uid,
       last_login = NOW(),
       account_type = CASE WHEN $3 = 'pro' THEN 'pro' ELSE users.account_type END
     RETURNING id, email, display_name, account_type, notification_email_enabled, created_at`,
    [email, displayName, accountType, uid]
  );
  return result.rows[0] as AppUser;
}

export interface AppUser {
  id: number;
  email: string;
  display_name: string;
  account_type: "free" | "pro";
  notification_email_enabled: boolean;
  created_at: string;
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    (req as any).user = null;
    return next();
  }
  try {
    const decoded = await verifyFirebaseToken(auth.slice(7));
    const user = await upsertUser(decoded);
    (req as any).user = user;
  } catch {
    (req as any).user = null;
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decoded = await verifyFirebaseToken(auth.slice(7));
    const user = await upsertUser(decoded);
    (req as any).user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export async function requirePro(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user as AppUser;
    if (user.account_type !== "pro") {
      return res.status(403).json({ error: "Pro account required" });
    }
    next();
  });
}
