import { Router, Request, Response } from "express";
import { prisma } from "../prisma";

const router = Router();

// GET /proposals/:id
router.get("/:id", async (req: Request, res: Response) => {
  const proposal = await prisma.proposal.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { walletAddress: true, displayName: true } },
      community: { select: { id: true, name: true, slug: true, contractAddress: true } },
      insight: true,
      _count: { select: { votes: true } },
    },
  });
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  res.json(proposal);
});

export default router;
