"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type ExpenseRow = {
  id: string;
  expenseDate: string;
  supplierId: string | null;
  supplierName: string | null;
  category: string;
  description: string | null;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = { data: { items: ExpenseRow[]; page: number; pageSize: number; total: number } };

type ExpenseAttachment = {
  id: string;
  createdAt: string;
  file: { id: string; url: string; originalName: string; contentType: string; sizeBytes: number; createdAt: string };
};

type ExpenseAttachmentsResponse = { data: { items: ExpenseAttachment[] } };

type RecurringExpenseRow = {
  id: string;
  isActive: boolean;
  nextRunAt: string;
  interval: "weekly" | "monthly" | "yearly";
  supplierId: string | null;
  supplierName: string | null;
  category: string;
  description: string | null;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type RecurringListResponse = { data: { items: RecurringExpenseRow[] } };

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

type SuppliersResponse = { data: { items: SupplierRow[] } };

export function PrintPressExpensesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);

  const [expenseDate, setExpenseDate] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringItems, setRecurringItems] = useState<RecurringExpenseRow[]>([]);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [recurringEditing, setRecurringEditing] = useState<RecurringExpenseRow | null>(null);
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringGeneratingId, setRecurringGeneratingId] = useState<string | null>(null);
  const [recurringConfirmOpen, setRecurringConfirmOpen] = useState(false);
  const [recurringConfirming, setRecurringConfirming] = useState(false);
  const [recurringDeleteId, setRecurringDeleteId] = useState<string | null>(null);

  const [recurringNextRunAt, setRecurringNextRunAt] = useState("");
  const [recurringInterval, setRecurringInterval] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [recurringIsActive, setRecurringIsActive] = useState<"true" | "false">("true");
  const [recurringSupplierId, setRecurringSupplierId] = useState<string>("");
  const [recurringCategory, setRecurringCategory] = useState("");
  const [recurringDescription, setRecurringDescription] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");

  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState<SupplierRow | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierConfirmOpen, setSupplierConfirmOpen] = useState(false);
  const [supplierConfirming, setSupplierConfirming] = useState(false);
  const [supplierDeleteId, setSupplierDeleteId] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");

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

  const loadList = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/printpress/expenses?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as ListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as ListResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPageSize(data.pageSize ?? 20);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [from, page, pageSize, q, tenantId, to]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadExpenseAttachments = useCallback(
    async (expenseId: string) => {
      if (!tenantId) return;
      setAttachmentsLoading(true);
      try {
        const res = await apiFetch(`/api/printpress/expenses/${expenseId}/attachments`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as ExpenseAttachmentsResponse | { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
          return;
        }
        setAttachments((json as ExpenseAttachmentsResponse).data.items ?? []);
      } catch {
        setAttachments([]);
      } finally {
        setAttachmentsLoading(false);
      }
    },
    [tenantId]
  );

  async function uploadExpenseAttachment(file: File) {
    if (!tenantId) return;
    if (!editing) return;
    setUploadingAttachment(true);
    setErrorKey(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await apiFetch("/api/files?purpose=printpress_expense_attachment", { method: "POST", headers: { "X-Tenant-Id": tenantId }, body: form });
      const uploadJson = (await uploadRes.json().catch(() => null)) as { data?: { id?: string } } | { error?: { message_key?: string } } | null;
      if (!uploadRes.ok) {
        setErrorKey((uploadJson as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
        return;
      }
      const fileId = (uploadJson as { data?: { id?: string } }).data?.id ?? null;
      if (!fileId) {
        setErrorKey("errors.internal");
        return;
      }

      const linkRes = await apiFetch(`/api/printpress/expenses/${editing.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ fileId })
      });
      const linkJson = (await linkRes.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!linkRes.ok) {
        setErrorKey(linkJson?.error?.message_key ?? "errors.internal");
        return;
      }

      await loadExpenseAttachments(editing.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function removeExpenseAttachment(attachmentId: string) {
    if (!tenantId) return;
    if (!editing) return;
    setRemovingAttachmentId(attachmentId);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/expenses/${editing.id}/attachments/${attachmentId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      await loadExpenseAttachments(editing.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setRemovingAttachmentId(null);
    }
  }

  const loadRecurring = useCallback(async () => {
    if (!tenantId) return;
    setRecurringLoading(true);
    try {
      const res = await apiFetch("/api/printpress/recurring-expenses", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as RecurringListResponse | { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
        return;
      }
      setRecurringItems((json as RecurringListResponse).data.items ?? []);
    } catch {
      setRecurringItems([]);
    } finally {
      setRecurringLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring]);

  const loadSuppliers = useCallback(async () => {
    if (!tenantId) return;
    setSuppliersLoading(true);
    try {
      const res = await apiFetch("/api/printpress/suppliers", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as SuppliersResponse | { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
        return;
      }
      setSuppliers((json as SuppliersResponse).data.items ?? []);
    } catch {
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  function openCreate() {
    setEditing(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setSupplierId("");
    setCategory("");
    setDescription("");
    setAmount("");
    setAttachments([]);
    setModalOpen(true);
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row);
    setExpenseDate(new Date(row.expenseDate).toISOString().slice(0, 10));
    setSupplierId(row.supplierId ?? "");
    setCategory(row.category);
    setDescription(row.description ?? "");
    setAmount(row.amount);
    setAttachments([]);
    void loadExpenseAttachments(row.id);
    setModalOpen(true);
  }

  function openRecurringCreate() {
    setRecurringEditing(null);
    setRecurringNextRunAt(new Date().toISOString().slice(0, 10));
    setRecurringInterval("monthly");
    setRecurringIsActive("true");
    setRecurringSupplierId("");
    setRecurringCategory("");
    setRecurringDescription("");
    setRecurringAmount("");
    setRecurringModalOpen(true);
  }

  function openRecurringEdit(row: RecurringExpenseRow) {
    setRecurringEditing(row);
    setRecurringNextRunAt(new Date(row.nextRunAt).toISOString().slice(0, 10));
    setRecurringInterval(row.interval);
    setRecurringIsActive(row.isActive ? "true" : "false");
    setRecurringSupplierId(row.supplierId ?? "");
    setRecurringCategory(row.category);
    setRecurringDescription(row.description ?? "");
    setRecurringAmount(row.amount);
    setRecurringModalOpen(true);
  }

  async function saveRecurring() {
    if (!tenantId) return;
    const cat = recurringCategory.trim();
    const amt = recurringAmount.trim();
    if (!cat || !amt) {
      setErrorKey("errors.validation");
      return;
    }
    setRecurringSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        nextRunAt: recurringNextRunAt ? new Date(recurringNextRunAt).toISOString() : undefined,
        interval: recurringInterval,
        isActive: recurringIsActive,
        supplierId: recurringSupplierId || undefined,
        category: cat,
        description: recurringDescription.trim() || undefined,
        amount: amt
      };
      const res = recurringEditing
        ? await apiFetch(`/api/printpress/recurring-expenses/${recurringEditing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch("/api/printpress/recurring-expenses", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });

      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setRecurringModalOpen(false);
      await loadRecurring();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setRecurringSaving(false);
    }
  }

  function askDeleteRecurring(id: string) {
    setRecurringDeleteId(id);
    setRecurringConfirmOpen(true);
  }

  async function confirmDeleteRecurring() {
    if (!tenantId || !recurringDeleteId) return;
    setRecurringConfirming(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/recurring-expenses/${recurringDeleteId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setRecurringConfirmOpen(false);
      await loadRecurring();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setRecurringConfirming(false);
    }
  }

  async function generateRecurring(id: string) {
    if (!tenantId) return;
    setRecurringGeneratingId(id);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/recurring-expenses/${id}/generate`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      await Promise.all([loadRecurring(), loadList()]);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setRecurringGeneratingId(null);
    }
  }

  function openSupplierCreate() {
    setSupplierEditing(null);
    setSupplierName("");
    setSupplierPhone("");
    setSupplierEmail("");
    setSupplierAddress("");
    setSupplierModalOpen(true);
  }

  function openSupplierEdit(row: SupplierRow) {
    setSupplierEditing(row);
    setSupplierName(row.name);
    setSupplierPhone(row.phone ?? "");
    setSupplierEmail(row.email ?? "");
    setSupplierAddress(row.address ?? "");
    setSupplierModalOpen(true);
  }

  async function saveSupplier() {
    if (!tenantId) return;
    const name = supplierName.trim();
    if (name.length < 2) {
      setErrorKey("errors.validation");
      return;
    }
    setSupplierSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        name,
        phone: supplierPhone.trim() || undefined,
        email: supplierEmail.trim() || undefined,
        address: supplierAddress.trim() || undefined
      };
      const res = supplierEditing
        ? await apiFetch(`/api/printpress/suppliers/${supplierEditing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) })
        : await apiFetch("/api/printpress/suppliers", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setSupplierModalOpen(false);
      await Promise.all([loadSuppliers(), loadList(), loadRecurring()]);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSupplierSaving(false);
    }
  }

  function askDeleteSupplier(id: string) {
    setSupplierDeleteId(id);
    setSupplierConfirmOpen(true);
  }

  async function confirmDeleteSupplier() {
    if (!tenantId || !supplierDeleteId) return;
    setSupplierConfirming(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/suppliers/${supplierDeleteId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      if (supplierId === supplierDeleteId) setSupplierId("");
      if (recurringSupplierId === supplierDeleteId) setRecurringSupplierId("");
      setSupplierConfirmOpen(false);
      await Promise.all([loadSuppliers(), loadList(), loadRecurring()]);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSupplierConfirming(false);
    }
  }

  async function save() {
    if (!tenantId) return;
    const cat = category.trim();
    const amt = amount.trim();
    if (!cat || !amt) {
      setErrorKey("errors.validation");
      return;
    }
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        expenseDate: expenseDate ? new Date(expenseDate).toISOString() : undefined,
        supplierId: supplierId || undefined,
        category: cat,
        description: description.trim() || undefined,
        amount: amt
      };
      const res = editing
        ? await apiFetch(`/api/printpress/expenses/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch("/api/printpress/expenses", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });

      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  function askDelete(id: string) {
    setDeleteId(id);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!tenantId || !deleteId) return;
    setConfirming(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/expenses/${deleteId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setConfirmOpen(false);
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.expenses.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.expenses.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.expenses.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.printpress.expenses.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.filter.from")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.filter.to")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.date")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.supplier")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.description")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.amount")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.actions")}</th>
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
                    {t("app.printpress.expenses.empty")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(row.expenseDate).toLocaleDateString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{row.category}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.supplierName ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.description ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.amount}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openEdit(row)}
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => askDelete(row.id)}
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-600">
            {t("common.pagination.page")} {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.pagination.prev")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.expenses.recurring.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.expenses.recurring.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openRecurringCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.expenses.recurring.action.create")}
          </button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("common.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.recurring.table.nextRunAt")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.recurring.table.interval")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.supplier")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.amount")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.expenses.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {recurringLoading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : recurringItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("app.printpress.expenses.recurring.empty")}
                  </td>
                </tr>
              ) : (
                recurringItems.map((r) => (
                  <tr key={r.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.isActive ? t("common.status.active") : t("common.status.inactive")}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(r.nextRunAt).toLocaleDateString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.printpress.expenses.recurring.interval.${r.interval}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.supplierName ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{r.category}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.amount}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!r.isActive || recurringGeneratingId === r.id}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                          onClick={() => void generateRecurring(r.id)}
                        >
                          {t("app.printpress.expenses.recurring.action.generate")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openRecurringEdit(r)}
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => askDeleteRecurring(r.id)}
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.suppliers.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.suppliers.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openSupplierCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.suppliers.action.create")}
          </button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.suppliers.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.suppliers.table.phone")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.suppliers.table.email")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.suppliers.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {suppliersLoading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("app.printpress.suppliers.empty")}
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.phone ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.email ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openSupplierEdit(s)}
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => askDeleteSupplier(s.id)}
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{editing ? t("app.printpress.expenses.modal.edit") : t("app.printpress.expenses.modal.create")}</div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.date")}</label>
                <input
                  type="date"
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.amount")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.supplier")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{t("common.optional")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.category")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.description")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {editing ? (
              <div>
                <div className="flex items-center justify-between gap-4">
                  <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.attachments.title")}</label>
                  <input
                    type="file"
                    disabled={!tenantId || uploadingAttachment}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!f) return;
                      void uploadExpenseAttachment(f);
                    }}
                    className="block w-[260px] text-xs text-gray-700 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-gray-900 hover:file:bg-gray-200 disabled:opacity-60"
                  />
                </div>

                {attachmentsLoading ? (
                  <div className="mt-3 text-sm text-gray-600">{t("common.loading")}</div>
                ) : attachments.length === 0 ? (
                  <div className="mt-3 text-sm text-gray-600">{t("app.printpress.expenses.attachments.empty")}</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <a href={a.file.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium text-primary-700 hover:underline">
                          {a.file.originalName}
                        </a>
                        <button
                          type="button"
                          disabled={removingAttachmentId === a.id}
                          onClick={() => void removeExpenseAttachment(a.id)}
                          className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || saving}
                onClick={save}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={recurringModalOpen} onClose={() => setRecurringModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">
              {recurringEditing ? t("app.printpress.expenses.recurring.modal.edit") : t("app.printpress.expenses.recurring.modal.create")}
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setRecurringModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.recurring.field.nextRunAt")}</label>
                <input
                  type="date"
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={recurringNextRunAt}
                  onChange={(e) => setRecurringNextRunAt(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.recurring.field.interval")}</label>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={recurringInterval}
                  onChange={(e) => setRecurringInterval(e.target.value as "weekly" | "monthly" | "yearly")}
                >
                  <option value="weekly">{t("app.printpress.expenses.recurring.interval.weekly")}</option>
                  <option value="monthly">{t("app.printpress.expenses.recurring.interval.monthly")}</option>
                  <option value="yearly">{t("app.printpress.expenses.recurring.interval.yearly")}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.supplier")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={recurringSupplierId}
                onChange={(e) => setRecurringSupplierId(e.target.value)}
              >
                <option value="">{t("common.optional")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.category")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={recurringCategory}
                  onChange={(e) => setRecurringCategory(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.amount")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={recurringAmount}
                  onChange={(e) => setRecurringAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.expenses.field.description")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={recurringDescription}
                onChange={(e) => setRecurringDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("common.status")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={recurringIsActive}
                onChange={(e) => setRecurringIsActive(e.target.value as "true" | "false")}
              >
                <option value="true">{t("common.status.active")}</option>
                <option value="false">{t("common.status.inactive")}</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRecurringModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || recurringSaving}
                onClick={saveRecurring}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {recurringSaving ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{supplierEditing ? t("app.printpress.suppliers.modal.edit") : t("app.printpress.suppliers.modal.create")}</div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setSupplierModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.suppliers.field.name")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.suppliers.field.phone")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.suppliers.field.email")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.suppliers.field.address")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={supplierAddress}
                onChange={(e) => setSupplierAddress(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSupplierModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || supplierSaving}
                onClick={saveSupplier}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {supplierSaving ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={t("app.printpress.expenses.confirm.delete.title")}
        description={t("app.printpress.expenses.confirm.delete.description")}
        confirmLabel={t("common.button.remove")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={confirming}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={recurringConfirmOpen}
        title={t("app.printpress.expenses.recurring.confirm.delete.title")}
        description={t("app.printpress.expenses.recurring.confirm.delete.description")}
        confirmLabel={t("common.button.remove")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={recurringConfirming}
        onConfirm={confirmDeleteRecurring}
        onCancel={() => setRecurringConfirmOpen(false)}
      />

      <ConfirmDialog
        open={supplierConfirmOpen}
        title={t("app.printpress.suppliers.confirm.delete.title")}
        description={t("app.printpress.suppliers.confirm.delete.description")}
        confirmLabel={t("common.button.remove")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={supplierConfirming}
        onConfirm={confirmDeleteSupplier}
        onCancel={() => setSupplierConfirmOpen(false)}
      />
    </div>
  );
}
