import { motion } from "framer-motion";
import { TrendingUp, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ScoreCardProps {
  score: number;
  delay?: number;
}

const getScoreLevel = (score: number): { label: string; color: string; position: number } => {
  if (score < 500) return { label: "Low", color: "bg-destructive", position: 25 };
  if (score < 700) return { label: "Medium", color: "bg-amber-500", position: 50 };
  return { label: "High", color: "bg-accent", position: 85 };
};

const ScoreCard = ({ score, delay = 0 }: ScoreCardProps) => {
  const navigate = useNavigate();
  const { label, color, position } = getScoreLevel(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="rounded-2xl bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-avere-100">
            <TrendingUp className="h-4 w-4 text-avere-600" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Score</h3>
        </div>
        <div className={`rounded-full px-2.5 py-1 ${color}`}>
          <span className="text-xs font-semibold text-white">{label}</span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-financial text-4xl font-bold text-foreground">{score}</span>
        <span className="text-sm text-muted-foreground">/ 850</span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-avere-100">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(score / 850) * 100}%` }}
            transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-accent"
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>300</span>
          <span>575</span>
          <span>850</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Your score represents your capacity to access loans and better interest rates.
      </p>

      {/* Earn hint */}
      <button
        onClick={() => navigate("/earn")}
        className="mt-3 flex w-full items-center justify-between rounded-xl bg-avere-50 p-3 transition-colors hover:bg-avere-100"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-avere-600" />
          <span className="text-xs font-medium text-foreground">
            Increase your score by staking or providing liquidity
          </span>
        </div>
        <span className="text-xs font-semibold text-accent">Earn →</span>
      </button>
    </motion.div>
  );
};

export default ScoreCard;
