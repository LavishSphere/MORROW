import type { SVGProps } from "react";
import blueMarkUrl from "./morrow-logo-blue.png";
import whiteMarkUrl from "./morrow-logo-white.png";

export type LogoMarkProps = {
  /** Accessible name when the mark is not decorative. */
  title?: string;
  /**
   * Hide the mark from assistive tech. The opening uses this because the
   * wordmark next to it already says MORROW.
   */
  decorative?: boolean;
  /** Blue is the default mark. White is the same drawing in #FFFFFF. */
  tone?: "blue" | "white";
} & Omit<SVGProps<SVGSVGElement>, "title">;

/**
 * The MORROW mark, taken from the logo PNG so the shape matches the file.
 * Blue is for the logo and pins. White is available when the mark sits on blue.
 */
export function LogoMark({
  title = "MORROW",
  decorative = false,
  tone = "blue",
  className,
  ...rest
}: LogoMarkProps) {
  const classes = ["morrow-mark", className].filter(Boolean).join(" ");
  const src = tone === "white" ? whiteMarkUrl : blueMarkUrl;

  return (
    <svg
      viewBox="0 0 2400 2400"
      className={classes}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      {...rest}
    >
      {decorative ? null : <title>{title}</title>}
      <image href={src} width="2400" height="2400" />
    </svg>
  );
}
