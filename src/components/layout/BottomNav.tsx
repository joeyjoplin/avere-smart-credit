import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Wallet, TrendingUp, CreditCard, Link2 } from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/loan", icon: Wallet, label: "Loan" },
  { path: "/payments", icon: CreditCard, label: "Payments" },
  { path: "/earn", icon: TrendingUp, label: "Earn" },
  { path: "/connect", icon: Link2, label: "Connect" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg pb-safe">
      <div className="flex h-16 items-center justify-around px-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-0.5 px-2 py-2 min-w-0"
            >
              <div className="relative">
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute -inset-1.5 rounded-xl bg-accent/15"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon
                  className={`relative h-5 w-5 transition-colors duration-200 ${
                    isActive ? "text-accent" : "text-muted-foreground"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 leading-tight ${
                  isActive ? "text-accent" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
