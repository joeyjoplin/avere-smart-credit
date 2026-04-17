import { Coins, Loader2 } from "lucide-react";
import { useWalletBalance } from "@/hooks/useWalletBalance";

const fmt = (v: number, decimals = 2) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function WalletBalanceBar() {
  const { data, isLoading } = useWalletBalance();

  return (
    <div className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Coins className="h-3.5 w-3.5" />
        <span>Wallet</span>
      </div>

      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">USDC</span>
            <span className="text-xs font-semibold tabular-nums">
              ${fmt(data?.usdcDisplay ?? 0)}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">SOL</span>
            <span className="text-xs font-semibold tabular-nums">
              {fmt(data?.solDisplay ?? 0, 3)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
