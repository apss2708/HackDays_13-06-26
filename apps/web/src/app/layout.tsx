import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";
import Navigation from "../components/Navigation";

export const metadata: Metadata = {
  title: "GovernanceOS | Plug-and-Play DAOs",
  description: "Spin up a mini-DAO in 2 minutes. On-chain voting, off-chain indexing, and AI-powered risk analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Navigation />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-[rgba(255,255,255,0.05)] bg-[#030307] py-6 text-center text-sm text-gray-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gradient-primary">GovernanceOS</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">v1.0 (Hack Days)</span>
              </div>
              <p>© {new Date().getFullYear()} GovernanceOS. Deployed locally for hackathon demo.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
