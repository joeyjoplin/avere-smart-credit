import { motion } from "framer-motion";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AvereLogo from "@/components/AvereLogo";

const HomeScreen = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    // Mock login - navigate to dashboard
    navigate("/dashboard");
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-surface px-8">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-96 w-96 rounded-full bg-avere-200/30 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-96 w-96 rounded-full bg-avere-100/40 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo */}
        <AvereLogo size="xl" animated />

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 max-w-[280px] text-center text-lg text-muted-foreground"
        >
          Smart credit powered by decentralized finance
        </motion.p>

        {/* Login Button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-12 w-full max-w-[280px]"
        >
          <Button
            variant="passkey"
            size="xl"
            className="w-full"
            onClick={handleLogin}
          >
            <Fingerprint className="mr-2 h-6 w-6" />
            Login with Passkey
          </Button>
        </motion.div>

        {/* Helper text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ShieldCheck className="h-4 w-4 text-accent" />
          <span>No passwords. Secure by design.</span>
        </motion.div>
      </div>

      {/* Bottom decoration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-avere-300"
              style={{ opacity: 0.4 + i * 0.3 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default HomeScreen;
