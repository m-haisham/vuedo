interface ReceiptTotalProps {
  total: number;
}

export function ReceiptTotal({ total }: ReceiptTotalProps) {
  const formatted = total.toFixed(2);
  return (
    <span className={`total${total > 100 ? " bold" : ""}`}>
      ${formatted}
    </span>
  );
}
