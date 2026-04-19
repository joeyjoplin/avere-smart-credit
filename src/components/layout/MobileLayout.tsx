import { ReactNode } from "react";
import { motion } from "framer-motion";
import BottomNav from "./BottomNav";
import WalletBalanceBar from "./WalletBalanceBar";

interface MobileLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  showBalanceBar?: boolean;
  className?: string;
}

const MobileLayout = ({
  children,
  showNav = true,
  showBalanceBar = true,
  className = "",
}: MobileLayoutProps) => {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
        <span>Devnet demo</span>
        <span className="opacity-50">·</span>
        <span>Loan amounts capped at $10</span>
      </div>
      {showBalanceBar && <WalletBalanceBar />}
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`flex-1 overflow-y-auto no-scrollbar ${showNav ? "pb-36" : ""} ${className}`}
      >
        {children}
      </motion.main>
      {showNav && <BottomNav />}
    </div>
  );
};

export default MobileLayout;
