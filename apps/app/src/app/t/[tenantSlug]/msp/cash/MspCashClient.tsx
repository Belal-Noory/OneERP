"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Currency = { id: string; code: string; name: string; isActive: boolean };
type CurrenciesResponse = { data: Currency[] };
type Branch = { id: string; name: string; isActive: boolean };
type BranchesResponse = { data: Array<{ id: string; name: string; isActive: boolean }> };

type Account = { id: string; type: "cash" | "bank" | string; name: string; currencyCode: string; branchId: string | null; isActive: boolean; updatedAt: string; balance: string };
type AccountsResponse = { data: Account[] };

type CashSession = {
  id: string;
  accountId: string;
  accountName: string;
  currencyCode: string;
  status: "open" | "closed" | string;
  openedAt: string;
  closedAt: string | null;
  openedBookBalance: string;
  closedBookBalance: string | null;
  countedAmount: string | null;
  variance: string | null;
  denominations: Array<{ value: string; qty: number; amount?: string }>;
  note: string | null;
};
type CashSessionsResponse = { data: { page: number; pageSize: number; total: number; items: CashSession[] } };

type BankStatement = {
  id: string;
  statementFrom: string;
  statementTo: string;
  openingBalance: string;
  closingBalance: string;
  status: "open" | "locked" | string;
  lockedAt: string | null;
  note: string | null;
  createdAt: string;
};
type BankStatementsResponse = { data: { accountId: string; currencyCode: string; items: BankStatement[] } };

