import { LogoMark } from "../../brand/LogoMark";
import "./pins.css";

export type MorrowMarkProps = {
  className?: string;
};

/** Blue logo shape plus the white MORROW word. */
export function MorrowMark({ className }: MorrowMarkProps) {
  const classes = ["satellite-pins__mark", className].filter(Boolean).join(" ");
  return (
    <p className={classes}>
      <LogoMark decorative className="satellite-pins__mark-shape" />
      <span>MORROW</span>
    </p>
  );
}
