import { Router, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /me
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: {
      memberships: {
        include: { community: { select: { id: true, name: true, slug: true, logoUrl: true } } },
      },
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// PATCH /me (update display name)
router.patch("/", authenticate, async (req: AuthRequest, res: Response) => {
  const { displayName } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { displayName },
  });
  res.json(user);
});

export default router;
