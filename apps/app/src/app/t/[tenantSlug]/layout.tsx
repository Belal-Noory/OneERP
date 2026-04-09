import { getRequestLocale } from "@/lib/locale";
import { getTextDirection } from "@oneerp/i18n";
import { TenantShell } from "@/components/TenantShell";

export default async function TenantLayout(props: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const locale = await getRequestLocale();
  const dir = getTextDirection(locale);

  return (
    <TenantShell tenantSlug={tenantSlug} dir={dir}>
      {props.children}
    </TenantShell>
  );
}
