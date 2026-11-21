import "./pins.css";

export type MorrowMarkProps = {
  className?: string;
};

/** The MORROW wordmark. Logo blue, and the only blue text in this overlay. */
export function MorrowMark({ className }: MorrowMarkProps) {
  const classes = ["satellite-pins__mark", className].filter(Boolean).join(" ");
  return <p className={classes}>MORROW</p>;
}
