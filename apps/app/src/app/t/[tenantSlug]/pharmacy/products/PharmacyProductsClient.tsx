"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Unit = { id: string; name: string; symbol: string | null };
type Category = { id: string; name: string };
type SettingsResponse = { data: { sellCurrencyCode: string; buyCurrencyCode: string } };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: Unit | null;
  image: { id: string; url: string } | null;
  sellPrice: string;
  costPrice: string | null;
  category: Category | null;
  barcodes: string[];
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type ProductsResponse = { data: { items: Product[]; page: number; pageSize: number; total: number } };
type UnitsResponse = { data: Unit[] };
type CategoriesResponse = { data: Category[] };
type PharmacyProfileResponse = { data: { trackLots: boolean; requiresPrescription: boolean; isControlled: boolean; form: string | null; strength: string | null } };

type VariantProduct = Product & { variantLabel: string | null; variantAttributes: Record<string, unknown> | null };
type VariantsResponse = { data: { items: VariantProduct[] } };
type PackagingItem = { id: string; label: string; multiplier: string; barcode: string | null };
type PackagingResponse = { data: { items: PackagingItem[] } };

export function PharmacyProductsClient(props: { tenantSlug: string; variant?: "products" | "medicines" }) {
  const { t } = useClientI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const variant = props.variant ?? "products";
  const titleKey = variant === "medicines" ? "app.pharmacy.medicines.title" : "app.pharmacy.products.title";
  const subtitleKey = variant === "medicines" ? "app.pharmacy.medicines.subtitle" : "app.pharmacy.products.subtitle";

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const [variantScannerOpen, setVariantScannerOpen] = useState(false);
  const [packScannerOpen, setPackScannerOpen] = useState(false);

  const [items, setItems] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [seedingDefaultUnits, setSeedingDefaultUnits] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitSymbol, setNewUnitSymbol] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);

  const [seedingDefaultCategories, setSeedingDefaultCategories] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [sellPrice, setSellPrice] = useState("0.00");
  const [costPrice, setCostPrice] = useState("");
  const [barcodes, setBarcodes] = useState("");
  const [barcodeEntry, setBarcodeEntry] = useState("");
  const [productUnitId, setProductUnitId] = useState("");
  const [productCategoryId, setProductCategoryId] = useState("");

  const [pharmacyTrackLots, setPharmacyTrackLots] = useState(true);
  const [pharmacyRequiresPrescription, setPharmacyRequiresPrescription] = useState(false);
  const [pharmacyIsControlled, setPharmacyIsControlled] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState("");
  const [pharmacyStrength, setPharmacyStrength] = useState("");
  const [loadingPharmacyProfile, setLoadingPharmacyProfile] = useState(false);

  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variants, setVariants] = useState<VariantProduct[]>([]);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantSellPrice, setVariantSellPrice] = useState("");
  const [variantAttributes, setVariantAttributes] = useState("");
  const [variantBarcodes, setVariantBarcodes] = useState("");
  const [creatingVariant, setCreatingVariant] = useState(false);

  const [loadingPackaging, setLoadingPackaging] = useState(false);
  const [packaging, setPackaging] = useState<PackagingItem[]>([]);
  const [packLabel, setPackLabel] = useState("");
  const [packMultiplier, setPackMultiplier] = useState("1");
  const [packBarcode, setPackBarcode] = useState("");
  const [creatingPack, setCreatingPack] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (productCategoryId) p.set("categoryId", productCategoryId);
    return p;
  }, [page, pageSize, productCategoryId, q, status]);

  const addBarcodeToText = useCallback((prev: string, raw: string) => {
    const v = raw.trim();
    if (!v) return prev;
    const lines = prev
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.includes(v)) return lines.join("\n");
    return lines.length ? `${lines.join("\n")}\n${v}` : v;
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setName("");
    setSku("");
    setDescription("");
    setSellPrice("0.00");
    setCostPrice("");
    setBarcodes("");
    setBarcodeEntry("");
    setProductUnitId("");
    setProductCategoryId("");
    setShowAddUnit(false);
    setNewUnitName("");
    setNewUnitSymbol("");
    setShowAddCategory(false);
    setNewCategoryName("");
    setPharmacyTrackLots(true);
    setPharmacyRequiresPrescription(false);
    setPharmacyIsControlled(false);
    setPharmacyForm("");
    setPharmacyStrength("");
    setVariants([]);
    setPackaging([]);
    setVariantLabel("");
    setVariantSku("");
    setVariantSellPrice("");
    setVariantAttributes("");
    setVariantBarcodes("");
    setPackLabel("");
    setPackMultiplier("1");
    setPackBarcode("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((p: Product) => {
    setEditing(p);
    setName(p.name);
    setSku(p.sku ?? "");
    setDescription(p.description ?? "");
    setSellPrice(p.sellPrice);
    setCostPrice(p.costPrice ?? "");
    setBarcodes(p.barcodes.join("\n"));
    setBarcodeEntry("");
    setProductUnitId(p.unit?.id ?? "");
    setProductCategoryId(p.category?.id ?? "");
    setShowAddUnit(false);
    setNewUnitName("");
    setNewUnitSymbol("");
    setShowAddCategory(false);
    setNewCategoryName("");
    setVariantLabel("");
    setVariantSku("");
    setVariantSellPrice("");
    setVariantAttributes("");
    setVariantBarcodes("");
    setPackLabel("");
    setPackMultiplier("1");
    setPackBarcode("");
    setModalOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      setLoading(true);
      setErrorKey(null);
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) {
          setErrorKey("errors.unauthenticated");
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          setErrorKey("errors.tenantAccessDenied");
          return;
        }
        if (!cancelled) setTenantId(membership.tenantId);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTenant();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  const loadLists = useCallback(async () => {
    if (!tenantId) return;
    const [settingsRes, unitsRes, catsRes] = await Promise.all([
      apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
      apiFetch("/api/pharmacy/units", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
      apiFetch("/api/pharmacy/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
    ]);
    if (settingsRes.ok) {
      const s = (await settingsRes.json()) as SettingsResponse;
      setSellCurrencyCode(s.data.sellCurrencyCode || "USD");
      setBuyCurrencyCode(s.data.buyCurrencyCode || "USD");
    }
    if (unitsRes.ok) {
      const u = (await unitsRes.json()) as UnitsResponse;
      setUnits(u.data ?? []);
    }
    if (catsRes.ok) {
      const c = (await catsRes.json()) as CategoriesResponse;
      setCategories(c.data ?? []);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setErrorKey(null);
    loadLists().catch(() => setErrorKey("errors.internal"));
  }, [loadLists, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/products?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ProductsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as ProductsResponse).data;
        if (!cancelled) {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [queryParams, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadRelated() {
      if (!tenantId || !modalOpen || !editing) return;
      setLoadingPharmacyProfile(true);
      setLoadingVariants(true);
      setLoadingPackaging(true);
      try {
        const [phRes, vRes, pRes] = await Promise.all([
          apiFetch(`/api/pharmacy/products/${editing.id}/pharmacy-profile`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/products/${editing.id}/variants`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/products/${editing.id}/packaging`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        if (phRes.ok) {
          const json = (await phRes.json()) as PharmacyProfileResponse;
          if (!cancelled) {
            setPharmacyTrackLots(Boolean(json.data.trackLots));
            setPharmacyRequiresPrescription(Boolean(json.data.requiresPrescription));
            setPharmacyIsControlled(Boolean(json.data.isControlled));
            setPharmacyForm(json.data.form ?? "");
            setPharmacyStrength(json.data.strength ?? "");
          }
        }

        if (vRes.ok) {
          const json = (await vRes.json()) as VariantsResponse;
          if (!cancelled) setVariants(json.data.items ?? []);
        }

        if (pRes.ok) {
          const json = (await pRes.json()) as PackagingResponse;
          if (!cancelled) setPackaging(json.data.items ?? []);
        }
      } catch {} finally {
        if (!cancelled) {
          setLoadingPharmacyProfile(false);
          setLoadingVariants(false);
          setLoadingPackaging(false);
        }
      }
    }
    void loadRelated();
    return () => {
      cancelled = true;
    };
  }, [editing, modalOpen, tenantId]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy`}>
                {t("module.pharmacy.name")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="text-2xl font-semibold">{t(titleKey)}</div>
            </div>
            <div className="mt-2 text-gray-700">{t(subtitleKey)}</div>
          </div>
          <button type="button" disabled={!tenantId || loading} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={openCreate}>
            {t("common.button.create")}
          </button>
          <div className="relative">
            <button
              type="button"
              disabled={!tenantId || loading || items.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    if (!tenantId) return;
                    setExportingXlsx(true);
                    setErrorKey(null);
                    try {
                      try {
                        const threshold = `q=${q.trim() || ""};status=${status};categoryId=${productCategoryId || ""}`;
                        await apiFetch("/api/pharmacy/reports/export-log", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                          body: JSON.stringify({ reportId: "pharmacy.medicines.list.v1", format: "xlsx", threshold })
                        });
                      } catch {}
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [
                        ["Pharmacy medicines"],
                        ["Exported at", new Date().toISOString()],
                        ["Status", status],
                        ["Category", productCategoryId ? categories.find((c) => c.id === productCategoryId)?.name ?? productCategoryId : t("common.all")],
                        ["Query", q.trim() || ""]
                      ];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const maxRows = 5000;
                      const exportPageSize = 500;
                      const all: Product[] = [];
                      for (let p = 1; p <= 100; p += 1) {
                        const params = new URLSearchParams();
                        if (q.trim()) params.set("q", q.trim());
                        params.set("status", status);
                        if (productCategoryId) params.set("categoryId", productCategoryId);
                        params.set("page", String(p));
                        params.set("pageSize", String(exportPageSize));
                        const res = await apiFetch(`/api/pharmacy/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                        const json = (await res.json()) as ProductsResponse;
                        if (!res.ok) break;
                        const batch = json.data.items ?? [];
                        all.push(...batch);
                        if (batch.length < exportPageSize) break;
                        if (all.length >= maxRows) break;
                      }

                      const header = ["Name", "SKU", "Sell price", "Category", "Status"];
                      const rows = all.slice(0, maxRows).map((p) => [p.name, p.sku ?? "", formatMoney(p.sellPrice, sellCurrencyCode), p.category?.name ?? "", p.status === "active" ? t("common.status.active") : t("common.status.archived")]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Medicines");

                      const safeDate = new Date().toISOString().slice(0, 10);
                      const filename = `pharmacy_medicines_${safeDate}.xlsx`;
                      XLSX.writeFile(wb, filename);
                    } catch {
                      setErrorKey("errors.internal");
                    } finally {
                      setExportingXlsx(false);
                      setExportMenuOpen(false);
                    }
                  }}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.excel")}
                </button>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/medicines/print?paper=a4&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&categoryId=${encodeURIComponent(productCategoryId || "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.printView")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/medicines/print?paper=a4&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&categoryId=${encodeURIComponent(productCategoryId || "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdfA4")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/medicines/print?paper=thermal80&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&categoryId=${encodeURIComponent(productCategoryId || "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf80")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/medicines/print?paper=thermal58&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&categoryId=${encodeURIComponent(productCategoryId || "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf58")}
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("common.search")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60" value={q} onChange={(e) => setQ(e.target.value)} disabled={loading} />
              <button type="button" disabled={!tenantId || loading} className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => setSearchScannerOpen(true)}>
                {t("app.shop.products.scan.open")}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("common.status")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={loading}>
              <option value="active">{t("common.status.active")}</option>
              <option value="archived">{t("common.status.archived")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.category")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)} disabled={loading}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categories.length === 0 ? (
              <button
                type="button"
                disabled={!tenantId || seedingDefaultCategories}
                className="mt-2 inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId) return;
                  setSeedingDefaultCategories(true);
                  setErrorKey(null);
                  try {
                    const res = await apiFetch("/api/pharmacy/categories/seed-default", { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                    if (!res.ok) return;
                    const listRes = await apiFetch("/api/pharmacy/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                    if (!listRes.ok) return;
                    const json = (await listRes.json()) as CategoriesResponse;
                    setCategories(json.data ?? []);
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setSeedingDefaultCategories(false);
                  }
                }}
              >
                {seedingDefaultCategories ? t("common.working") : t("app.shop.products.category.seedDefaults")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.sku")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.products.table.price")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.products.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.products.empty")}
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.sku ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(p.sellPrice, sellCurrencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.category?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.status === "active" ? t("common.status.active") : t("common.status.archived")}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => openEdit(p)}>
                        {t("common.button.open")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("common.pagination.page")} {page} / {totalPages} · {total} {t("common.pagination.items")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} disabled={loading}>
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("common.pagination.prev")}
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold text-gray-900">{editing ? t("common.button.edit") : t("common.button.create")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.name")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.sku")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.unit")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={productUnitId} onChange={(e) => setProductUnitId(e.target.value)}>
                <option value="">{t("common.none")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.symbol ? `(${u.symbol})` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {units.length === 0 ? (
                  <button
                    type="button"
                    disabled={!tenantId || seedingDefaultUnits}
                    className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId) return;
                      setSeedingDefaultUnits(true);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch("/api/pharmacy/units/seed-default", { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                        if (!res.ok) return;
                        const listRes = await apiFetch("/api/pharmacy/units", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                        if (!listRes.ok) return;
                        const json = (await listRes.json()) as UnitsResponse;
                        setUnits(json.data ?? []);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setSeedingDefaultUnits(false);
                      }
                    }}
                  >
                    {seedingDefaultUnits ? t("common.working") : t("app.shop.products.unit.seedDefaults")}
                  </button>
                ) : null}

                <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setShowAddUnit((v) => !v)}>
                  {t("app.shop.products.unit.add")}
                </button>

                {showAddUnit ? (
                  <div className="flex min-w-[260px] flex-1 items-center gap-2">
                    <input className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} placeholder={t("app.shop.products.unit.namePlaceholder")} />
                    <input className="h-9 w-[120px] rounded-xl border border-gray-200 px-3 text-sm" value={newUnitSymbol} onChange={(e) => setNewUnitSymbol(e.target.value)} placeholder={t("app.shop.products.unit.symbolPlaceholder")} />
                    <button
                      type="button"
                      disabled={creatingUnit || !tenantId || newUnitName.trim().length < 1}
                      className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                      onClick={async () => {
                        if (!tenantId) return;
                        setCreatingUnit(true);
                        setErrorKey(null);
                        try {
                          const res = await apiFetch("/api/pharmacy/units", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({ name: newUnitName.trim(), symbol: newUnitSymbol.trim() || undefined })
                          });
                          const json = (await res.json()) as { data?: Unit; error?: { message_key?: string } };
                          if (!res.ok || !json.data) {
                            setErrorKey(json.error?.message_key ?? "errors.internal");
                            return;
                          }
                          setUnits((prev) => [...prev, json.data!].sort((a, b) => a.name.localeCompare(b.name)));
                          setProductUnitId(json.data!.id);
                          setShowAddUnit(false);
                          setNewUnitName("");
                          setNewUnitSymbol("");
                        } catch {
                          setErrorKey("errors.internal");
                        } finally {
                          setCreatingUnit(false);
                        }
                      }}
                    >
                      {creatingUnit ? t("common.working") : t("app.shop.products.unit.create")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{`${t("app.shop.products.field.sellPrice")} (${sellCurrencyCode})`}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{`${t("app.shop.products.field.costPrice")} (${buyCurrencyCode})`}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.category")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)}>
                <option value="">{t("common.none")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {categories.length === 0 ? (
                  <button
                    type="button"
                    disabled={!tenantId || seedingDefaultCategories}
                    className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId) return;
                      setSeedingDefaultCategories(true);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch("/api/pharmacy/categories/seed-default", { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                        if (!res.ok) return;
                        const listRes = await apiFetch("/api/pharmacy/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                        if (!listRes.ok) return;
                        const json = (await listRes.json()) as CategoriesResponse;
                        setCategories(json.data ?? []);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setSeedingDefaultCategories(false);
                      }
                    }}
                  >
                    {seedingDefaultCategories ? t("common.working") : t("app.shop.products.category.seedDefaults")}
                  </button>
                ) : null}

                <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setShowAddCategory((v) => !v)}>
                  {t("app.shop.products.category.add")}
                </button>

                {showAddCategory ? (
                  <div className="flex min-w-[260px] flex-1 items-center gap-2">
                    <input className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={t("app.shop.products.category.placeholder")} />
                    <button
                      type="button"
                      disabled={creatingCategory || !tenantId || newCategoryName.trim().length < 2}
                      className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                      onClick={async () => {
                        if (!tenantId) return;
                        setCreatingCategory(true);
                        setErrorKey(null);
                        try {
                          const res = await apiFetch("/api/pharmacy/categories", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({ name: newCategoryName.trim() })
                          });
                          const json = (await res.json()) as { data?: Category; error?: { message_key?: string } };
                          if (!res.ok || !json.data) {
                            setErrorKey(json.error?.message_key ?? "errors.internal");
                            return;
                          }
                          setCategories((prev) => [...prev, json.data!].sort((a, b) => a.name.localeCompare(b.name)));
                          setProductCategoryId(json.data!.id);
                          setShowAddCategory(false);
                          setNewCategoryName("");
                        } catch {
                          setErrorKey("errors.internal");
                        } finally {
                          setCreatingCategory(false);
                        }
                      }}
                    >
                      {creatingCategory ? t("common.working") : t("app.shop.products.category.create")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.description")}</label>
              <textarea className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.barcodes")}</label>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                  value={barcodeEntry}
                  onChange={(e) => setBarcodeEntry(e.target.value)}
                  placeholder={t("app.shop.products.barcodes.add.placeholder")}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const v = barcodeEntry.trim();
                    if (!v) return;
                    setBarcodes((prev) => addBarcodeToText(prev, v));
                    setBarcodeEntry("");
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={() => {
                      const v = barcodeEntry.trim();
                      if (!v) return;
                      setBarcodes((prev) => addBarcodeToText(prev, v));
                      setBarcodeEntry("");
                    }}
                  >
                    {t("app.shop.products.barcodes.add")}
                  </button>
                  <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={() => setScannerOpen(true)}>
                    {t("app.shop.products.scan.open")}
                  </button>
                </div>
              </div>
              <textarea className="mt-1 min-h-20 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={barcodes} onChange={(e) => setBarcodes(e.target.value)} placeholder={t("app.shop.products.field.barcodes.placeholder")} />
              <div className="mt-2 text-xs text-gray-500">{t("app.shop.products.scan.externalHint")}</div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="text-sm font-semibold text-gray-900">{t("app.shop.products.pharmacy.title")}</div>
            <div className="mt-1 text-xs text-gray-600">{t("app.shop.products.pharmacy.subtitle")}</div>
            {editing && loadingPharmacyProfile ? <div className="mt-4 text-sm text-gray-700">{t("common.loading")}</div> : null}
            <div className="mt-4 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={pharmacyTrackLots} onChange={(e) => setPharmacyTrackLots(e.target.checked)} />
                {t("app.shop.products.pharmacy.trackLots")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={pharmacyRequiresPrescription} onChange={(e) => setPharmacyRequiresPrescription(e.target.checked)} />
                {t("app.shop.products.pharmacy.requiresPrescription")}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={pharmacyIsControlled} onChange={(e) => setPharmacyIsControlled(e.target.checked)} />
                {t("app.shop.products.pharmacy.isControlled")}
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.pharmacy.form")}</label>
                <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pharmacyForm} onChange={(e) => setPharmacyForm(e.target.value)} placeholder={t("app.shop.products.pharmacy.form.placeholder")} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.pharmacy.strength")}</label>
                <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pharmacyStrength} onChange={(e) => setPharmacyStrength(e.target.value)} placeholder={t("app.shop.products.pharmacy.strength.placeholder")} />
              </div>
            </div>
          </div>

          {editing ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{t("app.shop.products.variants.title")}</div>
                    <div className="mt-1 text-xs text-gray-600">{t("app.shop.products.variants.subtitle")}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.label")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.sku")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.sellPrice")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={variantSellPrice} onChange={(e) => setVariantSellPrice(e.target.value)} placeholder={sellPrice || editing.sellPrice} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.attributes")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={variantAttributes} onChange={(e) => setVariantAttributes(e.target.value)} placeholder={t("app.shop.products.variants.field.attributes.placeholder")} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.barcodes")}</label>
                      <button type="button" className="inline-flex h-9 items-center rounded-xl bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800" onClick={() => setVariantScannerOpen(true)}>
                        {t("app.shop.products.scan.open")}
                      </button>
                    </div>
                    <textarea className="mt-1 min-h-[64px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={variantBarcodes} onChange={(e) => setVariantBarcodes(e.target.value)} placeholder={t("app.shop.products.variants.field.barcodes.placeholder")} />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!tenantId || creatingVariant || !variantLabel.trim()}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                      onClick={async () => {
                        if (!tenantId || !editing) return;
                        setCreatingVariant(true);
                        setErrorKey(null);
                        try {
                          const codes = variantBarcodes
                            .split(/[,\n]/g)
                            .map((v) => v.trim())
                            .filter(Boolean);
                          const res = await apiFetch(`/api/pharmacy/products/${editing.id}/variants`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({
                              label: variantLabel.trim(),
                              sku: variantSku.trim() || undefined,
                              sellPrice: variantSellPrice.trim() || undefined,
                              attributes: variantAttributes.trim() || undefined,
                              barcodes: codes.length ? codes : undefined
                            })
                          });
                          const json = (await res.json()) as { error?: { message_key?: string } };
                          if (!res.ok) {
                            setErrorKey(json.error?.message_key ?? "errors.internal");
                            return;
                          }
                          setVariantLabel("");
                          setVariantSku("");
                          setVariantSellPrice("");
                          setVariantAttributes("");
                          setVariantBarcodes("");
                          const vRes = await apiFetch(`/api/pharmacy/products/${editing.id}/variants`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                          if (vRes.ok) {
                            const vJson = (await vRes.json()) as VariantsResponse;
                            setVariants(vJson.data.items ?? []);
                          }
                        } catch {
                          setErrorKey("errors.internal");
                        } finally {
                          setCreatingVariant(false);
                        }
                      }}
                    >
                      {creatingVariant ? t("app.shop.products.action.working") : t("app.shop.products.variants.action.add")}
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
                  {loadingVariants ? (
                    <div className="px-4 py-4 text-sm text-gray-700">{t("common.loading")}</div>
                  ) : variants.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-700">{t("app.shop.products.variants.empty")}</div>
                  ) : (
                    variants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">{v.variantLabel ?? v.name}</div>
                          <div className="mt-1 truncate text-xs text-gray-500">{v.sku ?? "—"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-semibold text-gray-900">{formatMoney(v.sellPrice, sellCurrencyCode)}</div>
                          <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => openEdit(v)}>
                            {t("common.button.open")}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
                <div className="text-sm font-semibold text-gray-900">{t("app.shop.products.packaging.title")}</div>
                <div className="mt-1 text-xs text-gray-600">{t("app.shop.products.packaging.subtitle")}</div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.packaging.field.label")}</label>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={packLabel} onChange={(e) => setPackLabel(e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.packaging.field.multiplier")}</label>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={packMultiplier} onChange={(e) => setPackMultiplier(e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.packaging.field.barcode")}</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={packBarcode} onChange={(e) => setPackBarcode(e.target.value)} />
                      <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800" onClick={() => setPackScannerOpen(true)}>
                        {t("app.shop.products.scan.open")}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={!tenantId || creatingPack || !packLabel.trim() || !packMultiplier.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId || !editing) return;
                      setCreatingPack(true);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch(`/api/pharmacy/products/${editing.id}/packaging`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                          body: JSON.stringify({ label: packLabel.trim(), multiplier: packMultiplier.trim(), barcode: packBarcode.trim() || null })
                        });
                        const json = (await res.json()) as { error?: { message_key?: string } };
                        if (!res.ok) {
                          setErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        setPackLabel("");
                        setPackMultiplier("1");
                        setPackBarcode("");
                        const pRes = await apiFetch(`/api/pharmacy/products/${editing.id}/packaging`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                        if (pRes.ok) {
                          const pJson = (await pRes.json()) as PackagingResponse;
                          setPackaging(pJson.data.items ?? []);
                        }
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setCreatingPack(false);
                      }
                    }}
                  >
                    {creatingPack ? t("app.shop.products.action.working") : t("app.shop.products.packaging.action.add")}
                  </button>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
                  {loadingPackaging ? (
                    <div className="px-4 py-4 text-sm text-gray-700">{t("common.loading")}</div>
                  ) : packaging.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-700">{t("app.shop.products.packaging.empty")}</div>
                  ) : (
                    packaging.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {p.label} ×{p.multiplier}
                          </div>
                          <div className="mt-1 truncate text-xs text-gray-500">{p.barcode ?? "—"}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!tenantId}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                          onClick={async () => {
                            if (!tenantId || !editing) return;
                            setErrorKey(null);
                            try {
                              const res = await apiFetch(`/api/pharmacy/products/${editing.id}/packaging/${p.id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
                              const json = (await res.json()) as { error?: { message_key?: string } };
                              if (!res.ok) {
                                setErrorKey(json.error?.message_key ?? "errors.internal");
                                return;
                              }
                              setPackaging((prev) => prev.filter((x) => x.id !== p.id));
                            } catch {
                              setErrorKey("errors.internal");
                            }
                          }}
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.button.close")}
            </button>
            <button
              type="button"
              disabled={!tenantId || saving || !name.trim()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId) return;
                setSaving(true);
                setErrorKey(null);
                try {
                  const codes = barcodes
                    .split(/[,\n]/g)
                    .map((v) => v.trim())
                    .filter(Boolean);
                  const basePayload = {
                    name: name.trim(),
                    sku: sku.trim() || undefined,
                    description: description.trim() || undefined,
                    sellPrice: sellPrice.trim() || "0.00",
                    costPrice: costPrice.trim() ? costPrice.trim() : null,
                    barcodes: codes
                  };

                  let productId = editing?.id ?? null;
                  if (editing) {
                    const res = await apiFetch(`/api/pharmacy/products/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ ...basePayload, unitId: productUnitId || null, categoryId: productCategoryId || null }) });
                    const json = (await res.json()) as { error?: { message_key?: string } };
                    if (!res.ok) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                  } else {
                    const res = await apiFetch(`/api/pharmacy/products`, { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ ...basePayload, unitId: productUnitId || null, categoryId: productCategoryId || null }) });
                    const json = (await res.json()) as { data?: Product; error?: { message_key?: string } };
                    if (!res.ok || !json.data?.id) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    productId = json.data.id;
                  }

                  if (!productId) return;
                  const phRes = await apiFetch(`/api/pharmacy/products/${productId}/pharmacy-profile`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({
                      trackLots: pharmacyTrackLots,
                      requiresPrescription: pharmacyRequiresPrescription,
                      isControlled: pharmacyIsControlled,
                      form: pharmacyForm.trim() ? pharmacyForm.trim() : null,
                      strength: pharmacyStrength.trim() ? pharmacyStrength.trim() : null
                    })
                  });
                  if (!phRes.ok) {
                    const json = (await phRes.json()) as { error?: { message_key?: string } };
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }

                  setModalOpen(false);
                  setPage(1);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setBarcodes((prev) => addBarcodeToText(prev, v));
          setBarcodeEntry("");
        }}
      />

      <BarcodeScannerModal
        open={searchScannerOpen}
        onClose={() => setSearchScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setPage(1);
          setQ(v);
        }}
      />

      <BarcodeScannerModal
        open={variantScannerOpen}
        onClose={() => setVariantScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setVariantBarcodes((prev) => addBarcodeToText(prev, v));
        }}
      />

      <BarcodeScannerModal
        open={packScannerOpen}
        onClose={() => setPackScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setPackBarcode(v);
        }}
      />
    </div>
  );
}
