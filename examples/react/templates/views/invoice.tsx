import { useMemo } from "react";
import { MoneyAmount } from "../components/MoneyAmount";

interface InvoiceBodyProps {
  billTo: { name: string; company?: string; address: string };
  items: { description: string; qty: number; unitPrice: number }[];
  taxRate: number;
  notes?: string;
}

export function Body({ billTo, items, taxRate, notes }: InvoiceBodyProps) {
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [items],
  );

  return (
    <section className="invoice-body px-10 py-8 text-slate-800">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">
          Billed to
        </div>
        <div className="text-lg font-semibold">{billTo.name}</div>
        {billTo.company && (
          <div className="text-slate-600">{billTo.company}</div>
        )}
        <div className="text-slate-600 whitespace-pre-line">
          {billTo.address}
        </div>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left text-slate-500 uppercase text-xs tracking-wider">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-slate-200">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right tabular-nums">{item.qty}</td>
              <td className="py-2 text-right">
                <MoneyAmount amount={item.unitPrice} />
              </td>
              <td className="py-2 text-right">
                <MoneyAmount amount={item.unitPrice * item.qty} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-6">
        <div className="w-64 text-sm">
          <div className="flex justify-between py-1 text-slate-600">
            <span>Subtotal</span>
            <MoneyAmount amount={subtotal} />
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Tax ({Math.round(taxRate * 100)}%)</span>
            <MoneyAmount amount={subtotal * taxRate} />
          </div>
          <div className="flex justify-between py-2 mt-1 border-t-2 border-slate-900 font-bold text-lg">
            <span>Total</span>
            <MoneyAmount amount={subtotal * (1 + taxRate)} bold />
          </div>
        </div>
      </div>

      {notes && <p className="mt-8 text-xs text-slate-400 italic">{notes}</p>}
    </section>
  );
}

interface InvoiceHeaderProps {
  companyName: string;
  companyEmail: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
}

export function Header({
  companyName,
  companyEmail,
  invoiceNumber,
  issueDate,
  dueDate,
}: InvoiceHeaderProps) {
  return (
    <header className="invoice-header bg-slate-900 text-white px-10 pt-8 pb-6 flex items-start justify-between">
      <div>
        <div className="text-2xl font-bold tracking-tight">
          {companyName}
        </div>
        <div className="text-slate-300 text-sm mt-1">{companyEmail}</div>
      </div>
      <div className="text-right">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Invoice
        </div>
        <div className="text-xl font-semibold mt-0.5">{invoiceNumber}</div>
        <div className="text-slate-300 text-sm mt-1">Issued {issueDate}</div>
        <div className="text-slate-300 text-sm">Due {dueDate}</div>
      </div>
    </header>
  );
}

interface InvoiceFooterProps {
  thankYou: string;
  contactEmail: string;
  website: string;
}

export function Footer({
  thankYou,
  contactEmail,
  website,
}: InvoiceFooterProps) {
  return (
    <footer className="invoice-footer px-10 pt-6 pb-8 border-t border-slate-200 text-slate-500 text-sm flex items-center justify-between">
      <div>{thankYou}</div>
      <div className="text-right">
        <div>{contactEmail}</div>
        <div>{website}</div>
      </div>
    </footer>
  );
}
