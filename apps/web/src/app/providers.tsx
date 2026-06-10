"use client";

import * as React from "react";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, http, useAccount, useSignMessage } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

// Create RainbowKit config
const config = getDefaultConfig({
  appName: "GovernanceOS",
  projectId: "99e19d7d13c79be582ee17c093a1cfbb", // Demo Project ID
  chains: [hardhat, sepolia],
  ssr: true,
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

// Auth Context
interface AuthContextType {
  token: string | null;
  user: { id: string; walletAddress: string; displayName: string | null } | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Load token on startup
  React.useEffect(() => {
    const savedToken = localStorage.getItem("gov_os_token");
    const savedUser = localStorage.getItem("gov_os_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // Handle wallet disconnection
  React.useEffect(() => {
    if (!isConnected) {
      logout();
    }
  }, [isConnected]);

  const logout = () => {
    localStorage.removeItem("gov_os_token");
    localStorage.removeItem("gov_os_user");
    setToken(null);
    setUser(null);
  };

  const login = async () => {
    if (!address) return;
    try {
      setLoading(true);
      // 1. Fetch nonce
      const nonceRes = await fetch(`${API_URL}/auth/nonce?address=${address}`);
      const { nonce } = await nonceRes.json();

      // 2. Sign message
      const signature = await signMessageAsync({ message: nonce });

      // 3. Verify signature
      const verifyRes = await fetch(`${API_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });

      if (!verifyRes.ok) {
        throw new Error("Authentication failed");
      }

      const data = await verifyRes.json();
      localStorage.setItem("gov_os_token", data.token);
      localStorage.setItem("gov_os_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      console.error("Login error:", err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#6366f1",
            accentColorForeground: "white",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
        >
          <AuthProviderInner>{children}</AuthProviderInner>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
