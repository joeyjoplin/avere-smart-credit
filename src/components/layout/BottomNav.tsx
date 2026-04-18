import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Wallet, TrendingUp, CreditCard } from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/loan", icon: Wallet, label: "Loan" },
  { path: "/payments", icon: CreditCard, label: "Payments" },
  { path: "/earn", icon: TrendingUp, label: "Earn" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg pb-safe">
      <div className="flex h-20 items-center justify-around px-6">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-1 px-4 py-2"
            >
              <div className="relative">
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute -inset-2 rounded-xl bg-accent/15"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon
                  className={`relative h-6 w-6 transition-colors duration-200 ${
                    isActive ? "text-accent" : "text-muted-foreground"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-200 ${
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