type BankLedgerItem = { ledgerEntryId: string; entryDate: string; occurredAt: string; amountSigned: string; source: string; ref: string | null; note: string | null };
type BankStatementLine = {
  id: string;
  rowIndex: number;
  lineDate: string;
  description: string | null;
  reference: string | null;
  amountSigned: string;
  balance: string | null;
  match: BankLedgerItem | null;
  suggestions: BankLedgerItem[];
};
type BankStatementLinesResponse = {
  data: {
    statement: { id: string; accountId: string; currencyCode: string; statementFrom: string; statementTo: string; status: string };
    page: number;
    pageSize: number;
    total: number;
    items: BankStatementLine[];
    ledger: BankLedgerItem[];
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toIsoDateTime(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function parseAnyDateToIsoDate(v: unknown): string | null {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && Number.isFinite(v)) {
    const utcMs = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseSignedMoneyString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/,/g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
}

export function MspCashClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const activeBranches = useMemo(() => branches.filter((b) => b.isActive), [branches]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);

  const [typeFilter, setTypeFilter] = useState<"all" | "cash" | "bank">("all");
  const filteredAccounts = useMemo(() => {
    const list = typeFilter === "all" ? accounts : accounts.filter((a) => a.type === typeFilter);
    return list;
  }, [accounts, typeFilter]);

  const [openSessionsByAccountId, setOpenSessionsByAccountId] = useState<Record<string, CashSession>>({});
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionAccount, setSessionAccount] = useState<Account | null>(null);
  const [sessionOpenAt, setSessionOpenAt] = useState("");
  const [sessionCloseAt, setSessionCloseAt] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [denoms, setDenoms] = useState<Array<{ value: string; qty: number }>>([{ value: "", qty: 0 }]);

  const [reconModalOpen, setReconModalOpen] = useState(false);
  const [reconSaving, setReconSaving] = useState(false);
  const [reconAccount, setReconAccount] = useState<Account | null>(null);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string>("");
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [statementStatus, setStatementStatus] = useState<"open" | "locked" | string>("open");
  const [statementPage, setStatementPage] = useState(1);
  const [statementPageSize, setStatementPageSize] = useState(200);
  const [statementTotal, setStatementTotal] = useState(0);
  const [statementMatchFilter, setStatementMatchFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [importReplace, setImportReplace] = useState(true);
  const [importPreviewCount, setImportPreviewCount] = useState(0);
  const [importLines, setImportLines] = useState<Array<{ lineDate: string; description: string; reference: string; amountSigned: string; balance: string }>>([]);
  const [newStatementForm, setNewStatementForm] = useState<{ from: string; to: string; openingBalance: string; closingBalance: string; note: string }>({
    from: isoDate(new Date()),
    to: isoDate(new Date()),
    openingBalance: "",
    closingBalance: "",
    note: ""
  });
  const [adjustModalOpen2, setAdjustModalOpen2] = useState(false);
  const [adjustLine, setAdjustLine] = useState<BankStatementLine | null>(null);
  const [adjust2, setAdjust2] = useState<{ amountSigned: string; entryDate: string; note: string }>({ amountSigned: "", entryDate: isoDate(new Date()), note: "" });

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<{ type: "cash" | "bank"; name: string; currencyCode: string; branchId: string; isActive: boolean; openingBalance: string }>({
    type: "cash",
    name: "",
    currencyCode: "AFN",
    branchId: "",
    isActive: true,
    openingBalance: ""
  });

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferForm, setTransferForm] = useState<{ fromAccountId: string; toAccountId: string; amount: string; transferDate: string; note: string }>({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    transferDate: isoDate(new Date()),
    note: ""
  });

  const transferFromAccount = useMemo(() => activeAccounts.find((a) => a.id === transferForm.fromAccountId) ?? null, [activeAccounts, transferForm.fromAccountId]);
  const transferToOptions = useMemo(() => {
    const currency = transferFromAccount?.currencyCode ?? null;
    return activeAccounts.filter((a) => a.id !== transferForm.fromAccountId && (!currency || a.currencyCode === currency));
  }, [activeAccounts, transferForm.fromAccountId, transferFromAccount?.currencyCode]);

  useEffect(() => {
    if (!transferForm.toAccountId) return;
    const stillValid = transferToOptions.some((a) => a.id === transferForm.toAccountId);
    if (!stillValid) {
      setTransferForm((p) => ({ ...p, toAccountId: "" }));
    }
  }, [transferForm.toAccountId, transferToOptions]);

  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustForm, setAdjustForm] = useState<{ accountId: string; direction: "in" | "out"; amount: string; entryDate: string; note: string }>({
    accountId: "",
    direction: "in",
    amount: "",
    entryDate: isoDate(new Date()),
    note: ""
  });

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  const loadSetup = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const [currRes, branchRes] = await Promise.all([
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/branches", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const currJson = (await currRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      const branchJson = (await branchRes.json()) as BranchesResponse | { error?: { message_key?: string } };
      if (!currRes.ok) {
        setErrorKey((currJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!branchRes.ok) {
        setErrorKey((branchJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const list = (currJson as CurrenciesResponse).data ?? [];
      setCurrencies(list.map((c) => ({ id: c.id, code: c.code, name: c.name, isActive: c.isActive })));
      setBranches((branchJson as BranchesResponse).data ?? []);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadAccounts = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as AccountsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setAccounts(((json as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadOpenSessions = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("status", "open");
      p.set("page", "1");
      p.set("pageSize", "200");
      const res = await apiFetch(`/api/msp/cash/sessions?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as CashSessionsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const items = (json as CashSessionsResponse).data.items ?? [];
      const by: Record<string, CashSession> = {};
      for (const s of items) {
        if (s.status === "open") by[s.accountId] = s;
      }
      setOpenSessionsByAccountId(by);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadBankStatements = useCallback(
    async (accountId: string) => {
      if (!tenantId) return;
      setErrorKey(null);
      try {
        const p = new URLSearchParams();
        p.set("accountId", accountId);
        const res = await apiFetch(`/api/msp/bank/statements?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as BankStatementsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as BankStatementsResponse).data;
        setStatements(data.items ?? []);
      } catch {
        setErrorKey("errors.internal");
      }
    },
    [tenantId]
  );

  const loadStatementLines = useCallback(
    async (statementId: string, opts?: { page?: number; pageSize?: number; match?: "all" | "matched" | "unmatched" }) => {
      if (!tenantId) return;
      setErrorKey(null);
      try {
        const p = new URLSearchParams();
        p.set("page", String(opts?.page ?? statementPage));
        p.set("pageSize", String(opts?.pageSize ?? statementPageSize));
        p.set("match", opts?.match ?? statementMatchFilter);
        const res = await apiFetch(`/api/msp/bank/statements/${encodeURIComponent(statementId)}/lines?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as BankStatementLinesResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as BankStatementLinesResponse).data;
        setSelectedStatementId(statementId);
        setStatementLines(data.items ?? []);
        setStatementStatus(data.statement.status);
        setStatementPage(data.page);
        setStatementPageSize(data.pageSize);
        setStatementTotal(data.total);
      } catch {
        setErrorKey("errors.internal");
      }
    },
    [statementMatchFilter, statementPage, statementPageSize, tenantId]
  );

  const openReconcile = async (a: Account) => {
    setReconAccount(a);
    setStatements([]);
    setSelectedStatementId("");
    setStatementLines([]);
    setStatementStatus("open");
    setStatementPage(1);
    setStatementPageSize(200);
    setStatementTotal(0);
    setStatementMatchFilter("all");
    setImportPreviewCount(0);
    setImportLines([]);
    setNewStatementForm({ from: isoDate(new Date()), to: isoDate(new Date()), openingBalance: "", closingBalance: "", note: "" });
    setReconModalOpen(true);
    await loadBankStatements(a.id);
  };

  const createStatement = async () => {
    if (!tenantId || !reconAccount) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        accountId: reconAccount.id,
        statementFrom: newStatementForm.from,
        statementTo: newStatementForm.to,
        openingBalance: newStatementForm.openingBalance.trim() ? newStatementForm.openingBalance.trim() : undefined,
        closingBalance: newStatementForm.closingBalance.trim() ? newStatementForm.closingBalance.trim() : undefined,
        note: newStatementForm.note.trim() ? newStatementForm.note.trim() : undefined
      };
      const res = await apiFetch("/api/msp/bank/statements", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      const id = json.data?.id ?? "";
      await loadBankStatements(reconAccount.id);
      if (id) await loadStatementLines(id, { page: 1 });
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const parseStatementFile = async (file: File) => {
    setReconSaving(true);
    setErrorKey(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!rows.length) {
        setImportLines([]);
        setImportPreviewCount(0);
        return;
      }
      const keys = Object.keys(rows[0]).map((k) => k.trim());
      const lower = keys.map((k) => k.toLowerCase());
      const findKey = (pred: (k: string) => boolean) => {
        const idx = lower.findIndex(pred);
        return idx >= 0 ? keys[idx] : null;
      };
      const dateKey = findKey((k) => k.includes("date"));
      const descKey = findKey((k) => k.includes("desc") || k.includes("detail") || k.includes("narr") || k.includes("memo"));
      const refKey = findKey((k) => k.includes("ref") || k.includes("reference") || k.includes("id"));
      const amountKey = findKey((k) => k === "amount" || k.includes("amount"));
      const debitKey = findKey((k) => k.includes("debit") || k.includes("withdraw"));
      const creditKey = findKey((k) => k.includes("credit") || k.includes("deposit"));
      const balanceKey = findKey((k) => k.includes("balance"));

      const out: Array<{ lineDate: string; description: string; reference: string; amountSigned: string; balance: string }> = [];
      for (const r of rows) {
        const lineDate = parseAnyDateToIsoDate(dateKey ? r[dateKey] : (r[keys[0]] as unknown));
        if (!lineDate) continue;

        let amountSigned: string | null = null;
        if (amountKey) {
          amountSigned = parseSignedMoneyString(r[amountKey]);
        } else if (debitKey || creditKey) {
          const debit = parseSignedMoneyString(debitKey ? r[debitKey] : "");
          const credit = parseSignedMoneyString(creditKey ? r[creditKey] : "");
          const d = debit ? Number(debit) : 0;
          const c = credit ? Number(credit) : 0;
          if (!Number.isFinite(d) || !Number.isFinite(c)) continue;
          amountSigned = String(c - d);
        }
        if (!amountSigned) continue;

        const description = String(descKey ? r[descKey] : "").trim();
        const reference = String(refKey ? r[refKey] : "").trim();
        const balance = parseSignedMoneyString(balanceKey ? r[balanceKey] : "") ?? "";
        out.push({ lineDate, description, reference, amountSigned, balance });
      }
      setImportLines(out);
      setImportPreviewCount(out.length);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const uploadImportLines = async () => {
    if (!tenantId || !selectedStatementId) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        replace: importReplace,
        lines: importLines.map((l) => ({
          lineDate: l.lineDate,
          description: l.description.trim() ? l.description.trim() : undefined,
          reference: l.reference.trim() ? l.reference.trim() : undefined,
          amountSigned: l.amountSigned,
          balance: l.balance.trim() ? l.balance.trim() : undefined
        }))
      };
      const res = await apiFetch(`/api/msp/bank/statements/${encodeURIComponent(selectedStatementId)}/import-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setImportLines([]);
      setImportPreviewCount(0);
      await loadStatementLines(selectedStatementId, { page: 1 });
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const autoMatch = async () => {
    if (!tenantId || !selectedStatementId) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/msp/bank/statements/${encodeURIComponent(selectedStatementId)}/auto-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({})
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadStatementLines(selectedStatementId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const setMatch = async (lineId: string, ledgerEntryId: string | null) => {
    if (!tenantId) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const payload = { ledgerEntryId: ledgerEntryId ?? undefined };
      const res = await apiFetch(`/api/msp/bank/statement-lines/${encodeURIComponent(lineId)}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      if (selectedStatementId) await loadStatementLines(selectedStatementId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const lockStatement = async (lock: boolean) => {
    if (!tenantId || !selectedStatementId) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/msp/bank/statements/${encodeURIComponent(selectedStatementId)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ lock })
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadBankStatements(reconAccount?.id ?? "");
      await loadStatementLines(selectedStatementId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  const openLineAdjustment = (l: BankStatementLine) => {
    setAdjustLine(l);
    setAdjust2({ amountSigned: l.amountSigned, entryDate: l.lineDate, note: "" });
    setAdjustModalOpen2(true);
  };

  const saveLineAdjustment = async () => {
    if (!tenantId || !adjustLine) return;
    setReconSaving(true);
    setErrorKey(null);
    try {
      const payload = { amountSigned: adjust2.amountSigned, entryDate: adjust2.entryDate, note: adjust2.note.trim() ? adjust2.note.trim() : undefined };
      const res = await apiFetch(`/api/msp/bank/statement-lines/${encodeURIComponent(adjustLine.id)}/adjustment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setAdjustModalOpen2(false);
      setAdjustLine(null);
      if (selectedStatementId) await loadStatementLines(selectedStatementId);
      await loadAccounts();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReconSaving(false);
    }
  };

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadOpenSessions();
  }, [loadOpenSessions]);

  const openCreateAccount = () => {
    const currency = activeCurrencies.find((c) => c.code === "AFN")?.code ?? activeCurrencies[0]?.code ?? "AFN";
    setEditingAccountId(null);
    setAccountForm({ type: "cash", name: "", currencyCode: currency, branchId: "", isActive: true, openingBalance: "" });
    setAccountModalOpen(true);
  };

  const openEditAccount = (a: Account) => {
    setEditingAccountId(a.id);
    setAccountForm({ type: (a.type as "cash" | "bank") ?? "cash", name: a.name ?? "", currencyCode: a.currencyCode ?? "AFN", branchId: a.branchId ?? "", isActive: !!a.isActive, openingBalance: "" });
    setAccountModalOpen(true);
  };

  const saveAccount = async () => {
    if (!tenantId) return;
    setAccountSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        type: accountForm.type,
        name: accountForm.name,
        currencyCode: accountForm.currencyCode,
        branchId: accountForm.branchId.trim() ? accountForm.branchId : undefined,
        isActive: accountForm.isActive,
        openingBalance: !editingAccountId ? (accountForm.openingBalance.trim() ? accountForm.openingBalance.trim() : undefined) : undefined
      };
      const res = await apiFetch(editingAccountId ? `/api/msp/accounts/${encodeURIComponent(editingAccountId)}` : "/api/msp/accounts", {
        method: editingAccountId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setAccountModalOpen(false);
      await loadAccounts();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setAccountSaving(false);
    }
  };

  const openTransfer = (from?: Account) => {
    setTransferForm((p) => ({ ...p, fromAccountId: from?.id ?? "", toAccountId: "", amount: "", transferDate: isoDate(new Date()), note: "" }));
    setTransferModalOpen(true);
  };

  const saveTransfer = async () => {
    if (!tenantId) return;
    setTransferSaving(true);
    setErrorKey(null);
    try {
      const payload = { ...transferForm, note: transferForm.note.trim() || undefined };
      const res = await apiFetch("/api/msp/accounts/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setTransferModalOpen(false);
      await loadAccounts();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setTransferSaving(false);
    }
  };

  const openAdjust = (a: Account) => {
    setAdjustForm({ accountId: a.id, direction: "in", amount: "", entryDate: isoDate(new Date()), note: "" });
    setAdjustModalOpen(true);
  };

  const openCashSessionModal = (a: Account) => {
    setErrorKey(null);
    setSessionAccount(a);
    setSessionNote("");
    setDenoms([{ value: "", qty: 0 }]);
    setSessionOpenAt(new Date().toISOString().slice(0, 16));
    setSessionCloseAt(new Date().toISOString().slice(0, 16));
    setSessionModalOpen(true);
  };

  const saveSessionOpen = async () => {
    if (!tenantId || !sessionAccount) return;
    setSessionSaving(true);
    setErrorKey(null);
    try {
      const openedAt = toIsoDateTime(sessionOpenAt);
      const payload = { accountId: sessionAccount.id, openedAt: openedAt ?? undefined, note: sessionNote.trim() || undefined };
      const res = await apiFetch("/api/msp/cash/sessions/open", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await Promise.all([loadAccounts(), loadOpenSessions()]);
      setSessionModalOpen(false);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSessionSaving(false);
    }
  };

  const saveSessionClose = async () => {
    if (!tenantId || !sessionAccount) return;
    const openSession = openSessionsByAccountId[sessionAccount.id];
    if (!openSession) return;
    setSessionSaving(true);
    setErrorKey(null);
    try {
      const closedAt = toIsoDateTime(sessionCloseAt);
      const payload = { closedAt: closedAt ?? undefined, note: sessionNote.trim() || undefined, denominations: denoms.map((d) => ({ value: (d.value ?? "").trim(), qty: Number.isFinite(d.qty) ? Math.trunc(d.qty) : 0 })) };
      const res = await apiFetch(`/api/msp/cash/sessions/${encodeURIComponent(openSession.id)}/close`, { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await Promise.all([loadAccounts(), loadOpenSessions()]);
      setSessionModalOpen(false);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSessionSaving(false);
    }
  };

  const saveAdjust = async () => {
    if (!tenantId) return;
    setAdjustSaving(true);
    setErrorKey(null);
    try {
      const payload = { ...adjustForm, note: adjustForm.note.trim() || undefined };
      const res = await apiFetch("/api/msp/accounts/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setAdjustModalOpen(false);
      await loadAccounts();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setAdjustSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.cash.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.cash.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void loadAccounts()}>
              {t("common.button.refresh")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={openCreateAccount}>
              {t("app.msp.cash.newAccount")}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium ${typeFilter === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"}`} onClick={() => setTypeFilter("all")}>
            {t("common.filter.all")}
          </button>
          <button type="button" className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium ${typeFilter === "cash" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"}`} onClick={() => setTypeFilter("cash")}>
            {t("app.msp.cash.filter.cash")}
          </button>
          <button type="button" className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium ${typeFilter === "bank" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"}`} onClick={() => setTypeFilter("bank")}>
            {t("app.msp.cash.filter.bank")}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.cash.table.type")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.cash.table.name")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.cash.table.currency")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.cash.table.balance")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.cash.table.status")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.cash.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.cash.accounts.empty")}
                </td>
              </tr>
            ) : (
              filteredAccounts.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{a.type?.toUpperCase()}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-700">{a.currencyCode}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{a.balance}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{a.isActive ? t("common.status.active") : t("common.status.inactive")}</span>
                      {a.type === "cash" && openSessionsByAccountId[a.id] ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t("app.msp.cash.session.openBadge")}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {a.type === "cash" ? (
                        <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openCashSessionModal(a)}>
                          {t("app.msp.cash.action.session")}
                        </button>
                      ) : null}
                      {a.type === "bank" ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => void openReconcile(a)}
                        >
                          {t("app.msp.cash.action.reconcile")}
                        </button>
                      ) : null}
                      <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openAdjust(a)}>
                        {t("app.msp.cash.action.adjust")}
                      </button>
                      <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openTransfer(a)}>
                        {t("app.msp.cash.action.transfer")}
                      </button>
                      <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openEditAccount(a)}>
                        {t("common.button.edit")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={accountModalOpen} onClose={() => (!accountSaving ? setAccountModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{editingAccountId ? t("app.msp.cash.account.editTitle") : t("app.msp.cash.account.createTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.cash.account.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.account.field.type")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={accountForm.type} onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value as "cash" | "bank" }))} disabled={accountSaving || !!editingAccountId}>
                <option value="cash">{t("app.msp.cash.filter.cash")}</option>
                <option value="bank">{t("app.msp.cash.filter.bank")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.account.field.currency")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={accountForm.currencyCode} onChange={(e) => setAccountForm((p) => ({ ...p, currencyCode: e.target.value }))} disabled={accountSaving || !!editingAccountId}>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.account.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} disabled={accountSaving} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.account.field.branch")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={accountForm.branchId} onChange={(e) => setAccountForm((p) => ({ ...p, branchId: e.target.value }))} disabled={accountSaving}>
                <option value="">{t("app.msp.cash.branch.none")}</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {!editingAccountId ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.account.field.openingBalance")}</label>
                <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={accountForm.openingBalance} onChange={(e) => setAccountForm((p) => ({ ...p, openingBalance: e.target.value }))} disabled={accountSaving} />
              </div>
            ) : null}

            <div className="md:col-span-2 flex items-end gap-2">
              <input id="msp_account_active" type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={accountForm.isActive} onChange={(e) => setAccountForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={accountSaving} />
              <label htmlFor="msp_account_active" className="text-sm text-gray-700">
                {t("app.msp.cash.account.field.active")}
              </label>
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setAccountModalOpen(false)} disabled={accountSaving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveAccount()} disabled={accountSaving}>
              {accountSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={sessionModalOpen} onClose={() => (!sessionSaving ? setSessionModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.cash.session.title")}</div>
          <div className="mt-2 text-sm text-gray-700">
            {sessionAccount ? `${sessionAccount.name} (${sessionAccount.currencyCode})` : null}
          </div>

          {sessionAccount && openSessionsByAccountId[sessionAccount.id] ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.session.field.closedAt")}</label>
                  <input type="datetime-local" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={sessionCloseAt} onChange={(e) => setSessionCloseAt(e.target.value)} disabled={sessionSaving} />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.session.field.note")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} disabled={sessionSaving} />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">{t("app.msp.cash.session.denom.value")}</th>
                      <th className="px-4 py-3 text-right">{t("app.msp.cash.session.denom.qty")}</th>
                      <th className="px-4 py-3 text-right">{t("app.msp.cash.session.denom.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {denoms.map((d, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <input className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={d.value} onChange={(e) => setDenoms((p) => p.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} disabled={sessionSaving} />
                        </td>
                        <td className="px-4 py-3">
                          <input className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="numeric" value={String(d.qty)} onChange={(e) => setDenoms((p) => p.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))} disabled={sessionSaving} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => setDenoms((p) => p.filter((_, i) => i !== idx))}
                            disabled={sessionSaving || denoms.length <= 1}
                          >
                            {t("common.button.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setDenoms((p) => [...p, { value: "", qty: 0 }])} disabled={sessionSaving}>
                  {t("common.button.add")}
                </button>
              </div>
            </div>
          ) : sessionAccount ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.session.field.openedAt")}</label>
                <input type="datetime-local" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={sessionOpenAt} onChange={(e) => setSessionOpenAt(e.target.value)} disabled={sessionSaving} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.session.field.note")}</label>
                <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} disabled={sessionSaving} />
              </div>
            </div>
          ) : null}

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setSessionModalOpen(false)} disabled={sessionSaving}>
              {t("common.button.cancel")}
            </button>
            {sessionAccount && openSessionsByAccountId[sessionAccount.id] ? (
              <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveSessionClose()} disabled={sessionSaving}>
                {sessionSaving ? t("common.working") : t("app.msp.cash.session.close")}
              </button>
            ) : sessionAccount ? (
              <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveSessionOpen()} disabled={sessionSaving}>
                {sessionSaving ? t("common.working") : t("app.msp.cash.session.open")}
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal open={reconModalOpen} onClose={() => (!reconSaving ? setReconModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.cash.reconcile.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{reconAccount ? `${reconAccount.name} (${reconAccount.currencyCode})` : null}</div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="w-full md:max-w-md">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.statement")}</label>
              <select
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={selectedStatementId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedStatementId(id);
                  if (id) void loadStatementLines(id, { page: 1 });
                }}
                disabled={reconSaving}
              >
                <option value="">{t("common.select")}</option>
                {statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.statementFrom} → {s.statementTo} ({s.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => (reconAccount ? void loadBankStatements(reconAccount.id) : null)}
                disabled={reconSaving || !reconAccount}
              >
                {t("common.button.refresh")}
              </button>
              {selectedStatementId ? (
                <>
                  {statementStatus === "locked" ? (
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => void lockStatement(false)}
                      disabled={reconSaving}
                    >
                      {t("app.msp.cash.reconcile.unlock")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => void lockStatement(true)}
                      disabled={reconSaving}
                    >
                      {t("app.msp.cash.reconcile.lock")}
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.cash.reconcile.newStatement")}</div>
            <div className="bg-white p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.from")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={newStatementForm.from} onChange={(e) => setNewStatementForm((p) => ({ ...p, from: e.target.value }))} disabled={reconSaving} />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.to")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={newStatementForm.to} onChange={(e) => setNewStatementForm((p) => ({ ...p, to: e.target.value }))} disabled={reconSaving} />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.opening")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={newStatementForm.openingBalance} onChange={(e) => setNewStatementForm((p) => ({ ...p, openingBalance: e.target.value }))} disabled={reconSaving} />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.closing")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={newStatementForm.closingBalance} onChange={(e) => setNewStatementForm((p) => ({ ...p, closingBalance: e.target.value }))} disabled={reconSaving} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.note")}</label>
                  <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newStatementForm.note} onChange={(e) => setNewStatementForm((p) => ({ ...p, note: e.target.value }))} disabled={reconSaving} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void createStatement()} disabled={reconSaving || !reconAccount}>
                  {reconSaving ? t("common.working") : t("common.button.save")}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.cash.reconcile.import")}</div>
            <div className="bg-white p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:max-w-md">
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.file")}</label>
                  <input
                    className="mt-1 block w-full text-sm"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) void parseStatementFile(f);
                    }}
                    disabled={reconSaving || !selectedStatementId || statementStatus === "locked"}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={importReplace} onChange={(e) => setImportReplace(e.target.checked)} disabled={reconSaving || !selectedStatementId || statementStatus === "locked"} />
                    {t("app.msp.cash.reconcile.replace")}
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                    onClick={() => void uploadImportLines()}
                    disabled={reconSaving || !selectedStatementId || statementStatus === "locked" || importLines.length === 0}
                  >
                    {reconSaving ? t("common.working") : t("app.msp.cash.reconcile.upload")}
                  </button>
                </div>
              </div>

              <div className="mt-3 text-sm text-gray-700">
                {t("app.msp.cash.reconcile.preview")}: {importPreviewCount}
              </div>
            </div>
          </div>

          {selectedStatementId ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold text-gray-900">{t("app.msp.cash.reconcile.lines")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                    value={statementMatchFilter}
                    onChange={(e) => {
                      const v = e.target.value as "all" | "matched" | "unmatched";
                      setStatementMatchFilter(v);
                      void loadStatementLines(selectedStatementId, { page: 1, match: v });
                    }}
                    disabled={reconSaving}
                  >
                    <option value="all">{t("common.filter.all")}</option>
                    <option value="matched">{t("app.msp.cash.reconcile.filter.matched")}</option>
                    <option value="unmatched">{t("app.msp.cash.reconcile.filter.unmatched")}</option>
                  </select>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void autoMatch()}
                    disabled={reconSaving || statementStatus === "locked"}
                  >
                    {t("app.msp.cash.reconcile.autoMatch")}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">{t("app.msp.cash.reconcile.line.date")}</th>
                      <th className="px-4 py-3 text-left">{t("app.msp.cash.reconcile.line.desc")}</th>
                      <th className="px-4 py-3 text-right">{t("app.msp.cash.reconcile.line.amount")}</th>
                      <th className="px-4 py-3 text-left">{t("app.msp.cash.reconcile.line.match")}</th>
                      <th className="px-4 py-3 text-right">{t("app.msp.cash.reconcile.line.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {statementLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                          {t("app.msp.cash.reconcile.empty")}
                        </td>
                      </tr>
                    ) : (
                      statementLines.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700">{l.lineDate}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <div className="font-semibold text-gray-900">{l.description ?? "—"}</div>
                            {l.reference ? <div className="text-xs text-gray-500">{l.reference}</div> : null}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{l.amountSigned}</td>
                          <td className="px-4 py-3">
                            {l.match ? (
                              <div className="text-xs text-gray-700">
                                <div className="font-semibold text-gray-900">
                                  {l.match.entryDate} · {l.match.source}
                                </div>
                                <div className="tabular-nums">{l.match.amountSigned}</div>
                                {l.match.note ? <div className="text-gray-500">{l.match.note}</div> : null}
                              </div>
                            ) : (
                              <select
                                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  void setMatch(l.id, v);
                                }}
                                disabled={reconSaving || statementStatus === "locked"}
                              >
                                <option value="">{t("app.msp.cash.reconcile.match.select")}</option>
                                {l.suggestions.map((s) => (
                                  <option key={s.ledgerEntryId} value={s.ledgerEntryId}>
                                    {s.entryDate} · {s.source} · {s.amountSigned}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {l.match ? (
                                <button
                                  type="button"
                                  className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                                  onClick={() => void setMatch(l.id, null)}
                                  disabled={reconSaving || statementStatus === "locked"}
                                >
                                  {t("app.msp.cash.reconcile.unmatch")}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                                  onClick={() => openLineAdjustment(l)}
                                  disabled={reconSaving || statementStatus === "locked"}
                                >
                                  {t("app.msp.cash.reconcile.adjust")}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 text-sm text-gray-700">
                <div>
                  {t("common.pagination.page")} {statementPage} / {Math.max(1, Math.ceil(statementTotal / statementPageSize))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void loadStatementLines(selectedStatementId, { page: Math.max(1, statementPage - 1) })}
                    disabled={reconSaving || statementPage <= 1}
                  >
                    {t("common.pagination.prev")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void loadStatementLines(selectedStatementId, { page: statementPage + 1 })}
                    disabled={reconSaving || statementPage >= Math.ceil(statementTotal / statementPageSize)}
                  >
                    {t("common.pagination.next")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex justify-end">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setReconModalOpen(false)} disabled={reconSaving}>
              {t("common.button.close")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={adjustModalOpen2} onClose={() => (!reconSaving ? setAdjustModalOpen2(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.cash.reconcile.adjust.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{adjustLine ? `${adjustLine.lineDate} · ${adjustLine.amountSigned}` : null}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.adjust.entryDate")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={adjust2.entryDate} onChange={(e) => setAdjust2((p) => ({ ...p, entryDate: e.target.value }))} disabled={reconSaving} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.adjust.amountSigned")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={adjust2.amountSigned} onChange={(e) => setAdjust2((p) => ({ ...p, amountSigned: e.target.value }))} disabled={reconSaving} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.reconcile.adjust.note")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={adjust2.note} onChange={(e) => setAdjust2((p) => ({ ...p, note: e.target.value }))} disabled={reconSaving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setAdjustModalOpen2(false)} disabled={reconSaving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveLineAdjustment()} disabled={reconSaving || !adjustLine}>
              {reconSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={transferModalOpen} onClose={() => (!transferSaving ? setTransferModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.cash.transfer.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.cash.transfer.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.transfer.from")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={transferForm.fromAccountId} onChange={(e) => setTransferForm((p) => ({ ...p, fromAccountId: e.target.value }))} disabled={transferSaving}>
                <option value="">{t("common.select")}</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.currencyCode}) ({a.balance})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.transfer.to")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={transferForm.toAccountId} onChange={(e) => setTransferForm((p) => ({ ...p, toAccountId: e.target.value }))} disabled={transferSaving}>
                <option value="">{t("common.select")}</option>
                {transferToOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.currencyCode}) ({a.balance})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.transfer.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={transferForm.transferDate} onChange={(e) => setTransferForm((p) => ({ ...p, transferDate: e.target.value }))} disabled={transferSaving} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.transfer.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={transferForm.amount} onChange={(e) => setTransferForm((p) => ({ ...p, amount: e.target.value }))} disabled={transferSaving} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.transfer.note")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={transferForm.note} onChange={(e) => setTransferForm((p) => ({ ...p, note: e.target.value }))} disabled={transferSaving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setTransferModalOpen(false)} disabled={transferSaving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveTransfer()} disabled={transferSaving}>
              {transferSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={adjustModalOpen} onClose={() => (!adjustSaving ? setAdjustModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.cash.adjust.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.cash.adjust.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.adjust.account")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={adjustForm.accountId} onChange={(e) => setAdjustForm((p) => ({ ...p, accountId: e.target.value }))} disabled={adjustSaving}>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.currencyCode}) ({a.balance})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.adjust.direction")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={adjustForm.direction} onChange={(e) => setAdjustForm((p) => ({ ...p, direction: e.target.value as "in" | "out" }))} disabled={adjustSaving}>
                <option value="in">{t("app.msp.cash.direction.in")}</option>
                <option value="out">{t("app.msp.cash.direction.out")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.adjust.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={adjustForm.entryDate} onChange={(e) => setAdjustForm((p) => ({ ...p, entryDate: e.target.value }))} disabled={adjustSaving} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.adjust.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={adjustForm.amount} onChange={(e) => setAdjustForm((p) => ({ ...p, amount: e.target.value }))} disabled={adjustSaving} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.cash.adjust.note")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={adjustForm.note} onChange={(e) => setAdjustForm((p) => ({ ...p, note: e.target.value }))} disabled={adjustSaving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setAdjustModalOpen(false)} disabled={adjustSaving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void saveAdjust()} disabled={adjustSaving}>
              {adjustSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
