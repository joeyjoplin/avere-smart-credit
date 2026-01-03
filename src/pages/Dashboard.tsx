import { motion } from "framer-motion";
import { Calendar, TrendingUp, AlertCircle } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import SummaryCard from "@/components/cards/SummaryCard";
import StatRow from "@/components/cards/StatRow";
import ScoreCard from "@/components/cards/ScoreCard";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// Mock data
const loanData = {
  totalBorrowed: 15000.0,
  accumulatedInterest: 342.56,
  totalToPay: 15342.56,
  nextInstallment: {
    dueInDays: 12,
    amount: 1278.55,
  },
  installmentsPaid: 3,
  totalInstallments: 12,
};

const userScore = 720;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
};

const Dashboard = () => {
  const navigate = useNavigate();

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
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-2xl font-bold text-foreground">Your Loan Overview</h1>
        </motion.div>

        {/* Credit Score Card */}
        <div className="mb-4">
          <ScoreCard score={userScore} delay={0.05} />
        </div>

        {/* Main Summary Card */}
        <SummaryCard title="Loan Summary" variant="primary" delay={0.1}>
          <div className="space-y-1">
            <StatRow
              label="Total Borrowed"
              value={formatCurrency(loanData.totalBorrowed)}
              variant="light"
            />
            <StatRow
              label="Accumulated Interest"
              value={formatCurrency(loanData.accumulatedInterest)}
              variant="light"
            />
            <div className="my-3 h-px bg-primary-foreground/20" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-primary-foreground/80">
                Total to Pay
              </span>
              <span className="font-financial text-2xl font-bold text-primary-foreground">
                {formatCurrency(loanData.totalToPay)}
              </span>
            </div>
          </div>
        </SummaryCard>

        {/* Next Installment Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4"
        >
          <div className="rounded-2xl border border-avere-200 bg-avere-50 p-5 shadow-soft">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Next Installment</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-financial text-3xl font-bold text-foreground">
                    {formatCurrency(loanData.nextInstallment.amount)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-accent/15 px-3 py-1.5">
                <span className="text-sm font-semibold text-accent">
                  Due in {loanData.nextInstallment.dueInDays} days
                </span>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>Installments paid</span>
                <span className="font-medium">
                  {loanData.installmentsPaid} of {loanData.totalInstallments}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-avere-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(loanData.installmentsPaid / loanData.totalInstallments) * 100}%`,
                  }}
                  transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-accent"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Interest Rate Info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 shadow-soft"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-avere-100">
            <TrendingUp className="h-5 w-5 text-avere-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Interest Rate</p>
            <p className="text-xs text-muted-foreground">Fixed annual rate</p>
          </div>
          <span className="font-financial text-xl font-bold text-accent">5.9%</span>
        </motion.div>

        {/* Payment Button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-6"
        >
          <Button variant="accent" size="lg" className="w-full">
            Make Payment
          </Button>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-6 flex gap-3"
        >
          <button
            onClick={() => navigate("/loan")}
            className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium text-foreground">New Loan</p>
            <p className="text-xs text-muted-foreground">Get more credit</p>
          </button>
          <button className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md">
            <p className="text-sm font-medium text-foreground">History</p>
            <p className="text-xs text-muted-foreground">View transactions</p>
          </button>
        </motion.div>

        {/* Tip Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mb-8 mt-6 flex items-start gap-3 rounded-xl bg-avere-50 p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-avere-600" />
          <div>
            <p className="text-sm font-medium text-foreground">Pro tip</p>
            <p className="text-xs text-muted-foreground">
              Use stablecoin as collateral to reduce your interest rate by up to 2%.
            </p>
          </div>
        </motion.div>
      </div>
    </MobileLayout>
  );
};

export default Dashboard;
