import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { generateProposalInsight } from "../services/ai";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// ── Get contract config ──────────────────────────────────────────────────────
router.get("/config/factory", async (_req: Request, res: Response) => {
  const addressesPath = path.resolve(
    __dirname,
    "../../../../packages/contracts/deployments/addresses.json"
  );
  if (!fs.existsSync(addressesPath)) {
    return res.status(404).json({ error: "No contract deployment found" });
  }
  try {
    const config = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to read configuration" });
  }
});

// ── List communities ─────────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const communities = await prisma.community.findMany({
    include: {
      _count: { select: { memberships: true, proposals: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(communities);
});

// ── Get single community ─────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const community = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      _count: { select: { memberships: true, proposals: true } },
      proposals: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          author: { select: { walletAddress: true, displayName: true } },
          insight: true,
        },
      },
    },
  });
  if (!community) return res.status(404).json({ error: "Community not found" });
  res.json(community);
});

// ── Create community ─────────────────────────────────────────────────────────
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  const { name, slug, description, logoUrl, category, governanceTemplate, quorumPercent, voteDurationSecs } = req.body;

  if (!name || !slug) return res.status(400).json({ error: "name and slug are required" });

  try {
    const community = await prisma.community.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, "-"),
        description,
        logoUrl,
        category: category || "DAO",
        governanceTemplate: governanceTemplate || "SIMPLE_MAJORITY",
        quorumPercent: quorumPercent ?? 20,
        voteDurationSecs: voteDurationSecs ?? 86400,
        ownerUserId: req.userId!,
        memberships: {
          create: { userId: req.userId!, role: "OWNER" },
        },
      },
    });
    res.status(201).json(community);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Slug already taken" });
    throw err;
  }
});

// ── Update contract address (called after on-chain deployment) ───────────────
router.patch("/:id/contract", authenticate, async (req: AuthRequest, res: Response) => {
  const { contractAddress } = req.body;
  const community = await prisma.community.update({
    where: { id: req.params.id },
    data: { contractAddress },
  });
  res.json(community);
});

// ── Join a community ─────────────────────────────────────────────────────────
router.post("/:id/join", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const membership = await prisma.membership.create({
      data: {
        communityId: req.params.id,
        userId: req.userId!,
        role: "MEMBER",
      },
    });
    res.status(201).json(membership);
  } catch (err: any) {
    if (err.code === "P2002") return res.json({ message: "Already a member" });
    throw err;
  }
});

// ── Get members ──────────────────────────────────────────────────────────────
router.get("/:id/members", async (req: Request, res: Response) => {
  const members = await prisma.membership.findMany({
    where: { communityId: req.params.id },
    include: { user: { select: { id: true, walletAddress: true, displayName: true } } },
    orderBy: { joinedAt: "asc" },
  });
  res.json(members);
});

// ── Get proposals for a community ───────────────────────────────────────────
router.get("/:id/proposals", async (req: Request, res: Response) => {
  const { status } = req.query;
  const proposals = await prisma.proposal.findMany({
    where: {
      communityId: req.params.id,
      ...(status ? { status: status as any } : {}),
    },
    include: {
      author: { select: { walletAddress: true, displayName: true } },
      insight: true,
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(proposals);
});

// ── Create proposal ──────────────────────────────────────────────────────────
router.post("/:id/proposals", authenticate, async (req: AuthRequest, res: Response) => {
  const { title, description, category, startTime, endTime, onchainId, txHash } = req.body;
  if (!title || !description) return res.status(400).json({ error: "title and description required" });

  const start = startTime ? new Date(startTime) : new Date();
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community) return res.status(404).json({ error: "Community not found" });

  const end = endTime ? new Date(endTime) : new Date(start.getTime() + community.voteDurationSecs * 1000);

  const proposal = await prisma.proposal.create({
    data: {
      communityId: req.params.id,
      authorId: req.userId!,
      title,
      description,
      category: category || "General",
      onchainId: onchainId?.toString(),
      txHash,
      startTime: start,
      endTime: end,
      status: "ACTIVE",
    },
    include: {
      author: { select: { walletAddress: true, displayName: true } },
    },
  });

  // Trigger AI insight generation asynchronously
  generateProposalInsight(proposal.id, title, description).catch(console.error);

  res.status(201).json(proposal);
});

export default router;
