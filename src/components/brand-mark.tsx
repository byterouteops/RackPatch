import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  /** Navy mark for dark chrome; cyan mark for light headers */
  variant?: "dark" | "light";
};

export function BrandMark({ className, size = 28, variant = "dark" }: BrandMarkProps) {
  const src = variant === "light" ? "/rackpatch-mark-light.svg" : "/rackpatch-mark.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG brand mark from /public
    <img
      src={src}
      alt="RackPatch"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[2px]", className)}
    />
  );
}
