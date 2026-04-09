import { OwnerGate } from "@/components/OwnerGate";
import { OwnerRequestsClient } from "./requests-client";

export default function OwnerHomePage() {
  return (
    <OwnerGate>
      <OwnerRequestsClient />
    </OwnerGate>
  );
}

