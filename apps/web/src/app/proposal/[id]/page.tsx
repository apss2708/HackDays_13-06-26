"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useWriteContract } from "wagmi";
import { createPublicClient, http } from "viem";
import { hardhat } from "viem/chains";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../../providers";
import { GOVERNANCE_SPACE_ABI } from "../../../lib/abi";

interface Vote {
  id: string;
  voteOption: string;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  onchainId: string | null;
  startTime: string;
  endTime: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  author: {
    walletAddress: string;
    displayName: string | null;
  };
  community: {
    id: string;
    name: string;
    slug: string;
    contractAddress: string | null;
  };
  insight?: {
    aiSummary: string;
    aiRisks: string;
  } | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ProposalDetail() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isConnected, address } = useAccount();
  const { token, isAuthenticated } = useAuth();

  const [mounted, setMounted] = React.useState(false);
  const [votingState, setVotingState] = React.useState("");
  const [isVoteLoading, setIsVoteLoading] = React.useState(false);
  const [isCloseLoading, setIsCloseLoading] = React.useState(false);

  const { writeContractAsync } = useWriteContract();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Fetch Proposal details
  const { data: proposal, isLoading, error } = useQuery<Proposal>({
    queryKey: ["proposal", id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/proposals/${id}`);
      if (!res.ok) throw new Error("Proposal not found");
      return res.json();
    },
  });

  // 2. Fetch User's vote
  const { data: myVote = null, refetch: refetchMyVote } = useQuery({
    queryKey: ["my-vote", id, address],
    queryFn: async () => {
      if (!address || !isAuthenticated) return null;
      const res = await fetch(`${API_URL}/proposals/${id}/my-vote`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!address && isAuthenticated,
  });

  // 3. Fetch Space Members to check if user is a member
  const { data: members = [] } = useQuery({
    queryKey: ["community-members", proposal?.community.id],
    queryFn: async () => {
      if (!proposal?.community.id) return [];
      const res = await fetch(`${API_URL}/communities/${proposal.community.id}/members`);
      return res.json();
    },
    enabled: !!proposal?.community.id,
  });

  const isMember = React.useMemo(() => {
    if (!address || !members.length) return false;
    return members.some(
      (m: any) => m.user.walletAddress.toLowerCase() === address.toLowerCase()
    );
  }, [address, members]);

  // 4. Handle voting
  const handleVote = async (option: "FOR" | "AGAINST" | "ABSTAIN") => {
    if (!isConnected || !proposal || !isMember || isVoteLoading) return;
    setIsVoteLoading(true);
    setVotingState(`Submitting vote: ${option}...`);

    try {
      const optionMap = { FOR: 1, AGAINST: 2, ABSTAIN: 3 };
      const optionNumber = optionMap[option];

      if (!proposal.community.contractAddress || !proposal.onchainId) {
        throw new Error("Contract address or on-chain ID not found");
      }

      // A. Call contract on-chain
      const txHash = await writeContractAsync({
        address: proposal.community.contractAddress as `0x${string}`,
        abi: GOVERNANCE_SPACE_ABI,
        functionName: "vote",
        args: [BigInt(proposal.onchainId), optionNumber],
      });

      setVotingState("Waiting for vote block confirmation...");

      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http("http://127.0.0.1:8545"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("On-chain voting transaction failed");
      }

      setVotingState("Recording vote in database...");

      // B. Save to API
      const res = await fetch(`${API_URL}/proposals/${proposal.id}/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voteOption: option, txHash }),
      });

      if (!res.ok) {
        throw new Error("Failed to record vote on backend");
      }

      setVotingState("🎉 Vote recorded!");
      refetchMyVote();
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["proposal", id] });
        setVotingState("");
        setIsVoteLoading(false);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setVotingState(`❌ Error: ${err.message}`);
      setIsVoteLoading(false);
    }
  };

  // 5. Handle close proposal
  const handleCloseProposal = async () => {
    if (!isConnected || !proposal || isCloseLoading) return;
    setIsCloseLoading(true);

    try {
      if (!proposal.community.contractAddress || !proposal.onchainId) {
        throw new Error("Contract info missing");
      }

      const txHash = await writeContractAsync({
        address: proposal.community.contractAddress as `0x${string}`,
        abi: GOVERNANCE_SPACE_ABI,
        functionName: "closeProposal",
        args: [BigInt(proposal.onchainId)],
      });

      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http("http://127.0.0.1:8545"),
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Wait a moment for indexer, then refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["proposal", id] });
        setIsCloseLoading(false);
      }, 2000);

    } catch (err: any) {
      console.error(err);
      alert(`Close failed: ${err.message}`);
      setIsCloseLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-48 rounded-2xl glass-panel animate-pulse bg-white/5" />
        <div className="h-96 rounded-2xl glass-panel animate-pulse bg-white/5" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center text-rose-400">
        Proposal not found or API server error.
      </div>
    );
  }

  // Set up Recharts data
  const chartData = [
    { name: "FOR", value: proposal.forVotes, color: "#10b981" },
    { name: "AGAINST", value: proposal.againstVotes, color: "#ef4444" },
    { name: "ABSTAIN", value: proposal.abstainVotes, color: "#6b7280" },
  ].filter((d) => d.value > 0);

  const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;

  const aiRisksList = proposal.insight?.aiRisks
    ? (JSON.parse(proposal.insight.aiRisks) as string[])
    : [];

  const isExpired = new Date() > new Date(proposal.endTime);

  return (
    <div className="space-y-6">
      {/* Back to DAO Link */}
      <Link
        href={`/dao/${proposal.community.slug}`}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
      >
        ← Back to {proposal.community.name}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Proposal Content & AI Analysis */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="p-8 rounded-2xl glass-panel space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-gray-400 font-semibold uppercase">
                {proposal.category}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  proposal.status === "ACTIVE"
                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    : proposal.status === "PASSED"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                    : proposal.status === "REJECTED"
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/25"
                    : "bg-gray-500/10 text-gray-400 border border-gray-500/25"
                }`}
              >
                {proposal.status}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white leading-tight">{proposal.title}</h1>
            <p className="text-xs text-gray-400">
              Proposed by: <span className="font-mono text-gray-300">{proposal.author.walletAddress}</span>
            </p>
          </div>

          {/* AI Analysis Panel */}
          <div className="p-8 rounded-2xl glass-panel-glow space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/5 rounded-full filter blur-2xl" />
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="font-bold text-gradient-accent text-lg">AI Governance Insight</h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 text-xs">
                Gemini 2.0 Flash
              </span>
            </div>

            {proposal.insight ? (
              <div className="space-y-6 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-300">Proposal Summary</h4>
                  <p className="text-gray-400 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                    {proposal.insight.aiSummary}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-300">Risk Assessment & Warnings</h4>
                  <ul className="space-y-2">
                    {aiRisksList.map((risk, idx) => (
                      <li
                        key={idx}
                        className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-300 flex items-start gap-2.5"
                      >
                        <span className="text-sm shrink-0">{risk.split(" ")[0]}</span>
                        <span className="leading-relaxed">{risk.substring(risk.indexOf(" ") + 1)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                Generating AI summary and risk reports...
              </div>
            )}
          </div>

          {/* Proposal Description */}
          <div className="p-8 rounded-2xl glass-panel space-y-4">
            <h3 className="text-xl font-bold text-white border-b border-white/5 pb-2">Proposal Details</h3>
            <div className="prose prose-invert max-w-none text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
              <ReactMarkdown>{proposal.description}</ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Voting & Sidebar Column */}
        <div className="space-y-6">
          {/* Vote Chart & Stats */}
          <div className="p-6 rounded-2xl glass-panel space-y-6">
            <h3 className="text-lg font-bold text-white border-b border-white/5 pb-2">Vote Distribution</h3>

            {totalVotes > 0 && mounted ? (
              <div className="space-y-4">
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10">
                    <span className="block text-gray-400">FOR</span>
                    <span className="font-bold text-emerald-400">{proposal.forVotes}</span>
                  </div>
                  <div className="p-2 rounded bg-rose-500/5 border border-rose-500/10">
                    <span className="block text-gray-400">AGAINST</span>
                    <span className="font-bold text-rose-400">{proposal.againstVotes}</span>
                  </div>
                  <div className="p-2 rounded bg-gray-500/5 border border-gray-500/10">
                    <span className="block text-gray-400">ABSTAIN</span>
                    <span className="font-bold text-gray-400">{proposal.abstainVotes}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500 text-sm">
                No votes cast yet.
              </div>
            )}
          </div>

          {/* Voting Action Box */}
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <h3 className="text-lg font-bold text-white border-b border-white/5 pb-2">Cast Your Vote</h3>

            {!isConnected ? (
              <p className="text-sm text-gray-400 text-center py-4">
                Connect your wallet to vote.
              </p>
            ) : !isMember ? (
              <p className="text-sm text-amber-400 text-center py-4">
                You must join the community space before you can vote.
              </p>
            ) : myVote ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-sm text-emerald-400 font-semibold">
                  ✓ You voted <span className="underline font-bold">{myVote.voteOption}</span>
                </span>
                <span className="block text-[10px] text-gray-500 font-mono mt-1 overflow-hidden text-ellipsis">
                  Tx: {myVote.txHash}
                </span>
              </div>
            ) : proposal.status !== "ACTIVE" || isExpired ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Voting window has closed for this proposal.
              </p>
            ) : (
              <div className="space-y-3">
                {votingState && (
                  <p className="text-xs text-center text-indigo-400 font-medium">{votingState}</p>
                )}
                <button
                  onClick={() => handleVote("FOR")}
                  disabled={isVoteLoading}
                  className="w-full py-3 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition disabled:opacity-50 text-sm"
                >
                  Vote FOR
                </button>
                <button
                  onClick={() => handleVote("AGAINST")}
                  disabled={isVoteLoading}
                  className="w-full py-3 rounded-xl font-bold bg-rose-500 hover:bg-rose-600 text-white transition disabled:opacity-50 text-sm"
                >
                  Vote AGAINST
                </button>
                <button
                  onClick={() => handleVote("ABSTAIN")}
                  disabled={isVoteLoading}
                  className="w-full py-3 rounded-xl font-bold bg-gray-600 hover:bg-gray-700 text-white transition disabled:opacity-50 text-sm"
                >
                  Vote ABSTAIN
                </button>
              </div>
            )}
          </div>

          {/* Close proposal panel */}
          {proposal.status === "ACTIVE" && isExpired && (
            <div className="p-6 rounded-2xl glass-panel-glow border-amber-500/20 bg-amber-500/5 space-y-4">
              <h3 className="text-md font-bold text-amber-300">Finalize Proposal</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                The voting window has elapsed. Finalizing the proposal computes quorum, determines on-chain state outcomes, and locking votes.
              </p>
              <button
                onClick={handleCloseProposal}
                disabled={isCloseLoading}
                className="w-full py-3 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 text-black transition text-sm disabled:opacity-50"
              >
                {isCloseLoading ? "Finalizing..." : "Finalize & Close"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
