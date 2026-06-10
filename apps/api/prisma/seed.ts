import { PrismaClient } from "@prisma/client";
import { generateProposalInsight } from "../src/services/ai";

const prisma = new PrismaClient();

const DEMO_WALLET_1 = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat #0
const DEMO_WALLET_2 = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"; // Hardhat #1
const DEMO_WALLET_3 = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"; // Hardhat #2
const DEMO_WALLET_4 = "0x90f79bf6eb2c4f870365e785982e1f101e93b906"; // Hardhat #3

async function main() {
  console.log("🌱 Seeding database...");

  // Create demo users
  const [admin1, admin2, admin3, member1] = await Promise.all([
    prisma.user.upsert({ where: { walletAddress: DEMO_WALLET_1 }, update: {}, create: { walletAddress: DEMO_WALLET_1, displayName: "Alice (Admin)" } }),
    prisma.user.upsert({ where: { walletAddress: DEMO_WALLET_2 }, update: {}, create: { walletAddress: DEMO_WALLET_2, displayName: "Bob (Dev)" } }),
    prisma.user.upsert({ where: { walletAddress: DEMO_WALLET_3 }, update: {}, create: { walletAddress: DEMO_WALLET_3, displayName: "Carol (OSS)" } }),
    prisma.user.upsert({ where: { walletAddress: DEMO_WALLET_4 }, update: {}, create: { walletAddress: DEMO_WALLET_4, displayName: "Dave (Member)" } }),
  ]);

  // ── Community 1: College Tech Club ──────────────────────────────────────────
  const club = await prisma.community.upsert({
    where: { slug: "college-tech-club" },
    update: {},
    create: {
      name: "College Tech Club",
      slug: "college-tech-club",
      description: "A student-run technical community fostering innovation, peer learning, and collaborative projects across CS, AI, and Web3.",
      category: "Club",
      logoUrl: "https://api.dicebear.com/8.x/identicon/svg?seed=college-tech-club",
      governanceTemplate: "SIMPLE_MAJORITY",
      quorumPercent: 25,
      voteDurationSecs: 86400,
      ownerUserId: admin1.id,
      memberships: {
        create: [
          { userId: admin1.id, role: "OWNER" },
          { userId: admin2.id, role: "ADMIN" },
          { userId: member1.id, role: "MEMBER" },
        ],
      },
    },
  });

  // ── Community 2: Open Source Project ────────────────────────────────────────
  const oss = await prisma.community.upsert({
    where: { slug: "open-source-dao" },
    update: {},
    create: {
      name: "Open Source Project",
      slug: "open-source-dao",
      description: "Decentralized governance for an open-source framework. Contributors vote on roadmap priorities, funding allocations, and maintainer elections.",
      category: "OSS",
      logoUrl: "https://api.dicebear.com/8.x/identicon/svg?seed=open-source-dao",
      governanceTemplate: "SIMPLE_MAJORITY",
      quorumPercent: 20,
      voteDurationSecs: 172800,
      ownerUserId: admin2.id,
      memberships: {
        create: [
          { userId: admin2.id, role: "OWNER" },
          { userId: admin1.id, role: "ADMIN" },
          { userId: admin3.id, role: "MEMBER" },
          { userId: member1.id, role: "MEMBER" },
        ],
      },
    },
  });

  // ── Community 3: Dev DAO ─────────────────────────────────────────────────────
  const devDao = await prisma.community.upsert({
    where: { slug: "dev-dao" },
    update: {},
    create: {
      name: "Dev DAO",
      slug: "dev-dao",
      description: "A decentralized autonomous organization for developers building the next generation of Web3 infrastructure and tooling.",
      category: "DAO",
      logoUrl: "https://api.dicebear.com/8.x/identicon/svg?seed=dev-dao",
      governanceTemplate: "SIMPLE_MAJORITY",
      quorumPercent: 30,
      voteDurationSecs: 259200,
      ownerUserId: admin3.id,
      memberships: {
        create: [
          { userId: admin3.id, role: "OWNER" },
          { userId: admin1.id, role: "ADMIN" },
          { userId: admin2.id, role: "MEMBER" },
          { userId: member1.id, role: "MEMBER" },
        ],
      },
    },
  });

  console.log("✅ Communities created:", club.name, oss.name, devDao.name);

  // ── Proposals ────────────────────────────────────────────────────────────────
  const now = new Date();
  const past = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000);
  const future = (daysAhead: number) => new Date(now.getTime() + daysAhead * 86400_000);

  const proposals = [
    // Club proposals
    {
      communityId: club.id, authorId: admin1.id,
      title: "Annual Hackathon Budget – $5,000 Allocation",
      description: `## Proposal

This proposal requests an allocation of **$5,000** from the club treasury to fund our Annual 48-Hour Hackathon.

### Breakdown
- Venue rental: $1,200
- Food & beverages: $1,500
- Prizes (1st, 2nd, 3rd place): $2,000
- Printing & miscellaneous: $300

### Rationale
Last year's hackathon brought in 120 participants, 3 sponsors, and resulted in 2 projects that received external funding. This investment directly drives club visibility and student recruitment.

### Timeline
The event is planned for **March 15–17** and requires budget approval by **February 28**.`,
      category: "Finance",
      startTime: past(5), endTime: future(2),
      status: "ACTIVE", forVotes: 8, againstVotes: 2, abstainVotes: 1,
    },
    {
      communityId: club.id, authorId: admin2.id,
      title: "Adopt Weekly Pair Programming Sessions",
      description: `## Summary
Introduce mandatory weekly pair programming sessions (90 min every Tuesday) to improve code quality and knowledge sharing among members.

## Benefits
- Accelerates learning for newer members
- Reduces silos and bus factor in key projects
- Builds cross-disciplinary collaboration

## Implementation
Sessions will be rotating pairs, tracked via a shared calendar. Attendance is voluntary but participation counts toward project assignment priority.`,
      category: "Operations",
      startTime: past(10), endTime: past(1),
      status: "PASSED", forVotes: 15, againstVotes: 3, abstainVotes: 0,
    },
    // OSS proposals
    {
      communityId: oss.id, authorId: admin2.id,
      title: "Migrate from Jest to Vitest – Test Suite Overhaul",
      description: `## Problem
Our current Jest test suite takes **4.2 minutes** on CI, blocking fast iteration. Vitest offers 3-5x faster test execution with native ESM support.

## Proposed Change
- Migrate all 847 test files to Vitest 1.x
- Update CI configuration to leverage Vitest's built-in parallelism  
- Remove 8 deprecated Jest plugins currently causing version conflicts

## Risks
- Breaking changes in snapshot format require one-time update
- Some team members unfamiliar with Vitest API

## Expected Outcome
CI time reduced to ~60 seconds. Faster feedback loop for all contributors.`,
      category: "Technical",
      startTime: past(3), endTime: future(4),
      status: "ACTIVE", forVotes: 12, againstVotes: 1, abstainVotes: 2,
    },
    {
      communityId: oss.id, authorId: admin1.id,
      title: "Add Rust Implementation for Core Parser",
      description: `## Motivation
The JavaScript parser bottleneck limits throughput to ~50K tokens/sec. A Rust WASM implementation could reach 800K+ tokens/sec based on benchmarks.

## Scope
- Implement core tokenizer in Rust (estd/nom)
- Compile to WASM with wasm-bindgen
- Provide identical JS API surface via JS shim
- Maintain existing JS fallback for environments without WASM support

## Governance Implication
This is a major architectural change. Approval by ≥60% of active contributors required per our bylaws.`,
      category: "Technical",
      startTime: past(15), endTime: past(3),
      status: "REJECTED", forVotes: 7, againstVotes: 11, abstainVotes: 3,
    },
    // Dev DAO proposals
    {
      communityId: devDao.id, authorId: admin3.id,
      title: "Treasury Grant: $50K for Layer 2 Tooling Research",
      description: `## Overview
This proposal allocates **50,000 USDC** from the Dev DAO treasury to fund a 3-month research sprint focused on developer tooling for EVM Layer 2 networks (Arbitrum, Optimism, Base).

## Research Areas
1. Cross-L2 debugging toolchain
2. Gas estimation libraries for L2 environments
3. Unified deployment pipelines for multi-L2 apps

## Deliverables
- Open-source repos with MIT license
- Monthly progress reports published on Mirror
- Final research paper and tooling demos at ETHGlobal Bangkok

## Budget Breakdown
| Item | Amount |
|------|--------|
| 2 Lead Researchers × 3 months | $36,000 |
| Infrastructure & cloud | $8,000 |
| Audits & reviews | $6,000 |

## Risk Disclosure
Treasury allocation above $30K requires a quorum of 30% and a 60% supermajority per DAO constitution.`,
      category: "Finance",
      startTime: past(1), endTime: future(6),
      status: "ACTIVE", forVotes: 18, againstVotes: 4, abstainVotes: 3,
    },
    {
      communityId: devDao.id, authorId: admin2.id,
      title: "Elect New Core Contributors – Q3 Cohort",
      description: `## Purpose
Formally recognize and elect 4 new core contributors for the Q3 2024 cohort. Core contributors receive elevated repository access, attend governance calls, and are eligible for contributor grants.

## Nominees
1. **@vitalik_fan** – L2 research, 120 merged PRs
2. **@rustacean_dev** – Core parser, 89 merged PRs  
3. **@defi_alice** – Protocol integrations, 67 merged PRs
4. **@solidity_sam** – Smart contract auditing, 45 merged PRs

## Election Rules
- Simple majority required (50%+)
- Minimum quorum: 30% of active members
- All nominees have signed the Contributor Agreement`,
      category: "Governance",
      startTime: past(8), endTime: past(2),
      status: "PASSED", forVotes: 22, againstVotes: 5, abstainVotes: 2,
    },
  ];

  for (const p of proposals) {
    const created = await prisma.proposal.upsert({
      where: { id: `seed-${p.title.slice(0, 20).replace(/\s/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `seed-${p.title.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`,
        communityId: p.communityId,
        authorId: p.authorId,
        title: p.title,
        description: p.description,
        category: p.category,
        startTime: p.startTime,
        endTime: p.endTime,
        status: p.status as any,
        forVotes: p.forVotes,
        againstVotes: p.againstVotes,
        abstainVotes: p.abstainVotes,
      },
    });

    // Generate AI insight for each proposal
    await generateProposalInsight(created.id, p.title, p.description);
  }

  console.log(`✅ ${proposals.length} proposals seeded with AI insights`);
  console.log("🎉 Seeding complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
