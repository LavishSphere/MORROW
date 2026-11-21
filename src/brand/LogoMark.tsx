import type { SVGProps } from "react";
import { LOGO_BLUE } from "./palette";
import { LOGO_STROKES } from "./logoPaths";

export type LogoMarkProps = {
  /** Accessible name when the mark is not decorative. */
  title?: string;
  /**
   * Hide the mark from assistive tech. The opening uses this because the
   * wordmark next to it already says MORROW.
   */
  decorative?: boolean;
} & Omit<SVGProps<SVGSVGElement>, "title">;

/**
 * The MORROW mark: three rounded strokes. Each stroke carries
 * `morrow-stroke` so the opening can fly them in one at a time.
 */
export function LogoMark({
  title = "MORROW",
  decorative = false,
  className,
  ...rest
}: LogoMarkProps) {
  const classes = ["morrow-mark", className].filter(Boolean).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      className={classes}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      {...rest}
    >
      {decorative ? null : <title>{title}</title>}
      {LOGO_STROKES.map((d, index) => (
        <path
          key={d}
          className={`morrow-stroke morrow-stroke-${index + 1}`}
          d={d}
          fill={LOGO_BLUE}
          stroke={LOGO_BLUE}
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
