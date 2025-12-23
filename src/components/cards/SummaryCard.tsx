import { motion } from "framer-motion";
import { ReactNode } from "react";

interface SummaryCardProps {
  title: string;
  children: ReactNode;
  variant?: "default" | "primary" | "accent";
  delay?: number;
}

const variantStyles = {
  default: "bg-card",
  primary: "bg-gradient-primary text-primary-foreground",
  accent: "bg-avere-50 border border-avere-200",
};

const SummaryCard = ({ title, children, variant = "default", delay = 0 }: SummaryCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`rounded-2xl p-5 shadow-card ${variantStyles[variant]}`}
    >
      <h3
        className={`mb-3 text-sm font-medium ${
          variant === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {title}
      </h3>
      {children}
    </motion.div>
  );
};

export default SummaryCard;
