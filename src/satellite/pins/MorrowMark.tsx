import blueMarkUrl from "../../brand/morrow-logo-blue.png";
import "./pins.css";

export type MorrowMarkProps = {
  className?: string;
};

/** Blue mark plus the word MORROW in white. */
export function MorrowMark({ className }: MorrowMarkProps) {
  const classes = ["satellite-pins__mark", className].filter(Boolean).join(" ");
  return (
    <p className={classes}>
      <img src={blueMarkUrl} alt="" />
      <span>MORROW</span>
    </p>
  );
}
