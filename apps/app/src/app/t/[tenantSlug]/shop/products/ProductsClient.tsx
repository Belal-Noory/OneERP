"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { formatMoney } from "@/lib/currency-catalog";
import { getApiBaseUrl } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type Category = { id: string; name: string };

type CategoriesResponse = { data: Category[] };

type Unit = { id: string; name: string; symbol: string | null };

type UnitsResponse = { data: Unit[] };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: Unit | null;
  image: { id: string; url: string } | null;
  sellPrice: string;
  costPrice: string | null;
  category: { id: string; name: string } | null;
  barcodes: string[];
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type PackagingItem = { id: string; label: string; multiplier: string; barcode: string | null };

type ProductsResponse = {
  data: {
    items: Product[];
    page: number;
    pageSize: number;
    total: number;
  };
};

type VariantsResponse = { data: { items: Array<Product & { variantLabel?: string | null; variantAttributes?: unknown | null }> } };
type PackagingResponse = { data: { items: PackagingItem[] } };

type ShopSettingsResponse = {
  data: { baseCurrencyCode: string; sellCurrencyCode: string; buyCurrencyCode: string };
};

export function ProductsClient(props: { tenantSlug: string; prefillBarcode?: string | null }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [categoryId, setCategoryId] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Array<Product & { variantLabel?: string | null; variantAttributes?: unknown | null }>>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [packaging, setPackaging] = useState<PackagingItem[]>([]);
  const [loadingPackaging, setLoadingPackaging] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [productUnitId, setProductUnitId] = useState<string>("");
  const [sellPrice, setSellPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [productCategoryId, setProductCategoryId] = useState<string>("");
  const [productImage, setProductImage] = useState<{ id: string; url: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [barcodes, setBarcodes] = useState("");
  const [barcodeEntry, setBarcodeEntry] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [seedingDefaultUnits, setSeedingDefaultUnits] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitSymbol, setNewUnitSymbol] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; origin: "row" | "modal" } | null>(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantSellPrice, setVariantSellPrice] = useState("");
  const [variantAttributes, setVariantAttributes] = useState("");
  const [variantBarcodes, setVariantBarcodes] = useState("");
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [packLabel, setPackLabel] = useState("");
  const [packMultiplier, setPackMultiplier] = useState("1");
  const [packBarcode, setPackBarcode] = useState("");
  const [creatingPack, setCreatingPack] = useState(false);
  const [pharmacyTrackLots, setPharmacyTrackLots] = useState(false);
  const [pharmacyRequiresPrescription, setPharmacyRequiresPrescription] = useState(false);
  const [pharmacyIsControlled, setPharmacyIsControlled] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState("");
  const [pharmacyStrength, setPharmacyStrength] = useState("");
  const [loadingPharmacyProfile, setLoadingPharmacyProfile] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const filters = useMemo(() => {
    const cat = categoryId !== "all" ? categoryId : "";
    return { q: q.trim(), status, categoryId: cat, page, pageSize };
  }, [q, status, categoryId, page, pageSize]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as CategoriesResponse;
        if (!cancelled) setCategories(json.data ?? []);
      } catch {}
    }
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnits() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/units", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as UnitsResponse;
        if (!cancelled) setUnits(json.data ?? []);
      } catch {}
    }
    void loadUnits();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ShopSettingsResponse;
        if (!cancelled) {
          setSellCurrencyCode(json.data.sellCurrencyCode);
          setBuyCurrencyCode(json.data.buyCurrencyCode);
        }
      } catch {}
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.categoryId) params.set("categoryId", filters.categoryId);
        params.set("status", filters.status);
        params.set("page", String(filters.page));
        params.set("pageSize", String(filters.pageSize));

        const res = await apiFetch(`/api/shop/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ProductsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as ProductsResponse).data;
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
          setPage(data.page);
          setPageSize(data.pageSize);
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
  }, [tenantId, filters]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setName("");
    setSku("");
    setDescription("");
    setProductUnitId("");
    setSellPrice("");
    setCostPrice("");
    setProductCategoryId("");
    setProductImage(null);
    setBarcodes("");
    setBarcodeEntry("");
    setShowAddCategory(false);
    setNewCategoryName("");
    setShowAddUnit(false);
    setNewUnitName("");
    setNewUnitSymbol("");
    setPharmacyTrackLots(false);
    setPharmacyRequiresPrescription(false);
    setPharmacyIsControlled(false);
    setPharmacyForm("");
    setPharmacyStrength("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModalOpen(true);
  }, []);

  useEffect(() => {
    const code = props.prefillBarcode?.trim() || null;
    if (!code) return;
    openCreate();
    setBarcodes(code);
  }, [openCreate, props.prefillBarcode]);

  useEffect(() => {
    let cancelled = false;
    async function loadRelated() {
      if (!tenantId || !modalOpen || !editing) return;
      setLoadingVariants(true);
      setLoadingPackaging(true);
      setLoadingPharmacyProfile(true);
      try {
        const [vRes, pRes, phRes] = await Promise.all([
          apiFetch(`/api/shop/products/${editing.id}/variants`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/products/${editing.id}/packaging`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/products/${editing.id}/pharmacy-profile`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        if (!vRes.ok || !pRes.ok || !phRes.ok) return;
        const vJson = (await vRes.json()) as VariantsResponse;
        const pJson = (await pRes.json()) as PackagingResponse;
        const phJson = (await phRes.json()) as { data: { trackLots: boolean; requiresPrescription: boolean; isControlled: boolean; form: string | null; strength: string | null } };
        if (!cancelled) {
          setVariants(vJson.data.items ?? []);
          setPackaging(pJson.data.items ?? []);
          setPharmacyTrackLots(Boolean(phJson.data.trackLots));
          setPharmacyRequiresPrescription(Boolean(phJson.data.requiresPrescription));
          setPharmacyIsControlled(Boolean(phJson.data.isControlled));
          setPharmacyForm(phJson.data.form ?? "");
          setPharmacyStrength(phJson.data.strength ?? "");
        }
      } catch {} finally {
        if (!cancelled) {
          setLoadingVariants(false);
          setLoadingPackaging(false);
          setLoadingPharmacyProfile(false);
        }
      }
    }
    void loadRelated();
    return () => {
      cancelled = true;
    };
  }, [editing, modalOpen, tenantId]);

  function openEdit(p: Product) {
    setEditing(p);
    setName(p.name);
    setSku(p.sku ?? "");
    setDescription(p.description ?? "");
    setProductUnitId(p.unit?.id ?? "");
    setSellPrice(p.sellPrice);
    setCostPrice(p.costPrice ?? "");
    setProductCategoryId(p.category?.id ?? "");
    setProductImage(p.image ?? null);
    setBarcodes(p.barcodes.join(", "));
    setBarcodeEntry("");
    setShowAddCategory(false);
    setNewCategoryName("");
    setShowAddUnit(false);
    setNewUnitName("");
    setNewUnitSymbol("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModalOpen(true);
  }

  const categoryOptions = useMemo(() => [{ id: "all", name: t("app.shop.products.filter.category.all") }, ...categories], [categories, t]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.products.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.products.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href={`/t/${props.tenantSlug}/shop/labels`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("app.shop.products.action.labels")}
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              {t("app.shop.products.action.create")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.filter.search")}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder={t("app.shop.products.filter.search.placeholder")}
              />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                onClick={() => setSearchScannerOpen(true)}
                aria-label={t("app.shop.products.scan.open")}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 7h2M7 17h2M15 7h2M15 17h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M6 10v4M18 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M9 6h6M9 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "active" | "archived");
              }}
            >
              <option value="active">{t("app.shop.products.status.active")}</option>
              <option value="archived">{t("app.shop.products.status.archived")}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.filter.category")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={categoryId}
              onChange={(e) => {
                setPage(1);
                setCategoryId(e.target.value);
              }}
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categories.length === 0 ? (
              <button
                type="button"
                disabled={!tenantId || seedingDefaults}
                className="mt-2 inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId) return;
                  setSeedingDefaults(true);
                  setErrorKey(null);
                  try {
                    const res = await apiFetch("/api/shop/categories/seed-default", { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                    if (!res.ok) return;
                    const listRes = await apiFetch("/api/shop/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                    if (!listRes.ok) return;
                    const json = (await listRes.json()) as CategoriesResponse;
                    setCategories(json.data ?? []);
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setSeedingDefaults(false);
                  }
                }}
              >
                {seedingDefaults ? t("app.shop.products.action.working") : t("app.shop.products.category.seedDefaults")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.products.empty")}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                      {p.image ? (
                        <Image alt="" src={`${apiBase}${p.image.url}`} unoptimized width={48} height={48} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                        <span>{p.sku ?? "—"}</span>
                        <span className="text-gray-300">•</span>
                        <span>{p.category?.name ?? "—"}</span>
                        {p.unit ? (
                          <>
                            <span className="text-gray-300">•</span>
                            <span>
                              {p.unit.name}
                              {p.unit.symbol ? ` (${p.unit.symbol})` : ""}
                            </span>
                          </>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="text-[11px] font-medium text-gray-600">
                            {t("app.shop.products.table.sellPrice")} ({sellCurrencyCode})
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="text-[11px] font-medium text-gray-600">
                            {t("app.shop.products.table.costPrice")} ({buyCurrencyCode})
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {p.costPrice ? formatMoney(p.costPrice, buyCurrencyCode) : "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">{t("app.shop.products.table.barcodes")}:</span>{" "}
                        {p.barcodes.length ? p.barcodes.join(", ") : "—"}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                          {t("app.shop.products.action.edit")}
                        </button>
                        {p.status === "active" ? (
                          <button
                            type="button"
                            disabled={!tenantId || archivingId === p.id}
                            className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => {
                              setDeleteTarget({ id: p.id, origin: "row" });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            {archivingId === p.id ? t("app.shop.products.action.working") : t("app.shop.products.action.delete")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[880px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.image")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.sku")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">
                  {t("app.shop.products.table.sellPrice")} ({sellCurrencyCode})
                </th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">
                  {t("app.shop.products.table.costPrice")} ({buyCurrencyCode})
                </th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.barcodes")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.products.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={8}>
                    {t("app.shop.products.empty")}
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="h-10 w-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        {p.image ? (
                          <Image alt="" src={`${apiBase}${p.image.url}`} unoptimized width={40} height={40} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.unit ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {t("app.shop.products.table.unit")}: {p.unit.name}
                          {p.unit.symbol ? ` (${p.unit.symbol})` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.sku ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.category?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.costPrice ? formatMoney(p.costPrice, buyCurrencyCode) : "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.barcodes.length ? p.barcodes.join(", ") : "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                          {t("app.shop.products.action.edit")}
                        </button>
                        {p.status === "active" ? (
                          <button
                            type="button"
                            disabled={!tenantId || archivingId === p.id}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => {
                              setDeleteTarget({ id: p.id, origin: "row" });
                              setDeleteDialogOpen(true);
                            }}
                          >
                            {archivingId === p.id ? t("app.shop.products.action.working") : t("app.shop.products.action.delete")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("app.shop.products.pagination.total")}: {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("app.shop.products.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700">
              {t("app.shop.products.pagination.page")} {page} / {totalPages}
            </div>
            <button
              type="button"
              disabled={page >= totalPages}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("app.shop.products.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{editing ? t("app.shop.products.modal.editTitle") : t("app.shop.products.modal.createTitle")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.products.modal.subtitle")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Field label={t("app.shop.products.field.name")} value={name} onChange={setName} />
            <Field label={t("app.shop.products.field.sku")} value={sku} onChange={setSku} />
            <Field label={`${t("app.shop.products.field.sellPrice")} (${sellCurrencyCode})`} value={sellPrice} onChange={setSellPrice} placeholder="0.00" />
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.products.field.unit")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={productUnitId}
                onChange={(e) => setProductUnitId(e.target.value)}
              >
                <option value="">{t("app.shop.products.field.unit.none")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.symbol ? ` (${u.symbol})` : ""}
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
                        const res = await apiFetch("/api/shop/units/seed-default", { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                        if (!res.ok) return;
                        const listRes = await apiFetch("/api/shop/units", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
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
                    {seedingDefaultUnits ? t("app.shop.products.action.working") : t("app.shop.products.unit.seedDefaults")}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => setShowAddUnit((v) => !v)}
                >
                  {t("app.shop.products.unit.add")}
                </button>

                {showAddUnit ? (
                  <div className="flex min-w-[260px] flex-1 items-center gap-2">
                    <input
                      className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      placeholder={t("app.shop.products.unit.namePlaceholder")}
                    />
                    <input
                      className="h-9 w-[120px] rounded-xl border border-gray-200 px-3 text-sm"
                      value={newUnitSymbol}
                      onChange={(e) => setNewUnitSymbol(e.target.value)}
                      placeholder={t("app.shop.products.unit.symbolPlaceholder")}
                    />
                    <button
                      type="button"
                      disabled={creatingUnit || !tenantId || newUnitName.trim().length < 1}
                      className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                      onClick={async () => {
                        if (!tenantId) return;
                        setCreatingUnit(true);
                        setErrorKey(null);
                        try {
                          const res = await apiFetch("/api/shop/units", {
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
                      {creatingUnit ? t("app.shop.products.action.working") : t("app.shop.products.unit.create")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.products.field.category")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={productCategoryId}
                onChange={(e) => setProductCategoryId(e.target.value)}
              >
                <option value="">{t("app.shop.products.field.category.none")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => setShowAddCategory((v) => !v)}
                >
                  {t("app.shop.products.category.add")}
                </button>
                {showAddCategory ? (
                  <div className="flex min-w-[260px] flex-1 items-center gap-2">
                    <input
                      className="h-9 w-full rounded-xl border border-gray-200 px-3 text-sm"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder={t("app.shop.products.category.placeholder")}
                    />
                    <button
                      type="button"
                      disabled={creatingCategory || !tenantId || newCategoryName.trim().length < 2}
                      className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                      onClick={async () => {
                        if (!tenantId) return;
                        setCreatingCategory(true);
                        setErrorKey(null);
                        try {
                          const res = await apiFetch("/api/shop/categories", {
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
                      {creatingCategory ? t("app.shop.products.action.working") : t("app.shop.products.category.create")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="md:col-span-2">
              <Field label={`${t("app.shop.products.field.costPrice")} (${buyCurrencyCode})`} value={costPrice} onChange={setCostPrice} placeholder="0.00" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.products.field.description")}</label>
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("app.shop.products.field.description.placeholder")}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.products.field.image")}</label>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {productImage ? (
                      <Image alt="" src={`${apiBase}${productImage.url}`} unoptimized width={64} height={64} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="text-sm text-gray-700">{productImage ? t("app.shop.products.image.has") : t("app.shop.products.image.none")}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file || !tenantId) return;
                      setUploadingImage(true);
                      setErrorKey(null);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await apiFetch(`/api/files?purpose=shop_product_image`, {
                          method: "POST",
                          headers: { "X-Tenant-Id": tenantId },
                          body: fd
                        });
                        const json = (await res.json()) as { data?: { id: string; url: string }; error?: { message_key?: string } };
                        if (!res.ok || !json.data) {
                          setErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        setProductImage(json.data);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setUploadingImage(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!tenantId || uploadingImage}
                    className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingImage ? t("app.shop.products.action.working") : t("app.shop.products.image.upload")}
                  </button>
                  {productImage ? (
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => setProductImage(null)}
                    >
                      {t("app.shop.products.image.remove")}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">{t("app.shop.products.image.hint")}</div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.products.field.barcodes")}</label>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={barcodeEntry}
                  onChange={(e) => setBarcodeEntry(e.target.value)}
                  placeholder={t("app.shop.products.barcodes.add.placeholder")}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const v = barcodeEntry.trim();
                    if (!v) return;
                    setBarcodes((prev) => (prev ? `${prev}\n${v}` : v));
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
                      setBarcodes((prev) => (prev ? `${prev}\n${v}` : v));
                      setBarcodeEntry("");
                    }}
                  >
                    {t("app.shop.products.barcodes.add")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
                    onClick={() => setScannerOpen(true)}
                  >
                    {t("app.shop.products.scan.open")}
                  </button>
                </div>
              </div>
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={barcodes}
                onChange={(e) => setBarcodes(e.target.value)}
                placeholder={t("app.shop.products.field.barcodes.placeholder")}
              />
              <div className="mt-2 text-xs text-gray-500">{t("app.shop.products.scan.externalHint")}</div>
            </div>
          </div>

          {editing ? (
            <div className="mt-8 space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
                <div className="text-sm font-semibold text-gray-900">{t("app.shop.products.pharmacy.title")}</div>
                <div className="mt-1 text-xs text-gray-600">{t("app.shop.products.pharmacy.subtitle")}</div>

                {loadingPharmacyProfile ? (
                  <div className="mt-4 text-sm text-gray-700">{t("common.loading")}</div>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={pharmacyTrackLots}
                          onChange={(e) => setPharmacyTrackLots(e.target.checked)}
                        />
                        {t("app.shop.products.pharmacy.trackLots")}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={pharmacyRequiresPrescription}
                          onChange={(e) => setPharmacyRequiresPrescription(e.target.checked)}
                        />
                        {t("app.shop.products.pharmacy.requiresPrescription")}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={pharmacyIsControlled}
                          onChange={(e) => setPharmacyIsControlled(e.target.checked)}
                        />
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
                  </>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
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
                    <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.variants.field.barcodes")}</label>
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
                          const res = await apiFetch(`/api/shop/products/${editing.id}/variants`, {
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
                          const vRes = await apiFetch(`/api/shop/products/${editing.id}/variants`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
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
                          <button
                            type="button"
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
                            onClick={() => openEdit(v)}
                          >
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
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={packBarcode} onChange={(e) => setPackBarcode(e.target.value)} />
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
                        const res = await apiFetch(`/api/shop/products/${editing.id}/packaging`, {
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
                        const pRes = await apiFetch(`/api/shop/products/${editing.id}/packaging`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
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
                              const res = await apiFetch(`/api/shop/products/${editing.id}/packaging/${p.id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
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
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {editing && editing.status === "active" ? (
              <button
                type="button"
                disabled={!tenantId || archivingId === editing.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => {
                  setDeleteTarget({ id: editing.id, origin: "modal" });
                  setDeleteDialogOpen(true);
                }}
              >
                {archivingId === editing.id ? t("app.shop.products.action.working") : t("app.shop.products.action.delete")}
              </button>
            ) : (
              <div />
            )}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              {editing ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => {
                    const list = barcodes
                      .split(/[,\n]/g)
                      .map((v) => v.trim())
                      .filter(Boolean);
                    const code = list[0] ?? (sku.trim() || null);
                    const payload = {
                      templateId: "40x30",
                      currencyCode: sellCurrencyCode,
                      items: [
                        {
                          productId: editing.id,
                          name: name.trim() || editing.name,
                          sku: sku.trim() || editing.sku || null,
                          unitSymbol: null,
                          sellPrice: sellPrice.trim() || editing.sellPrice,
                          barcode: code,
                          qty: 1
                        }
                      ]
                    };
                    const key = (() => {
                      try {
                        return crypto.randomUUID();
                      } catch {
                        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                      }
                    })();
                    localStorage.setItem(`labelsPrint:${key}`, JSON.stringify(payload));
                    window.open(`/t/${props.tenantSlug}/shop/labels/print?key=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
                  }}
                >
                  {t("app.shop.products.action.printLabel")}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setModalOpen(false)}
              >
                {t("common.button.cancel")}
              </button>
            </div>
            <button
              type="button"
              disabled={!tenantId || saving || name.trim().length < 2 || !sellPrice.trim()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId) return;
                setSaving(true);
                setErrorKey(null);
                try {
                  const list = barcodes
                    .split(/[,\n]/g)
                    .map((v) => v.trim())
                    .filter(Boolean);
                  const basePayload = {
                    name: name.trim(),
                    sku: sku.trim() || undefined,
                    description: description.trim() || undefined,
                    categoryId: productCategoryId || undefined,
                    sellPrice: sellPrice.trim(),
                    costPrice: costPrice.trim() || undefined,
                    barcodes: list.length ? list : undefined
                  };

                  if (editing) {
                    const payload = {
                      ...basePayload,
                      unitId: productUnitId || null,
                      imageFileId: productImage ? productImage.id : null,
                      categoryId: productCategoryId || null
                    };
                    const res = await apiFetch(`/api/shop/products/${editing.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                      body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                      const json = (await res.json()) as { error?: { message_key?: string } };
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }

                    const phRes = await apiFetch(`/api/shop/products/${editing.id}/pharmacy-profile`, {
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

                    const nextCategory = productCategoryId ? categories.find((c) => c.id === productCategoryId) ?? null : null;
                    const nextUnit = productUnitId ? units.find((u) => u.id === productUnitId) ?? null : null;
                    setItems((prev) =>
                      prev.map((p) =>
                        p.id === editing.id
                          ? {
                              ...p,
                              name: payload.name,
                              sku: payload.sku ?? null,
                              description: payload.description ?? p.description,
                              unit: nextUnit ? { id: nextUnit.id, name: nextUnit.name, symbol: nextUnit.symbol } : null,
                              image: productImage ? { id: productImage.id, url: productImage.url } : null,
                              sellPrice: payload.sellPrice,
                              costPrice: payload.costPrice ?? null,
                              category: nextCategory ? { id: nextCategory.id, name: nextCategory.name } : null,
                              barcodes: list
                            }
                          : p
                      )
                    );
                    setModalOpen(false);
                  } else {
                    const payload = {
                      ...basePayload,
                      ...(productUnitId ? { unitId: productUnitId } : {}),
                      ...(productImage ? { imageFileId: productImage.id } : {})
                    };
                    const res = await apiFetch(`/api/shop/products`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                      body: JSON.stringify(payload)
                    });
                    const json = (await res.json()) as { data?: Product; error?: { message_key?: string } };
                    if (!res.ok || !json.data) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }

                    const createdId = json.data.id;
                    const phRes = await apiFetch(`/api/shop/products/${createdId}/pharmacy-profile`, {
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
                      const errJson = (await phRes.json()) as { error?: { message_key?: string } };
                      setErrorKey(errJson.error?.message_key ?? "errors.internal");
                      return;
                    }

                    setItems((prev) => [json.data as Product, ...prev]);
                    setTotal((v) => v + 1);
                    setModalOpen(false);
                  }
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? t("app.shop.products.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          const v = code.trim();
          if (!v) return;
          setBarcodes((prev) => (prev ? `${prev}\n${v}` : v));
          setBarcodeEntry("");
        }}
      />

      <BarcodeScannerModal
        open={searchScannerOpen}
        onClose={() => setSearchScannerOpen(false)}
        onDetected={(code) => {
          const v = code.trim();
          if (!v) return;
          setPage(1);
          setQ(v);
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("app.shop.products.delete.title")}
        description={t("app.shop.products.delete.confirm")}
        confirmLabel={t("app.shop.products.action.delete")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={!!(deleteTarget && archivingId === deleteTarget.id)}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!tenantId || !deleteTarget) return;
          setArchivingId(deleteTarget.id);
          try {
            const res = await apiFetch(`/api/shop/products/${deleteTarget.id}`, {
              method: "DELETE",
              headers: { "X-Tenant-Id": tenantId }
            });
            if (!res.ok) return;
            setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
            setTotal((v) => Math.max(0, v - 1));
            if (deleteTarget.origin === "modal") {
              setModalOpen(false);
              setEditing(null);
            }
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
          } finally {
            setArchivingId(null);
          }
        }}
      />
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  );
}
