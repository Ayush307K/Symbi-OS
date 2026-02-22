"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, Recycle } from "lucide-react";
import type { AuthUser } from "@/lib/types";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface RegisterData {
  email: string;
  password: string;
  companyName: string;
  industry?: string;
  role?: "BUYER" | "SELLER";
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const AUTH_PAGES = ["/login", "/register"];

// ---------------------------------------------------------------------------
//  Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Check auth state on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
          }
        }
      } catch {
        // Network error — treat as unauthenticated
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Client-side redirect logic
  useEffect(() => {
    if (isLoading) return;

    const onAuthPage = AUTH_PAGES.includes(pathname);

    if (!user && !onAuthPage) {
      router.replace("/register");
    } else if (user && onAuthPage) {
      router.replace("/");
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Login failed.");
          return;
        }
        setUser(data.user);
        router.replace("/");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const register = useCallback(
    async (regData: RegisterData) => {
      setError(null);
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regData),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Registration failed.");
          return;
        }
        setUser(data.user);
        router.replace("/");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore — clear local state regardless
    }
    setUser(null);
    router.replace("/register");
  }, [router]);

  // Full-screen loading state (prevents flash)
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <Recycle size={24} className="text-emerald-400" />
          </div>
          <Loader2 size={20} className="animate-spin text-emerald-400" />
          <span className="text-sm text-zinc-500">Loading Symbi-OS…</span>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
//  Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
