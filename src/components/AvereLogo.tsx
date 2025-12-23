import { motion, Transition, Easing } from "framer-motion";

interface AvereLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
}

const sizeMap = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
  xl: "h-24",
};

const AvereLogo = ({ size = "lg", animated = true }: AvereLogoProps) => {
  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.9 } : false}
      animate={animated ? { opacity: 1, scale: 1 } : false}
      transition={animated ? { duration: 0.5, ease: "easeOut" as const } : undefined}
      className="flex flex-col items-center gap-3"
    >
      {/* Logo Mark */}
      <div className={`relative ${sizeMap[size]} aspect-square`}>
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          {/* Background circle with gradient */}
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(155, 85%, 42%)" />
              <stop offset="100%" stopColor="hsl(160, 55%, 25%)" />
            </linearGradient>
            <linearGradient id="innerGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(155, 85%, 50%)" />
              <stop offset="100%" stopColor="hsl(155, 85%, 42%)" />
            </linearGradient>
          </defs>
          
          {/* Outer ring */}
          <circle
            cx="32"
            cy="32"
            r="30"
            stroke="url(#logoGradient)"
            strokeWidth="2.5"
            fill="none"
          />
          
          {/* Inner A shape */}
          <path
            d="M32 14L46 50H40L37 42H27L24 50H18L32 14Z"
            fill="url(#logoGradient)"
          />
          <path
            d="M32 24L36 38H28L32 24Z"
            fill="hsl(var(--background))"
          />
          
          {/* Accent dot */}
          <circle
            cx="32"
            cy="54"
            r="3"
            fill="url(#innerGradient)"
          />
        </svg>
      </div>
      
      {/* Wordmark */}
      <h1
        className={`font-display font-bold tracking-tight text-foreground ${
          size === "xl" ? "text-4xl" : size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl"
        }`}
      >
        Avere
      </h1>
    </motion.div>
  );
};

export default AvereLogo;
