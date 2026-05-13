"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OfflineSyncErrorsDialog } from "@/components/OfflineSyncErrorsDialog";

type MeResponse = {
  data: {
    user: { id: string };
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type TeamResponse = {
  data: {
    roles: { id: string; name: string }[];
    enabledModules: { id: string; nameKey: string }[];
    members: {
      id: string;
      status: "active" | "invited" | "suspended";
      createdAt: string;
      moduleIds: string[];
      user: { id: string; fullName: string; email: string | null };
      role: { id: string; name: string };
    }[];
  };
};

type OfflineInvite = {
  id: string;
  email: string;
  fullName: string;
  roleName: string;
  moduleIds: string[];
  status: "queued" | "sent" | "error" | "cancelled";
  inviteUrl: string | null;
  errorKey: string | null;
};

export function TeamClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [enabledModules, setEnabledModules] = useState<TeamResponse["data"]["enabledModules"]>([]);
  const [members, setMembers] = useState<TeamResponse["data"]["members"]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [errorCount, setErrorCount] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("Staff");
  const [inviteModuleIds, setInviteModuleIds] = useState<string[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteQueued, setInviteQueued] = useState(false);
  const [offlineInvites, setOfflineInvites] = useState<OfflineInvite[]>([]);
  const [offlineInvitesLoading, setOfflineInvitesLoading] = useState(false);

  const roleOptions = useMemo(() => roles.map((r) => r.name), [roles]);
  const isDesktop = useMemo(() => {
    const w = window as unknown as { oneerp?: { getOfflineModuleStatus?: unknown } };
    return Boolean(w.oneerp?.getOfflineModuleStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
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

        const res = await apiFetch("/api/tenants/current/team", { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } });
        if (!res.ok) {
          setErrorKey("errors.permissionDenied");
          return;
        }
        const json = (await res.json()) as TeamResponse;
        if (!cancelled) {
          setRoles(json.data.roles);
          setEnabledModules(json.data.enabledModules ?? []);
          setMembers(json.data.members);
          setInviteRole(json.data.roles.find((r) => r.name === "Staff")?.name ?? json.data.roles[0]?.name ?? "Staff");
          setInviteModuleIds((json.data.enabledModules ?? []).map((m) => m.id));
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let mounted = true;
    async function tick() {
      const w = window as unknown as { oneerp?: { getOfflineModuleStatus?: (input: { moduleId: string }) => Promise<unknown> } };
      if (!w.oneerp?.getOfflineModuleStatus) {
        if (mounted) setPendingCount(null);
        if (mounted) setErrorCount(null);
        return;
      }
      try {
        const s2 = await w.oneerp.getOfflineModuleStatus({ moduleId: "tenant" });
        const legacyPending = typeof (s2 as { pendingCount?: unknown })?.pendingCount === "number" ? Number((s2 as { pendingCount?: number }).pendingCount) : null;
        const legacyErrors = typeof (s2 as { errorCount?: unknown })?.errorCount === "number" ? Number((s2 as { errorCount?: number }).errorCount) : null;
        const json = (s2 as { ok?: boolean; json?: unknown })?.json as { data?: { pending?: unknown; errors?: unknown } } | undefined;
        const pending = legacyPending ?? (typeof json?.data?.pending === "number" ? Number(json.data.pending) : 0);
        const errors = legacyErrors ?? (typeof json?.data?.errors === "number" ? Number(json.data.errors) : 0);
        if (mounted) {
          setPendingCount(pending);
          setErrorCount(errors);
        }
      } catch {
        if (mounted) setPendingCount(null);
        if (mounted) setErrorCount(null);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInvitesQueue() {
      if (!tenantId) return;
      if (!isDesktop) return;
      setOfflineInvitesLoading(true);
      try {
        const res = await apiFetch("/api/tenants/current/team/invites-queue", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: OfflineInvite[] };
        if (!cancelled) setOfflineInvites(Array.isArray(json.data) ? json.data : []);
      } finally {
        if (!cancelled) setOfflineInvitesLoading(false);
      }
    }
    void loadInvitesQueue();
    return () => {
      cancelled = true;
    };
  }, [isDesktop, tenantId]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">Loading…</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  if (!tenantId) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">No tenant</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.team.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.team.subtitle")}</div>
          </div>
        </div>
      </div>

      {(pendingCount ?? 0) > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{t("desktop.offline.pending.title")}</div>
              <div className="mt-1 text-amber-800">
                {t("desktop.offline.pending.desc")} <span className="font-semibold tabular">{pendingCount}</span>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-700 px-4 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
              disabled={transferring}
              onClick={() => setTransferOpen(true)}
            >
              {t("desktop.offline.transfer.action")}
            </button>
          </div>
        </div>
      ) : null}

      {(errorCount ?? 0) > 0 ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{t("desktop.offline.errors.title")}</div>
              <div className="mt-1 text-red-800">
                {t("desktop.offline.errors.desc")} <span className="font-semibold tabular">{errorCount}</span>
              </div>
            </div>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-50" onClick={() => setErrorsOpen(true)}>
              {t("desktop.offline.errors.view")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.team.invite.title")}</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label={t("app.team.invite.email")} value={inviteEmail} onChange={setInviteEmail} placeholder="user@example.com" />
          <Field label={t("app.team.invite.name")} value={inviteName} onChange={setInviteName} placeholder={t("app.team.invite.name.placeholder")} />
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("app.team.invite.role")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-900">{t("app.team.invite.apps")}</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {enabledModules.map((m) => {
              const checked = inviteModuleIds.includes(m.id);
              return (
                <label key={m.id} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setInviteModuleIds((prev) => (next ? Array.from(new Set([...prev, m.id])) : prev.filter((x) => x !== m.id)));
                    }}
                  />
                  {t(m.nameKey)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            disabled={inviting || !inviteEmail.trim() || inviteModuleIds.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={async () => {
              if (!tenantId) return;
              setInviting(true);
              setInviteUrl(null);
              setInviteQueued(false);
              setErrorKey(null);
              try {
                const res = await apiFetch("/api/tenants/current/team/invite", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                  body: JSON.stringify({ email: inviteEmail, fullName: inviteName || undefined, roleName: inviteRole, moduleIds: inviteModuleIds })
                });
                const json = (await res.json()) as { data?: { inviteUrl?: string; queued?: boolean }; error?: { message_key: string } };
                if (!res.ok) {
                  setErrorKey(json.error?.message_key ?? "errors.internal");
                  return;
                }
                if (json.data?.queued) {
                  setInviteQueued(true);
                  const q = await apiFetch("/api/tenants/current/team/invites-queue", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                  if (q.ok) {
                    const qj = (await q.json()) as { data?: OfflineInvite[] };
                    setOfflineInvites(Array.isArray(qj.data) ? qj.data : []);
                  }
                } else {
                  setInviteUrl(json.data?.inviteUrl ?? null);
                }
                setInviteEmail("");
                setInviteName("");
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setInviting(false);
              }
            }}
          >
            {inviting ? t("app.team.invite.working") : t("app.team.invite.cta")}
          </button>

          {inviteQueued ? <div className="text-sm font-medium text-amber-700">{t("desktop.offline.invites.queuedNotice")}</div> : null}

          {inviteUrl ? (
            <div className="flex w-full flex-col gap-2 md:w-auto">
              <div className="text-xs font-medium text-gray-500">{t("app.team.invite.link")}</div>
              <div className="flex items-center gap-2">
                <input className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm md:w-[420px]" readOnly value={inviteUrl} />
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                    } catch {}
                  }}
                >
                  {t("app.team.invite.copy")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isDesktop ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-lg font-semibold">{t("desktop.offline.invites.title")}</div>
            {offlineInvitesLoading ? <div className="text-xs text-gray-500">{t("desktop.offline.invites.loading")}</div> : null}
          </div>
          {offlineInvites.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">{t("desktop.offline.invites.empty")}</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[820px] w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.invite.email")}</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.invite.role")}</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.status")}</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.invite.link")}</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.actions")}</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {offlineInvites.map((inv) => (
                    <tr key={inv.id}>
                      <td className="border-b border-gray-100 px-3 py-3">
                        <div className="font-medium text-gray-900">{inv.email}</div>
                        <div className="mt-1 text-xs text-gray-500">{inv.fullName}</div>
                      </td>
                      <td className="border-b border-gray-100 px-3 py-3">{inv.roleName}</td>
                      <td className="border-b border-gray-100 px-3 py-3">
                        <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700">{t(`desktop.offline.invites.status.${inv.status}`)}</span>
                        {inv.status === "error" && inv.errorKey ? <div className="mt-1 text-xs text-red-700">{t(inv.errorKey)}</div> : null}
                      </td>
                      <td className="border-b border-gray-100 px-3 py-3">
                        {inv.inviteUrl ? (
                          <div className="flex items-center gap-2">
                            <input className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm md:w-[380px]" readOnly value={inv.inviteUrl} />
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(inv.inviteUrl ?? "");
                                } catch {}
                              }}
                            >
                              {t("app.team.invite.copy")}
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </td>
                      <td className="border-b border-gray-100 px-3 py-3">
                        {inv.status === "queued" ? (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                            onClick={async () => {
                              await apiFetch(`/api/tenants/current/team/invites-queue/${inv.id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
                              const q = await apiFetch("/api/tenants/current/team/invites-queue", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                              if (q.ok) {
                                const qj = (await q.json()) as { data?: OfflineInvite[] };
                                setOfflineInvites(Array.isArray(qj.data) ? qj.data : []);
                              }
                            }}
                          >
                            {t("desktop.offline.invites.cancel")}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{t("app.team.members.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.team.members.subtitle")}</div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[760px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.user")}</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.role")}</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.apps")}</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.status")}</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left text-sm font-medium text-gray-900">{t("app.team.members.col.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  t={t}
                  tenantId={tenantId}
                  member={m}
                  roles={roles}
                  enabledModules={enabledModules}
                  onUpdated={(next) => setMembers((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={transferOpen}
        title={t("desktop.offline.transfer.title")}
        description={t("desktop.offline.transfer.desc")}
        confirmLabel={t("desktop.offline.transfer.action")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="primary"
        busy={transferring}
        onCancel={() => setTransferOpen(false)}
        onConfirm={async () => {
          const w = window as unknown as { oneerp?: { syncModule?: (input: { moduleId: string }) => Promise<unknown> } };
          if (!w.oneerp?.syncModule) return;
          setTransferring(true);
          try {
            await w.oneerp.syncModule({ moduleId: "tenant" });
            setTransferOpen(false);
            window.location.reload();
          } finally {
            setTransferring(false);
          }
        }}
      />

      <OfflineSyncErrorsDialog open={errorsOpen} onClose={() => setErrorsOpen(false)} moduleId="tenant" />
    </div>
  );
}

function MemberRow(props: {
  t: (k: string) => string;
  tenantId: string;
  member: TeamResponse["data"]["members"][number];
  roles: { id: string; name: string }[];
  enabledModules: TeamResponse["data"]["enabledModules"];
  onUpdated: (m: TeamResponse["data"]["members"][number]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const roleNames = useMemo(() => props.roles.map((r) => r.name), [props.roles]);
  const [moduleIds, setModuleIds] = useState<string[]>(() => (props.member.moduleIds?.length ? props.member.moduleIds : props.enabledModules.map((m) => m.id)));

  return (
    <tr>
      <td className="border-b border-gray-100 px-3 py-3">
        <div className="font-medium text-gray-900">{props.member.user.fullName}</div>
        <div className="mt-1 text-xs text-gray-500">{props.member.user.email ?? "—"}</div>
      </td>
      <td className="border-b border-gray-100 px-3 py-3">
        <select
          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
          value={props.member.role.name}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              const roleName = e.target.value;
              const res = await apiFetch(`/api/tenants/current/team/memberships/${props.member.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "X-Tenant-Id": props.tenantId },
                body: JSON.stringify({ roleName })
              });
              if (!res.ok) return;
              props.onUpdated({ ...props.member, role: { ...props.member.role, name: roleName } });
            } finally {
              setBusy(false);
            }
          }}
        >
          {roleNames.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="border-b border-gray-100 px-3 py-3">
        {props.member.role.name === "Owner" ? (
          <span className="text-sm text-gray-700">{props.t("app.team.apps.all")}</span>
        ) : (
          <select
            multiple
            className="h-20 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
            value={moduleIds}
            disabled={busy}
            onChange={async (e) => {
              const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
              setModuleIds(selected);
              setBusy(true);
              try {
                const res = await apiFetch(`/api/tenants/current/team/memberships/${props.member.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": props.tenantId },
                  body: JSON.stringify({ moduleIds: selected })
                });
                if (!res.ok) return;
                props.onUpdated({ ...props.member, moduleIds: selected });
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.enabledModules.map((m) => (
              <option key={m.id} value={m.id}>
                {props.t(m.nameKey)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="border-b border-gray-100 px-3 py-3">
        <span className={["inline-flex h-6 items-center rounded-full px-2 text-xs", statusBadge(props.member.status)].join(" ")}>
          {props.t(statusKey(props.member.status))}
        </span>
      </td>
      <td className="border-b border-gray-100 px-3 py-3">
        {props.member.status === "suspended" ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await apiFetch(`/api/tenants/current/team/memberships/${props.member.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": props.tenantId },
                  body: JSON.stringify({ status: "active" })
                });
                if (!res.ok) return;
                props.onUpdated({ ...props.member, status: "active" });
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.t("app.team.members.action.activate")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await apiFetch(`/api/tenants/current/team/memberships/${props.member.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": props.tenantId },
                  body: JSON.stringify({ status: "suspended" })
                });
                if (!res.ok) return;
                props.onUpdated({ ...props.member, status: "suspended" });
              } finally {
                setBusy(false);
              }
            }}
          >
            {props.t("app.team.members.action.suspend")}
          </button>
        )}
      </td>
    </tr>
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

function statusKey(status: "active" | "invited" | "suspended"): string {
  if (status === "active") return "app.team.status.active";
  if (status === "invited") return "app.team.status.invited";
  return "app.team.status.suspended";
}

function statusBadge(status: "active" | "invited" | "suspended"): string {
  if (status === "active") return "bg-primary-50 text-primary-700";
  if (status === "invited") return "bg-accent-50 text-accent-600";
  return "bg-gray-100 text-gray-700";
}
