"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  category: string;
  governanceTemplate: string;
  contractAddress: string | null;
  _count: {
    memberships: number;
    proposals: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const { data: communities, isLoading, error } = useQuery<Community[]>({
    queryKey: ["communities"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/communities`);
      if (!res.ok) throw new Error("Failed to load communities");
      return res.json();
    },
  });

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative py-20 px-8 rounded-3xl overflow-hidden glass-panel flex flex-col md:flex-row items-center gap-12 bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-indigo-900/10">
        <div className="absolute top-0 right-0 -w-96 -h-96 bg-indigo-500/10 rounded-full filter blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 -w-96 -h-96 bg-fuchsia-500/10 rounded-full filter blur-[100px] pointer-events-none" />
        
        <div className="flex-1 space-y-6 text-center md:text-left">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            ⚡ Live on Local Network (Hardhat)
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-none">
            Plug-and-Play <br />
            <span className="text-gradient-primary">Governance OS</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-xl">
            Create, deploy, and govern your community in minutes. On-chain transparency combined with automated AI summaries and risk flags for every proposal.
          </p>
          <div className="flex flex-wrap gap-4 justify-center md:justify-start">
            <Link
              href="/create-space"
              className="px-6 py-3.5 rounded-xl font-bold bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/45 hover:scale-[1.02] active:scale-95 transition-all duration-200"
            >
              Deploy Space
            </Link>
            <a
              href="#explore"
              className="px-6 py-3.5 rounded-xl font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all duration-200"
            >
              Explore Spaces
            </a>
          </div>
        </div>

        <div className="flex-1 w-full max-w-md p-6 rounded-2xl glass-panel-glow flex flex-col gap-6 relative">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-4">
            <span className="font-bold text-gray-200">Active Proposals AI Analysis</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">AI Demo</span>
          </div>
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-white/5 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400">
                <span>Space: Dev DAO</span>
                <span className="text-indigo-400 font-semibold">Passed</span>
              </div>
              <p className="text-sm font-semibold">Allocate $50,000 to Layer 2 Research</p>
              <div className="p-2.5 rounded bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-300">
                🤖 <strong>AI Summary:</strong> Requests 50k USDC allocation for a 3-month research sprint building developer toolchains on Layer 2 (Base/Arbitrum).
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white/5 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400">
                <span>Space: OSS DAO</span>
                <span className="text-emerald-400 font-semibold">Active</span>
              </div>
              <p className="text-sm font-semibold">Migrate from Jest to Vitest</p>
              <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20 text-xs text-rose-300">
                ⚠️ <strong>AI Risk:</strong> Contains core architectural changes. High consensus required (60%+). Low turnout might compromise quorum.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Board */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl glass-panel text-center space-y-2">
          <p className="text-sm font-medium text-gray-400">Governance Spaces</p>
          <p className="text-3xl font-extrabold text-gradient-primary">
            {isLoading ? "..." : communities?.length || 0}
          </p>
        </div>
        <div className="p-6 rounded-2xl glass-panel text-center space-y-2">
          <p className="text-sm font-medium text-gray-400">Total Proposals Run</p>
          <p className="text-3xl font-extrabold text-gradient-accent">
            {isLoading ? "..." : communities?.reduce((acc, c) => acc + c._count.proposals, 0) || 0}
          </p>
        </div>
        <div className="p-6 rounded-2xl glass-panel text-center space-y-2">
          <p className="text-sm font-medium text-gray-400">AI Analyses Generated</p>
          <p className="text-3xl font-extrabold text-emerald-400">
            {isLoading ? "..." : communities?.reduce((acc, c) => acc + c._count.proposals, 0) || 0}
          </p>
        </div>
      </section>

      {/* Spaces Listing */}
      <section id="explore" className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">Explore Ecosystems</h2>
          <span className="text-sm text-gray-400">Showing all registered spaces</span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 rounded-2xl glass-panel animate-pulse bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center text-rose-400">
            Error loading spaces. Please ensure the API backend is running.
          </div>
        ) : communities?.length === 0 ? (
          <div className="p-12 rounded-2xl glass-panel text-center text-gray-400">
            No spaces found. Click &quot;Deploy Space&quot; above to create the first one!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {communities?.map((community) => (
              <Link
                key={community.id}
                href={`/dao/${community.slug}`}
                className="p-6 rounded-2xl glass-panel flex flex-col justify-between gap-6 hover:scale-[1.01] hover:-translate-y-1 transition-all"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 overflow-hidden flex items-center justify-center border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={community.logoUrl || `https://api.dicebear.com/8.x/identicon/svg?seed=${community.slug}`}
                        alt={community.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white/5 text-gray-300 border border-white/10 uppercase">
                      {community.category}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white leading-snug">{community.name}</h3>
                    <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">
                      {community.description || "No description provided."}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 flex justify-between items-center text-xs">
                  <div className="flex gap-4 text-gray-400">
                    <div>
                      <span className="font-bold text-white">{community._count.memberships}</span> Members
                    </div>
                    <div>
                      <span className="font-bold text-white">{community._count.proposals}</span> Proposals
                    </div>
                  </div>
                  {community.contractAddress ? (
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                      On-Chain
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                      Off-Chain Only
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
