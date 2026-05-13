"use client";

import { useEffect, useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";
import { BarcodeSvg } from "@/components/BarcodeSvg";

type TemplateId = "40x30" | "50x30" | "a4_3x8";

type LabelItem = {
  productId: string;
  name: string;
  sku: string | null;
  unitSymbol: string | null;
  sellPrice: string;
  barcode: string | null;
  qty: number;
};

type Payload = { templateId: TemplateId; currencyCode: string; items: LabelItem[] };

function repeatItems(items: LabelItem[]): LabelItem[] {
  const out: LabelItem[] = [];
  for (const it of items) {
    const n = Math.max(0, Math.min(999, Math.trunc(it.qty)));
    for (let i = 0; i < n; i++) out.push(it);
  }
  return out;
}

export function PrintLabelsClient(props: { tenantSlug: string; storageKey: string }) {
  const { t } = useClientI18n();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [attemptedLoad, setAttemptedLoad] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const k = (props.storageKey ?? "").trim();
    if (!k) {
      setAttemptedLoad(true);
      return;
    }
    async function load() {
      try {
        for (let i = 0; i < 20; i++) {
          const raw = localStorage.getItem(`labelsPrint:${k}`);
          if (raw) {
            const json = JSON.parse(raw) as Payload;
            if (!cancelled) setPayload(json);
            localStorage.removeItem(`labelsPrint:${k}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      } catch {} finally {
        if (!cancelled) setAttemptedLoad(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.storageKey]);

  const flat = useMemo(() => (payload ? repeatItems(payload.items ?? []) : []), [payload]);
  const template = payload?.templateId ?? "40x30";
  const currencyCode = payload?.currencyCode ?? "USD";

  if (!payload && !attemptedLoad) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  }

  if (!payload) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("app.shop.labels.print.missing")}</div>;
  }

  const isA4 = template === "a4_3x8";
  const is40 = template === "40x30";
  const widthMm = is40 ? 40 : 50;
  const heightMm = 30;

  return (
    <div className="space-y-4">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.labels.print.title")}</div>
            <div className="mt-1 text-sm text-gray-700">
              {t("app.shop.labels.print.template")}:{" "}
              {t(template === "40x30" ? "app.shop.labels.template.40x30" : template === "50x30" ? "app.shop.labels.template.50x30" : "app.shop.labels.template.a4_3x8")} ·{" "}
              {flat.length} {t("app.shop.labels.print.labels")}
            </div>
          </div>
          <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700" onClick={() => window.print()}>
            {t("app.shop.labels.action.print")}
          </button>
        </div>
      </div>

      <div className="print-root">
        <style>{isA4 ? printCssA4_3x8() : printCssThermal(widthMm, heightMm)}</style>
        <div className="labels-sheet">
          {flat.map((it, idx) => (
            <div key={`${it.productId}-${idx}`} className="label">
              <div className="label-top">
                <div className="label-name" title={it.name}>
                  {it.name}
                </div>
                <div className="label-price">{formatMoney(it.sellPrice, currencyCode)}</div>
              </div>
              <div className="label-barcode">
                {it.barcode ? <BarcodeSvg value={it.barcode} height={34} className="barcode-svg" /> : <div className="barcode-missing">{t("app.shop.labels.print.noBarcode")}</div>}
              </div>
              <div className="label-bottom">
                <div className="label-meta">
                  {it.sku ? `${t("app.shop.labels.print.sku")}: ${it.sku}` : ""}
                  {it.unitSymbol ? (it.sku ? ` · ${it.unitSymbol}` : it.unitSymbol) : ""}
                </div>
                <div className="label-code">{it.barcode ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function printCssThermal(widthMm: number, heightMm: number): string {
  const padMm = 1.5;
  const gapMm = 0.8;
  return `
.print-root { background: transparent; }
.labels-sheet { display: flex; flex-wrap: wrap; gap: ${gapMm}mm; }
.label { width: ${widthMm}mm; height: ${heightMm}mm; border: 1px solid #E5E7EB; border-radius: 2mm; background: white; padding: ${padMm}mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.label-top { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
.label-name { font-size: 9pt; font-weight: 700; color: #111827; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-price { font-size: 10pt; font-weight: 800; color: #111827; white-space: nowrap; }
.label-barcode { margin-top: 1mm; flex: 1; display: flex; align-items: center; justify-content: center; }
.barcode-svg { width: 100%; }
.barcode-missing { font-size: 8pt; color: #6B7280; }
.label-bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; margin-top: 0.5mm; }
.label-meta { font-size: 7pt; color: #6B7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-code { font-size: 7pt; color: #111827; font-variant-numeric: tabular-nums; white-space: nowrap; }
.no-print { }
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  .labels-sheet { gap: 0 !important; }
  .label { border: none !important; border-radius: 0 !important; width: ${widthMm}mm !important; height: ${heightMm}mm !important; padding: ${padMm}mm !important; break-inside: avoid; page-break-inside: avoid; }
}
`;
}

function printCssA4_3x8(): string {
  const cols = 3;
  const rows = 8;
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const gap = 2;
  const usableW = pageWidth - margin * 2 - gap * (cols - 1);
  const usableH = pageHeight - margin * 2 - gap * (rows - 1);
  const labelW = usableW / cols;
  const labelH = usableH / rows;
  const pad = 2;
  return `
.print-root { background: transparent; }
.labels-sheet { display: grid; grid-template-columns: repeat(${cols}, ${labelW}mm); grid-auto-rows: ${labelH}mm; gap: ${gap}mm; padding: ${margin}mm; }
.label { border: 1px solid #E5E7EB; border-radius: 3mm; background: white; padding: ${pad}mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.label-top { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; }
.label-name { font-size: 10pt; font-weight: 700; color: #111827; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-price { font-size: 11pt; font-weight: 800; color: #111827; white-space: nowrap; }
.label-barcode { margin-top: 1mm; flex: 1; display: flex; align-items: center; justify-content: center; }
.barcode-svg { width: 100%; }
.barcode-missing { font-size: 9pt; color: #6B7280; }
.label-bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; margin-top: 0.5mm; }
.label-meta { font-size: 8pt; color: #6B7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-code { font-size: 8pt; color: #111827; font-variant-numeric: tabular-nums; white-space: nowrap; }
.no-print { }
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  @page { size: A4; margin: 0; }
  .labels-sheet { padding: ${margin}mm !important; }
  .label { break-inside: avoid; page-break-inside: avoid; }
}
`;
}
