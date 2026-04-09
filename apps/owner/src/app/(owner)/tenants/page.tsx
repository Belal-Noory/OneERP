import { OwnerGate } from "@/components/OwnerGate";
import { OwnerTenantsClient } from "./tenants-client";

export default function OwnerTenantsPage() {
  return (
    <OwnerGate>
      <OwnerTenantsClient />
    </OwnerGate>
  );
}

