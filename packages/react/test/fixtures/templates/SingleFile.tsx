export function Body({ title }: { title?: string }) {
  return <div>Body: {title ?? "default"}</div>;
}

export function Header({ subtitle }: { subtitle?: string }) {
  return <div>Header: {subtitle ?? "default-h"}</div>;
}

export function Footer({ note }: { note?: string }) {
  return <div>Footer: {note ?? "default-f"}</div>;
}
