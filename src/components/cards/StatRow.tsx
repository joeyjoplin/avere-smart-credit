interface StatRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  variant?: "default" | "light";
}

const StatRow = ({ label, value, highlight = false, variant = "default" }: StatRowProps) => {
  return (
    <div className="flex items-center justify-between py-2">
      <span
        className={`text-sm ${
          variant === "light" ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-financial text-lg font-semibold ${
          highlight
            ? "text-accent"
            : variant === "light"
            ? "text-primary-foreground"
            : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
};

export default StatRow;
