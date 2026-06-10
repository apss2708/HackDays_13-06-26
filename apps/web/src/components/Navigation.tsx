"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "../app/providers";
import { useAccount } from "wagmi";

export default function Navigation() {
  const { isConnected } = useAccount();
  const { login, token, isAuthenticated, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[rgba(255,255,255,0.06)] bg-[#06060c]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              G
            </div>
            <span className="font-bold text-xl tracking-tight text-white">
              Governance<span className="text-indigo-400">OS</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-300">
            <Link href="/" className="hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/create-space" className="hover:text-white transition-colors">
              Create Space
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <ConnectButton chainStatus="icon" showBalance={false} />
          {isConnected && (
            <>
              {!isAuthenticated ? (
                <button
                  onClick={login}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:from-indigo-600 hover:to-purple-700 hover:shadow-indigo-500/10 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify Wallet"}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-semibold">
                    Authenticated
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
