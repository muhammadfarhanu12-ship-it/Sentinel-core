import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "clean" | "blocked" | "warning" | "outline" | "secondary" | "destructive";
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-slate-800 text-slate-50 hover:bg-slate-700/80",
    clean: "bg-clean/10 text-clean border border-clean/20",
    blocked: "bg-blocked/10 text-blocked border border-blocked/20",
    warning: "bg-warning/10 text-warning border border-warning/20",
    outline: "text-slate-50 border border-slate-700",
    secondary: "bg-slate-800 text-slate-300 hover:bg-slate-700/80",
    destructive: "bg-red-900/50 text-red-400 border border-red-800/50",
  }

  return (
    <div className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2", variants[variant], className)} {...props} />
  )
}

export { Badge }
