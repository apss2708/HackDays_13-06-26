import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { prisma } from "../prisma";
import { signToken } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// GET /auth/nonce?address=0x...
router.get("/nonce", async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.toLowerCase();
  if (!address) return res.status(400).json({ error: "Missing address" });

  const nonce = `Sign this message to authenticate with GovernanceOS.\nNonce: ${uuidv4()}\nTimestamp: ${Date.now()}`;

  await prisma.user.upsert({
    where: { walletAddress: address },
    update: { nonce },
    create: { walletAddress: address, nonce },
  });

  res.json({ nonce });
});

// POST /auth/verify
router.post("/verify", async (req: Request, res: Response) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: "Missing address or signature" });
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress: address.toLowerCase() },
  });

  if (!user || !user.nonce) {
    return res.status(400).json({ error: "No nonce found. Request /auth/nonce first." });
  }

  try {
    const recovered = ethers.verifyMessage(user.nonce, signature).toLowerCase();
    if (recovered !== address.toLowerCase()) {
      return res.status(401).json({ error: "Signature mismatch" });
    }
  } catch {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Invalidate nonce after use
  await prisma.user.update({
    where: { id: user.id },
    data: { nonce: null },
  });

  const token = signToken(user.id, user.walletAddress);
  res.json({ token, user: { id: user.id, walletAddress: user.walletAddress, displayName: user.displayName } });
});

export default router;
