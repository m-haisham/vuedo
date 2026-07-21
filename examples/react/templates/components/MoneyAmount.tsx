interface MoneyAmountProps {
  amount: number;
  bold?: boolean;
  className?: string;
}

export function MoneyAmount({ amount, bold, className }: MoneyAmountProps) {
  const formatted = "$" + amount.toFixed(2);
  const cls = [bold ? "font-semibold" : "", "tabular-nums", className]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{formatted}</span>;
}
