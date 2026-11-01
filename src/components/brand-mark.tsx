// kaupet_open: ordmerket «kaupet_open».
import { House } from "lucide-react";
import { cn } from "@/lib/utils";

export const BRAND_NAME = "kaupet_open";

const SIZES = {
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "5xl": "text-5xl",
} as const;

export function BrandWordmark({
  size,
  bold = false,
  className,
}: {
  size: keyof typeof SIZES;
  bold?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-baseline font-display tracking-tight",
        SIZES[size],
        bold ? "font-bold" : "font-semibold",
        className,
      )}
    >
      <span className="text-primary">kaupet</span>
      <span className="text-brand">_</span>
      <span className={cn("text-muted-foreground", !bold && "font-normal")}>open</span>
    </span>
  );
}

export function BrandIcon({ className }: { className?: string }) {
  return <House aria-hidden className={cn("text-primary", className)} />;
}
