import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "governance-os-dev-secret";

export interface AuthRequest extends Request {
  userId?: string;
  walletAddress?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; walletAddress: string };
    req.userId = payload.userId;
    req.walletAddress = payload.walletAddress;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function signToken(userId: string, walletAddress: string) {
  return jwt.sign({ userId, walletAddress }, JWT_SECRET, { expiresIn: "7d" });
}
