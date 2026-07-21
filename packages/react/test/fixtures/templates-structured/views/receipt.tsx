import { ReceiptTotal } from "../components/ReceiptTotal";

interface ReceiptProps {
  total: number;
}

export function Body({ total }: ReceiptProps) {
  return <section className="receipt"><ReceiptTotal total={total} /></section>;
}
