import { redirect } from "next/navigation";

export default async function FuelIndexPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  redirect(`/t/${tenantSlug}/fuel/tanks`);
}
