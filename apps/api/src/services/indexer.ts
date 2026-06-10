import { createPublicClient, http, parseAbiItem, Address } from "viem";
import { hardhat } from "viem/chains";
import { prisma } from "../prisma";
import * as fs from "fs";
import * as path from "path";

let factoryAddress: Address | null = null;

function loadFactoryAddress(): Address | null {
  const addressesPath = path.resolve(
    __dirname,
    "../../../../packages/contracts/deployments/addresses.json"
  );
  if (!fs.existsSync(addressesPath)) return null;
  const { GovernanceFactory } = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
  return GovernanceFactory as Address;
}

const CHAIN_RPC = process.env.CHAIN_RPC_URL || "http://127.0.0.1:8545";

const client = createPublicClient({
  chain: { ...hardhat, rpcUrls: { default: { http: [CHAIN_RPC] } } } as any,
  transport: http(CHAIN_RPC),
});

const COMMUNITY_CREATED_ABI = parseAbiItem(
  "event CommunityCreated(uint256 indexed index, address indexed spaceAddress, address indexed owner, string communityId)"
);

const PROPOSAL_CREATED_ABI = parseAbiItem(
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string metadataURI, uint256 startTime, uint256 endTime)"
);

const VOTE_CAST_ABI = parseAbiItem(
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 option)"
);

const PROPOSAL_CLOSED_ABI = parseAbiItem(
  "event ProposalClosed(uint256 indexed proposalId, uint8 status, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes)"
);

async function handleCommunityCreated(log: any) {
  const { spaceAddress, owner, communityId } = log.args;
  await prisma.community.updateMany({
    where: { id: communityId },
    data: { contractAddress: spaceAddress },
  });
  console.log(`📡 CommunityCreated indexed: ${communityId} → ${spaceAddress}`);
}

async function handleVoteCast(log: any, spaceAddress: Address) {
  const { proposalId, voter, option } = log.args;
  const optionMap: Record<number, "FOR" | "AGAINST" | "ABSTAIN"> = {
    1: "FOR",
    2: "AGAINST",
    3: "ABSTAIN",
  };
  const voteOption = optionMap[Number(option)];
  if (!voteOption) return;

  // Find proposal by onchainId + spaceAddress
  const community = await prisma.community.findFirst({ where: { contractAddress: spaceAddress } });
  if (!community) return;

  const proposal = await prisma.proposal.findFirst({
    where: { onchainId: proposalId.toString(), communityId: community.id },
  });
  if (!proposal) return;

  const user = await prisma.user.findFirst({ where: { walletAddress: voter.toLowerCase() } });
  if (!user) return;

  try {
    await prisma.$transaction([
      prisma.vote.create({
        data: { proposalId: proposal.id, userId: user.id, voteOption, txHash: log.transactionHash },
      }),
      prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          forVotes:     voteOption === "FOR"     ? { increment: 1 } : undefined,
          againstVotes: voteOption === "AGAINST" ? { increment: 1 } : undefined,
          abstainVotes: voteOption === "ABSTAIN" ? { increment: 1 } : undefined,
        },
      }),
    ]);
    console.log(`📡 VoteCast indexed: proposal ${proposal.id} – ${voteOption} from ${voter}`);
  } catch {
    // Duplicate vote – already recorded via REST API
  }
}

async function handleProposalClosed(log: any, spaceAddress: Address) {
  const { proposalId, status } = log.args;
  const statusMap: Record<number, "PASSED" | "REJECTED" | "EXPIRED"> = {
    1: "PASSED",
    2: "REJECTED",
    3: "EXPIRED",
  };
  const newStatus = statusMap[Number(status)];
  if (!newStatus) return;

  const community = await prisma.community.findFirst({ where: { contractAddress: spaceAddress } });
  if (!community) return;

  await prisma.proposal.updateMany({
    where: { onchainId: proposalId.toString(), communityId: community.id },
    data: { status: newStatus },
  });
  console.log(`📡 ProposalClosed indexed: ${proposalId.toString()} → ${newStatus}`);
}

export async function startIndexer() {
  factoryAddress = loadFactoryAddress();
  if (!factoryAddress) {
    console.log("⚠️  No deployment found – indexer will retry every 10s");
    setTimeout(startIndexer, 10_000);
    return;
  }

  console.log(`🔍 Indexer watching factory: ${factoryAddress}`);

  // Watch factory for new communities
  client.watchContractEvent({
    address: factoryAddress,
    abi: [COMMUNITY_CREATED_ABI],
    eventName: "CommunityCreated",
    onLogs: (logs) => logs.forEach(handleCommunityCreated),
  });

  // Watch all known GovernanceSpace contracts
  async function watchSpaces() {
    const communities = await prisma.community.findMany({
      where: { contractAddress: { not: null } },
    });

    for (const c of communities) {
      const addr = c.contractAddress as Address;
      client.watchContractEvent({
        address: addr,
        abi: [VOTE_CAST_ABI],
        eventName: "VoteCast",
        onLogs: (logs) => logs.forEach((l) => handleVoteCast(l, addr)),
      });
      client.watchContractEvent({
        address: addr,
        abi: [PROPOSAL_CLOSED_ABI],
        eventName: "ProposalClosed",
        onLogs: (logs) => logs.forEach((l) => handleProposalClosed(l, addr)),
      });
    }
  }

  await watchSpaces();
  // Re-discover new spaces every 30s
  setInterval(watchSpaces, 30_000);
}
