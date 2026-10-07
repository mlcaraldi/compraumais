import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { customersRepo } from "@/server/repos";
import { UploadCustomersForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await requireUser();
  const total = await customersRepo.countCustomers(getDb(), user.tenantId);
  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${total} clientes cadastrados`}
        actions={<UploadCustomersForm />}
      />
    </>
  );
}
