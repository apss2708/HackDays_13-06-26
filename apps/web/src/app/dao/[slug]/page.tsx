"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useWriteContract } from "wagmi";
import { createPublicClient, http } from "viem";
import { hardhat } from "viem/chains";
import { useAuth } from "../../providers";
import { GOVERNANCE_SPACE_ABI } from "../../../lib/abi";

interface Proposal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  startTime: string;
  endTime: string;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  author: {
    walletAddress: string;
    displayName: string | null;
  };
  insight?: {
    aiSummary: string;
    aiRisks: string;
  } | null;
}

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  category: string;
  governanceTemplate: string;
  quorumPercent: number;
  voteDurationSecs: number;
  contractAddress: string | null;
  _count: {
    memberships: number;
    proposals: number;
  };
  proposals: Proposal[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function DaoDashboard() {
  const { slug } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isConnected, address } = useAccount();
  const { token, isAuthenticated } = useAuth();

  const [isJoinLoading, setIsJoinLoading] = React.useState(false);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [proposalTitle, setProposalTitle] = React.useState("");
  const [proposalCategory, setProposalCategory] = React.useState("General");
  const [proposalDesc, setProposalDesc] = React.useState("");
  const [isProposalCreating, setIsProposalCreating] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState("");

  const { writeContractAsync } = useWriteContract();

  // 1. Fetch Community details
  const { data: dao, isLoading, error } = useQuery<Community>({
    queryKey: ["community", slug],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/communities/${slug}`);
      if (!res.ok) throw new Error("Community not found");
      return res.json();
    },
  });

  // 2. Fetch Members
  const { data: members = [] } = useQuery({
    queryKey: ["community-members", dao?.id],
    queryFn: async () => {
      if (!dao?.id) return [];
      const res = await fetch(`${API_URL}/communities/${dao.id}/members`);
      return res.json();
    },
    enabled: !!dao?.id,
  });

  const isMember = React.useMemo(() => {
    if (!address || !members.length) return false;
    return members.some(
      (m: any) => m.user.walletAddress.toLowerCase() === address.toLowerCase()
    );
  }, [address, members]);

  // 3. Join space function
  const handleJoin = async () => {
    if (!isConnected || !dao || isJoinLoading) return;
    setIsJoinLoading(true);
    try {
      // If contract exists, trigger on-chain join
      if (dao.contractAddress) {
        await writeContractAsync({
          address: dao.contractAddress as `0x${string}`,
          abi: GOVERNANCE_SPACE_ABI,
          functionName: "join",
        });
      }

      // If backend auth is set, join in DB
      if (isAuthenticated) {
        await fetch(`${API_URL}/communities/${dao.id}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }

      queryClient.invalidateQueries({ queryKey: ["community-members", dao.id] });
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoinLoading(false);
    }
  };

  // 4. Create Proposal submission
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !dao || !isMember || isProposalCreating) return;

    setIsProposalCreating(true);
    setCreateStatus("Saving proposal metadata...");

    try {
      // 1. Save proposal to database
      const dbRes = await fetch(`${API_URL}/communities/${dao.id}/proposals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: proposalTitle,
          description: proposalDesc,
          category: proposalCategory,
        }),
      });

      if (!dbRes.ok) {
        throw new Error("Failed to save proposal to DB");
      }

      const proposal = await dbRes.json();
      setCreateStatus("Requesting on-chain transaction...");

      let onchainTxHash = "";
      if (dao.contractAddress) {
        // 2. Call contract: createProposal(metadataURI, startTime, endTime)
        const txHash = await writeContractAsync({
          address: dao.contractAddress as `0x${string}`,
          abi: GOVERNANCE_SPACE_ABI,
          functionName: "createProposal",
          args: [`db:${proposal.id}`, BigInt(0), BigInt(0)],
        });

        onchainTxHash = txHash;
        setCreateStatus("Waiting for transaction confirmation...");

        const publicClient = createPublicClient({
          chain: hardhat,
          transport: http("http://127.0.0.1:8545"),
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          throw new Error("Transaction failed on-chain");
        }
      }

      setCreateStatus("🎉 Proposal created successfully!");
      setProposalTitle("");
      setProposalDesc("");
      setShowCreateForm(false);
      
      // Wait for indexer to catch it, then refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["community", slug] });
        setIsProposalCreating(false);
        setCreateStatus("");
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setCreateStatus(`❌ Error: ${err.message}`);
      setIsProposalCreating(false);
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

  if (error || !dao) {
    return (
      <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center text-rose-400">
        Ecosystem not found or API server error.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Header and Left Column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Profile Card */}
        <div className="p-8 rounded-2xl glass-panel flex flex-col sm:flex-row gap-6 items-start relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full filter blur-3xl" />
          <div className="w-20 h-20 rounded-2xl bg-white/5 overflow-hidden flex items-center justify-center border border-white/10 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dao.logoUrl || `https://api.dicebear.com/8.x/identicon/svg?seed=${dao.slug}`}
              alt={dao.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white">{dao.name}</h1>
              <span className="px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-gray-300 font-semibold uppercase">
                {dao.category}
              </span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{dao.description}</p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              {isMember ? (
                <span className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  ✓ Joined Space Member
                </span>
              ) : (
                <button
                  onClick={handleJoin}
                  disabled={isJoinLoading}
                  className="px-5 py-2 rounded-xl font-bold bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-50 text-sm"
                >
                  {isJoinLoading ? "Joining..." : "Join Community"}
                </button>
              )}
              {isMember && (
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="px-5 py-2 rounded-xl font-bold border border-white/10 hover:bg-white/5 text-sm"
                >
                  {showCreateForm ? "Cancel" : "New Proposal"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Create Proposal Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateProposal} className="p-8 rounded-2xl glass-panel space-y-4">
            <h3 className="text-xl font-bold text-white border-b border-white/5 pb-2">Create Proposal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Proposal Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Treasury allocation for hackathon"
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Category</label>
                <select
                  value={proposalCategory}
                  onChange={(e) => setProposalCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-sm bg-[#06060c]"
                >
                  <option value="General">General</option>
                  <option value="Finance">Finance</option>
                  <option value="Technical">Technical</option>
                  <option value="Governance">Governance</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Details / Rationale (Markdown supported)</label>
              <textarea
                required
                rows={5}
                placeholder="Include background context, budget breakdown, deliverables, and metrics."
                value={proposalDesc}
                onChange={(e) => setProposalDesc(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl glass-input text-sm font-mono"
              />
            </div>
            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="text-xs text-gray-400">{createStatus}</span>
              <button
                type="submit"
                disabled={isProposalCreating}
                className="px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm"
              >
                {isProposalCreating ? "Creating..." : "Submit Proposal"}
              </button>
            </div>
          </form>
        )}

        {/* Proposals List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white">Proposals</h2>
          {dao.proposals.length === 0 ? (
            <div className="p-12 rounded-2xl glass-panel text-center text-gray-500">
              No proposals found. Click &quot;New Proposal&quot; above to create the first one!
            </div>
          ) : (
            <div className="space-y-4">
              {dao.proposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/proposal/${proposal.id}`}
                  className="p-6 rounded-2xl glass-panel flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:scale-[1.005] hover:border-indigo-500/30 transition"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-gray-400">
                        {proposal.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          proposal.status === "ACTIVE"
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                            : proposal.status === "PASSED"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : proposal.status === "REJECTED"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                        }`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white">{proposal.title}</h3>
                    <p className="text-xs text-gray-400">
                      Proposed by: <span className="font-mono text-gray-300">{proposal.author.displayName || proposal.author.walletAddress.substring(0, 8) + "..."}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-gray-400 font-medium shrink-0">
                    <div className="flex gap-3">
                      <div>
                        👍 <span className="text-emerald-400 font-semibold">{proposal.forVotes}</span>
                      </div>
                      <div>
                        👎 <span className="text-rose-400 font-semibold">{proposal.againstVotes}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-gray-500 text-[10px] uppercase">Ends on</span>
                      <span className="text-gray-300 font-semibold">
                        {new Date(proposal.endTime).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Details */}
      <div className="space-y-6">
        {/* Governance Info */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="text-lg font-bold text-white border-b border-white/5 pb-2">Space Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Governance Type</span>
              <span className="font-semibold text-gray-200">
                {dao.governanceTemplate.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Quorum Required</span>
              <span className="font-semibold text-indigo-400">{dao.quorumPercent}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Voting Window</span>
              <span className="font-semibold text-gray-200">
                {dao.voteDurationSecs / 3600} Hours
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Members Count</span>
              <span className="font-semibold text-gray-200">{members.length}</span>
            </div>
            <div className="pt-2 border-t border-white/5 space-y-1">
              <span className="block text-xs text-gray-400">Contract Address</span>
              {dao.contractAddress ? (
                <a
                  href={`#`}
                  className="block text-xs font-mono text-indigo-400 hover:underline overflow-hidden text-ellipsis whitespace-nowrap"
                  title={dao.contractAddress}
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(dao.contractAddress!);
                    alert("Contract Address Copied!");
                  }}
                >
                  {dao.contractAddress}
                </a>
              ) : (
                <span className="text-xs text-amber-400 font-semibold">Off-chain space registry</span>
              )}
            </div>
          </div>
        </div>

        {/* Member list widget */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="text-lg font-bold text-white border-b border-white/5 pb-2">Community Members</h3>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {members.map((member: any) => (
              <div key={member.id} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-bold text-xs uppercase border border-white/10 text-indigo-300">
                  {member.user.displayName ? member.user.displayName.charAt(0) : "M"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <span className="block font-medium text-gray-200 text-ellipsis overflow-hidden whitespace-nowrap">
                    {member.user.displayName || "Member"}
                  </span>
                  <span className="block text-[10px] text-gray-500 font-mono">
                    {member.user.walletAddress.substring(0, 10)}...
                  </span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 uppercase">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
