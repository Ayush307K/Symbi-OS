"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { MarketplaceAssistant } from "@/components/assistant/MarketplaceAssistant";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
        <MarketplaceAssistant />
      </ToastProvider>
    </AuthProvider>
  );
}
