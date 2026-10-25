import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  TemplateManager,
  useOfficeActions,
} from "@runly/ui";
import { LayoutTemplate } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { runly } from "../../../lib/runly.js";

export default function DocumentTemplatesScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const office = useOfficeActions();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const permissions = userProfile?.permissions ?? [];
  const allowed = (key) => userProfile?.isAdmin || permissions.includes(key);
  const canRead = allowed("documents.templates.read");
  const canManage = allowed("documents.templates.create") || allowed("documents.templates.update");

  const kindsQuery = useQuery({
    queryKey: ["documents", "kinds"],
    queryFn: () => runly.documents.listKinds(token),
    enabled: Boolean(token && canRead),
    staleTime: 60_000,
  });
  const kinds = kindsQuery.data?.items ?? [];

  const onEditDocument = office?.enabled && office?.canEdit
    ? (template) => {
        const fileId = template.version?.fileAssetId;
        if (!fileId) return;
        navigate(`/app/m/runly.files/files/${encodeURIComponent(fileId)}/edit`, {
          state: { officeReturnTo: location.pathname, officeInvalidate: ["documents"] },
        });
      }
    : undefined;

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Documents"
        title="Plantillas"
        description="Tus formatos en Word, Excel, PowerPoint o PDF para cada tipo de documento de la empresa."
      />

      {!canRead ? (
        <ErrorState title="Sin acceso" description="No tienes permiso para ver las plantillas." showReport={false} />
      ) : kindsQuery.isLoading ? (
        <LoadingState />
      ) : kindsQuery.isError ? (
        <ErrorState title="No se pudieron cargar los tipos de documento" onRetry={() => kindsQuery.refetch()} />
      ) : !kinds.length ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Aún no hay tipos de documento"
          description="Los módulos que generan documentos aparecerán aquí para que subas sus plantillas."
        />
      ) : (
        <TemplateManager
          client={runly.documents}
          token={token}
          kinds={kinds}
          canManage={canManage}
          canDelete={allowed("documents.templates.delete")}
          onEditDocument={onEditDocument}
        />
      )}
    </div>
  );
}
