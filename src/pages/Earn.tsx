import { motion } from "framer-motion";
import { Coins, Droplets, Wallet, TrendingUp, Info } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// Mock data
const stakingAssets = [
  { symbol: "SOL", name: "Solana", balance: 12.5, apy: 8.2, icon: "◎" },
  { symbol: "ETH", name: "Ethereum", balance: 0.85, apy: 5.5, icon: "Ξ" },
];

const liquidityData = {
  poolBalance: 5000,
  estimatedApy: 12.5,
  walletBalance: 2500,
};

const userScore = 720;

const Earn = () => {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [liquidityAmount, setLiquidityAmount] = useState("");

  return (
    <MobileLayout>
      <div className="px-5 pt-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <p className="text-sm text-muted-foreground">Grow your wealth</p>
          <h1 className="text-2xl font-bold text-foreground">Earn & Build Score</h1>
        </motion.div>

        {/* Current Score Mini Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-6 flex items-center justify-between rounded-2xl bg-gradient-primary p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/20">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-primary-foreground/70">Current Score</p>
              <p className="font-financial text-2xl font-bold text-primary-foreground">{userScore}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-foreground/70">Status</p>
            <p className="text-sm font-semibold text-primary-foreground">High</p>
          </div>
        </motion.div>

        {/* Section 1: Staking */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Stake to Increase Score</h2>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="mb-4 text-sm text-muted-foreground">
              Stake crypto assets to increase your credit score and unlock better loan terms.
            </p>

            {/* Asset Selection */}
            <div className="space-y-3">
              {stakingAssets.map((asset) => (
                <button
                  key={asset.symbol}
                  onClick={() => setSelectedAsset(selectedAsset === asset.symbol ? null : asset.symbol)}
                  className={`flex w-full items-center justify-between rounded-xl p-4 transition-all ${
                    selectedAsset === asset.symbol
                      ? "border-2 border-accent bg-avere-50"
                      : "border border-border bg-secondary/50 hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-avere-100 text-lg font-bold text-avere-600">
                      {asset.icon}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-foreground">{asset.symbol}</p>
                      <p className="text-xs text-muted-foreground">{asset.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-financial font-semibold text-foreground">
                      {asset.balance} {asset.symbol}
                    </p>
                    <p className="text-xs text-accent">{asset.apy}% APY</p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              variant="accent"
              size="lg"
              className="mt-4 w-full"
              disabled={!selectedAsset}
            >
              <Wallet className="mr-2 h-4 w-4" />
              Stake tokens
            </Button>

            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              Staked assets positively impact your score.
            </p>
          </div>
        </motion.div>

        {/* Section 2: Provide Liquidity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <Droplets className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Provide Liquidity</h2>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="mb-4 text-sm text-muted-foreground">
              Deposit stablecoins into the Avere pool to earn yield and increase your score.
            </p>

            {/* Pool Stats */}
            <div className="mb-4 flex gap-3">
              <div className="flex-1 rounded-xl bg-avere-50 p-3">
                <p className="text-xs text-muted-foreground">Pool Balance</p>
                <p className="font-financial text-lg font-bold text-foreground">
                  ${liquidityData.poolBalance.toLocaleString()}
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-avere-50 p-3">
                <p className="text-xs text-muted-foreground">Estimated APY</p>
                <p className="font-financial text-lg font-bold text-accent">
                  {liquidityData.estimatedApy}%
                </p>
              </div>
            </div>

            {/* Deposit Input */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-foreground">
                Deposit Amount (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  value={liquidityAmount}
                  onChange={(e) => setLiquidityAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-border bg-secondary/50 py-3 pl-8 pr-20 font-financial text-lg text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  onClick={() => setLiquidityAmount(liquidityData.walletBalance.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-avere-100 px-2 py-1 text-xs font-medium text-avere-700 transition-colors hover:bg-avere-200"
                >
                  MAX
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Available: ${liquidityData.walletBalance.toLocaleString()} USDC
              </p>
            </div>

            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={!liquidityAmount || Number(liquidityAmount) <= 0}
            >
              <Droplets className="mr-2 h-4 w-4" />
              Provide liquidity
            </Button>

            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              Liquidity providers earn yield and improve credit capacity.
            </p>
          </div>
        </motion.div>

        {/* Bottom spacing for nav */}
        <div className="h-8" />
      </div>
    </MobileLayout>
  );
};

export default Earn;
