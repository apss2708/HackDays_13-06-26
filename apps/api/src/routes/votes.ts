import { Router, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /proposals/:id/votes  – aggregated vote stats + user's own vote
router.get("/:id/votes", async (req: AuthRequest, res: Response) => {
  const proposal = await prisma.proposal.findUnique({
    where: { id: req.params.id },
    select: { forVotes: true, againstVotes: true, abstainVotes: true },
  });
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  res.json({
    forVotes: proposal.forVotes,
    againstVotes: proposal.againstVotes,
    abstainVotes: proposal.abstainVotes,
    total: proposal.forVotes + proposal.againstVotes + proposal.abstainVotes,
  });
});

// POST /proposals/:id/votes – record a vote from the backend (after on-chain tx)
router.post("/:id/votes", authenticate, async (req: AuthRequest, res: Response) => {
  const { voteOption, txHash } = req.body;
  if (!["FOR", "AGAINST", "ABSTAIN"].includes(voteOption)) {
    return res.status(400).json({ error: "voteOption must be FOR, AGAINST, or ABSTAIN" });
  }

  const proposal = await prisma.proposal.findUnique({ where: { id: req.params.id } });
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  if (proposal.status !== "ACTIVE") {
    return res.status(400).json({ error: "Proposal is not active" });
  }

  const now = new Date();
  if (now < proposal.startTime || now > proposal.endTime) {
    return res.status(400).json({ error: "Outside voting window" });
  }

  try {
    const [vote] = await prisma.$transaction([
      prisma.vote.create({
        data: {
          proposalId: req.params.id,
          userId: req.userId!,
          voteOption: voteOption as any,
          txHash,
        },
      }),
      prisma.proposal.update({
        where: { id: req.params.id },
        data: {
          forVotes:     voteOption === "FOR"     ? { increment: 1 } : undefined,
          againstVotes: voteOption === "AGAINST" ? { increment: 1 } : undefined,
          abstainVotes: voteOption === "ABSTAIN" ? { increment: 1 } : undefined,
        },
      }),
    ]);

    res.status(201).json(vote);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Already voted" });
    throw err;
  }
});

// GET /proposals/:id/my-vote – check if authenticated user has voted
router.get("/:id/my-vote", authenticate, async (req: AuthRequest, res: Response) => {
  const vote = await prisma.vote.findUnique({
    where: { proposalId_userId: { proposalId: req.params.id, userId: req.userId! } },
  });
  res.json(vote ?? null);
});

export default router;
