import { ReactNode } from "react";
import { motion } from "framer-motion";
import BottomNav from "./BottomNav";

interface MobileLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  className?: string;
}

const MobileLayout = ({ children, showNav = true, className = "" }: MobileLayoutProps) => {
  return (
    <div className="relative mx-auto h-full w-full max-w-[430px] overflow-hidden bg-background">
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`h-full overflow-y-auto no-scrollbar ${showNav ? "pb-24" : ""} ${className}`}
      >
        {children}
      </motion.main>
      {showNav && <BottomNav />}
    </div>
  );
};

export default MobileLayout;
