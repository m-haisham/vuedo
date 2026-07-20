import { useMemo } from "react";

interface PosBodyProps {
  items: { name: string; qty: number; price: number }[];
  tax: number;
  total: number;
  paymentMethod: string;
}

function formatMoney(amount: number): string {
  return "$" + amount.toFixed(2);
}

export function Body({ items, tax, total, paymentMethod }: PosBodyProps) {
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.qty, 0),
    [items],
  );

  return (
    <section className="pos-body font-mono text-sm">
      <div className="divide-y divide-dashed divide-slate-300">
        {items.map((item, i) => (
          <div key={i} className="py-1">
            <div className="flex justify-between">
              <span>{item.name}</span>
              <span>{formatMoney(item.price * item.qty)}</span>
            </div>
            <div className="text-xs text-slate-500">
              {item.qty} × {formatMoney(item.price)}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t-2 border-dashed border-slate-800 mt-2 pt-2 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatMoney(tax)}</span>
        </div>
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Paid via</span>
          <span>{paymentMethod}</span>
        </div>
      </div>
    </section>
  );
}

interface PosHeaderProps {
  store: string;
  address: string;
  orderNumber: string;
  date: string;
  cashier: string;
}

export function Header({
  store,
  address,
  orderNumber,
  date,
  cashier,
}: PosHeaderProps) {
  return (
    <header className="pos-header text-center border-b-2 border-dashed border-slate-800 pt-2 pb-2 mb-2">
      <div className="text-lg font-bold tracking-wide">{store}</div>
      <div className="text-xs">{address}</div>
      <div className="text-sm font-semibold mt-1">ORDER RECEIPT</div>
      <div className="text-xs mt-1">
        #{orderNumber} · {date}
      </div>
      <div className="text-xs">Cashier: {cashier}</div>
    </header>
  );
}

interface PosFooterProps {
  thankYou: string;
  returnPolicy: string;
}

export function Footer({ thankYou, returnPolicy }: PosFooterProps) {
  return (
    <footer className="pos-footer text-center text-xs text-slate-500 border-t-2 border-dashed border-slate-800 pt-2 mt-2 pb-2 space-y-1">
      <div>{thankYou}</div>
      <div>{returnPolicy}</div>
    </footer>
  );
}
