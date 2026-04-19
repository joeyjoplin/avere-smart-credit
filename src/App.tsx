import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import SolanaWalletProvider from "@/contexts/WalletProvider";
import Index from "./pages/Index";
import HomeScreen from "./pages/HomeScreen";
import Dashboard from "./pages/Dashboard";
import LoanFlow from "./pages/LoanFlow";
import Earn from "./pages/Earn";
import Payments from "./pages/Payments";
import DepositScreen from "./pages/DepositScreen";
import Onboarding from "./pages/Onboarding";
import Connect from "./pages/Connect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** Redirects to /home if no wallet is connected. */
function RequireWallet({ children }: { children: React.ReactNode }) {
  const { connected } = useWallet();
  if (!connected) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SolanaWalletProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/home" element={<HomeScreen />} />
            <Route path="/onboarding" element={<RequireWallet><Onboarding /></RequireWallet>} />
            <Route path="/deposit" element={<RequireWallet><DepositScreen /></RequireWallet>} />
            <Route path="/dashboard" element={<RequireWallet><Dashboard /></RequireWallet>} />
            <Route path="/loan" element={<RequireWallet><LoanFlow /></RequireWallet>} />
            <Route path="/earn" element={<RequireWallet><Earn /></RequireWallet>} />
            <Route path="/payments" element={<RequireWallet><Payments /></RequireWallet>} />
            <Route path="/connect" element={<RequireWallet><Connect /></RequireWallet>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </SolanaWalletProvider>
  </QueryClientProvider>
);

export default App;
