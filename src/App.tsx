import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "next-themes";
import DataExplorerPage from "./pages/DataExplorerPage";
import { useEffect, useState } from "react";
import { initCsrfToken } from "./lib/api/client";
import { restoreExplorerCache } from "./lib/persist";

function CacheHydrationGate({ children }: { children: React.ReactNode }) {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    restoreExplorerCache(queryClient).finally(() => {
      if (!cancelled) setCacheReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!cacheReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    initCsrfToken();
  }, []);

  return (
    <CacheHydrationGate>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          themes={["light", "dark", "dark-black", "blue-gray", "system"]}
        >
          <TooltipProvider>
            <AuthProvider>
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                  <Route path="/" element={<DataExplorerPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
              <Toaster />
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </CacheHydrationGate>
  );
}

