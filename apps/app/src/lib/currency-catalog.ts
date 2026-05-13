export type Currency = { code: string; name: string; symbol: string };

export const currencies: Currency[] = [
  { code: "AFN", name: "Afghan Afghani", symbol: "؋" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "ر.س" },
  { code: "QAR", name: "Qatari Riyal", symbol: "ر.ق" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" }
];

export function formatMoney(amountRaw: string, currencyCode: string): string {
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return `${amountRaw} ${currencyCode}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

