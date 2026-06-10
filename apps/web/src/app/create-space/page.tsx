"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { readContract } from "viem/actions";
import { createPublicClient, http } from "viem";
import { hardhat } from "viem/chains";
import { useAuth } from "../providers";
import { GOVERNANCE_FACTORY_ABI } from "../../lib/abi";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function CreateSpace() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { token, login, isAuthenticated } = useAuth();

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("DAO");
  const [quorumPercent, setQuorumPercent] = React.useState(20);
  const [voteDurationHours, setVoteDurationHours] = React.useState(24);
  const [logoUrl, setLogoUrl] = React.useState("");
  const [statusText, setStatusText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const { writeContractAsync } = useWriteContract();

  // Auto-generate slug from name
  React.useEffect(() => {
    setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !isAuthenticated) return;

    setSubmitting(true);
    setStatusText("1. Saving space details to DB...");

    try {
      // 1. Fetch factory address from API
      const factoryRes = await fetch(`${API_URL}/communities/config/factory`);
      if (!factoryRes.ok) {
        throw new Error("Local Hardhat contracts are not deployed yet. Please deploy factory first.");
      }
      const { GovernanceFactory: factoryAddress } = await factoryRes.json();

      // 2. Save community to API DB to get ID
      const dbRes = await fetch(`${API_URL}/communities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          slug,
          description,
          logoUrl: logoUrl || `https://api.dicebear.com/8.x/identicon/svg?seed=${slug}`,
          category,
          quorumPercent,
          voteDurationSecs: voteDurationHours * 3600,
        }),
      });

      if (!dbRes.ok) {
        const err = await dbRes.json();
        throw new Error(err.error || "Failed to create space in database");
      }

      const community = await dbRes.json();
      setStatusText("2. Requesting contract deployment on-chain...");

      // 3. Trigger smart contract creation via factory
      const txHash = await writeContractAsync({
        address: factoryAddress,
        abi: GOVERNANCE_FACTORY_ABI,
        functionName: "createCommunity",
        args: [
          community.id,
          BigInt(quorumPercent),
          BigInt(voteDurationHours * 3600),
        ],
      });

      setStatusText("3. Waiting for blockchain transaction confirmation...");

      // 4. Wait for transaction to be mined
      const publicClient = createPublicClient({
        chain: hardhat,
        transport: http("http://127.0.0.1:8545"),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed on-chain");
      }

      setStatusText("4. Retrieving contract address...");

      // 5. Query contract address from factory registry
      const deployedAddress = await publicClient.readContract({
        address: factoryAddress,
        abi: GOVERNANCE_FACTORY_ABI,
        functionName: "getSpaceAddress",
        args: [community.id],
      });

      setStatusText("5. Syncing contract address with backend...");

      // 6. Bind contract address in DB
      const updateRes = await fetch(`${API_URL}/communities/${community.id}/contract`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contractAddress: deployedAddress }),
      });

      if (!updateRes.ok) {
        throw new Error("Failed to sync contract address to backend");
      }

      setStatusText("🎉 Space deployed! Redirecting...");
      setTimeout(() => {
        router.push(`/dao/${slug}`);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setStatusText(`❌ Error: ${err.message}`);
      setSubmitting(false);
    }
  };

  const handleRandomLogo = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setLogoUrl(`https://api.dicebear.com/8.x/identicon/svg?seed=${randomSeed}`);
  };

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl glass-panel text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-3xl">
          🔒
        </div>
        <h2 className="text-2xl font-bold">Wallet Disconnected</h2>
        <p className="text-gray-400 text-sm">
          You need to connect an EVM wallet to deploy a governance space on-chain.
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl glass-panel text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-3xl">
          🔑
        </div>
        <h2 className="text-2xl font-bold">Verify Wallet Signature</h2>
        <p className="text-gray-400 text-sm">
          Please click the &quot;Verify Wallet&quot; button in the navigation bar to log in to the database backend.
        </p>
        <button
          onClick={login}
          className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white"
        >
          Verify Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Deploy a Governance Space</h1>
        <p className="text-gray-400">
          Configure and deploy a mini-DAO in under 2 minutes. This form creates an off-chain metadata record and deploys a custom governance contract on-chain.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 rounded-2xl glass-panel space-y-6 relative">
        {submitting && (
          <div className="absolute inset-0 rounded-2xl bg-black/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 text-center p-6">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-semibold text-white">{statusText}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Space Name</label>
            <input
              type="text"
              required
              placeholder="e.g. My Tech Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Space Slug</label>
            <input
              type="text"
              readOnly
              placeholder="auto-generated-slug"
              value={slug}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm bg-white/5 opacity-60 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm bg-[#06060c] cursor-pointer"
            >
              <option value="DAO">DAO</option>
              <option value="OSS">OSS Project</option>
              <option value="Club">College Club</option>
              <option value="Startup">Startup</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex justify-between">
              <span>Logo URL</span>
              <button
                type="button"
                onClick={handleRandomLogo}
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                Generate Logo
              </button>
            </label>
            <input
              type="text"
              placeholder="https://api.dicebear.com/..."
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Description</label>
          <textarea
            required
            rows={3}
            placeholder="A brief overview of your community goals, membership rules, or mission."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 rounded-xl glass-input text-sm"
          />
        </div>

        <div className="border-t border-[rgba(255,255,255,0.06)] pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex justify-between">
              <span>Quorum Threshold</span>
              <span className="font-semibold text-indigo-400">{quorumPercent}%</span>
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={quorumPercent}
              onChange={(e) => setQuorumPercent(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <p className="text-xs text-gray-400">
              The percentage of community members required to vote for a proposal to pass.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Voting Window</label>
            <select
              value={voteDurationHours}
              onChange={(e) => setVoteDurationHours(parseInt(e.target.value))}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm bg-[#06060c] cursor-pointer"
            >
              <option value="1">1 Hour (Demo/Test)</option>
              <option value="24">24 Hours (1 Day)</option>
              <option value="72">72 Hours (3 Days)</option>
              <option value="168">168 Hours (7 Days)</option>
            </select>
            <p className="text-xs text-gray-400">
              The time duration for which proposals will remain active for voting.
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.01] active:scale-95 transition-all duration-200"
        >
          Create Space & Deploy Contract
        </button>

        {statusText.startsWith("❌") && (
          <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
            {statusText}
          </div>
        )}
      </form>
    </div>
  );
}
