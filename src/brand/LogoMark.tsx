import type { ImgHTMLAttributes } from "react";
import blueMark from "./morrow-logo-blue.png";
import whiteMark from "./morrow-logo-white.png";

export type LogoTone = "blue" | "white";

export type LogoMarkProps = {
  /** Accessible name when the mark is not decorative. */
  title?: string;
  /**
   * Hide the mark from assistive tech. The opening uses this because the
   * wordmark next to it already says MORROW.
   */
  decorative?: boolean;
  /**
   * `blue` is the brand mark. `white` is the same shape for a light lockup.
   */
  tone?: LogoTone;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;

const MARK_SRC: Record<LogoTone, string> = {
  blue: blueMark,
  white: whiteMark,
};

/**
 * The MORROW mark is the supplied logo shape. It is not redrawn.
 */
export function LogoMark({
  title = "MORROW",
  decorative = false,
  tone = "blue",
  className,
  ...rest
}: LogoMarkProps) {
  const classes = ["morrow-mark", className].filter(Boolean).join(" ");

  return (
    <img
      src={MARK_SRC[tone]}
      alt={decorative ? "" : title}
      className={classes}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
      {...rest}
    />
  );
}
