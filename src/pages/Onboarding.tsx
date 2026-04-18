import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AvereLogoImg from "@/resources/Green avere_3.png";

const slides = [
  {
    id: "score",
    tag: "Credit Score",
    headline: "Your Solana credit score",
    sub: "Earned on-chain. Portable across every protocol. Yours forever.",
    visual: (
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-avere-400 to-avere-600 shadow-elevated">
          <span className="font-financial text-4xl font-bold text-white">725</span>
        </div>
        <div className="rounded-full bg-accent/15 px-3 py-1">
          <span className="text-sm font-semibold text-accent">Tier B · Good</span>
        </div>
      </div>
    ),
  },
  {
    id: "gig",
    tag: "Built for gig workers",
    headline: "Your income counts here",
    sub: "Uber, DoorDash, Upwork, Fiverr — verified gig income earns you real credit. No W-2 required.",
    visual: (
      <div className="w-full space-y-3">
        {[
          { name: "Maria G.", role: "Uber · DoorDash", income: "$3,200/mo", score: "810 · Tier A", color: "bg-green-500/15 text-green-600" },
          { name: "James T.", role: "Upwork · Freelancer", income: "$2,400/mo", score: "680 · Tier B", color: "bg-accent/15 text-accent" },
          { name: "Sofia R.", role: "Fiverr · DoorDash", income: "$1,800/mo", score: "512 · Tier C", color: "bg-orange-500/15 text-orange-500" },
        ].map((p) => (
          <div key={p.name} className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.role}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-foreground">{p.income}</p>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${p.color}`}>{p.score}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "repay",
    tag: "Repayment",
    headline: "Pay on time, earn better rates",
    sub: "Every on-time payment improves your score and unlocks lower rates on your next loan.",
    visual: (
      <div className="w-full space-y-2">
        {[
          { label: "Month 1", amount: "$633", status: "✓ paid", color: "text-accent" },
          { label: "Month 2", amount: "$633", status: "+20 pts", color: "text-accent" },
          { label: "Month 3", amount: "$633", status: "upcoming", color: "text-muted-foreground" },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
            <span className="font-financial font-semibold text-foreground">{item.amount}</span>
            <span className={`text-xs font-semibold ${item.color}`}>{item.status}</span>
          </div>
        ))}
      </div>
    ),
  },
];

const variants = {
  enter: (d: number) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
};

const Onboarding = () => {
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const [direction, setDirection] = useState(1);

  const current = slides[slide];
  const isLast = slide === slides.length - 1;

  const goNext = () => {
    if (isLast) {
      navigate("/dashboard");
      return;
    }
    setDirection(1);
    setSlide((s) => s + 1);
  };

  const goPrev = () => {
    setDirection(-1);
    setSlide((s) => Math.max(s - 1, 0));
  };

  return (
    <div className="flex h-full flex-col items-center bg-gradient-surface px-6 overflow-y-auto">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-96 w-96 rounded-full bg-avere-200/30 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-96 w-96 rounded-full bg-avere-100/40 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center pt-10 pb-8">
        {/* Small logo */}
        <motion.img
          src={AvereLogoImg}
          alt="Avere"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-10 w-auto mb-6"
        />

        {/* Skip */}
        <div className="absolute right-0 top-10">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            Skip
          </button>
        </div>

        {/* Slide card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur-sm">
            {/* Tag + counter */}
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                {current.tag}
              </span>
              <span className="text-xs text-muted-foreground">{slide + 1} / {slides.length}</span>
            </div>

            {/* Animated content */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current.id}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <div className="mb-5 flex justify-center">{current.visual}</div>
                <h2 className="text-xl font-bold text-foreground">{current.headline}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{current.sub}</p>
              </motion.div>
            </AnimatePresence>

            {/* Nav */}
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={slide === 0}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <div className="flex gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setDirection(i > slide ? 1 : -1); setSlide(i); }}
                    className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-accent" : "w-1.5 bg-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <button
                onClick={goNext}
                disabled={false}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* CTA — only on last slide */}
        <AnimatePresence>
          {isLast && (
            <motion.div
              key="cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.3 }}
              className="mt-6 w-full"
            >
              <Button
                variant="passkey"
                size="xl"
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowRight className="mr-2 h-5 w-5" /> Get Started
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
