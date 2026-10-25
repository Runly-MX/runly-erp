// "Mi trabajo": what needs the person today, from every module they can use. Each
// section is an existing Home widget (same data, same permissions), so one section
// failing or being unavailable never hides the others.
import { useMemo } from "react";
import { Briefcase } from "lucide-react";
import { PageHeader } from "@runly/ui";
import { useRuntimeModules } from "./useRuntimeModules";
import { ApprovalsWidget } from "./home/widgets/ApprovalsWidget";
import { MyTasksWidget } from "./home/widgets/MyTasksWidget";
import { MentionsWidget } from "./home/widgets/MentionsWidget";
import { AgendaWidget } from "./home/widgets/AgendaWidget";

const SECTIONS = [
  { id: "tasks", moduleKey: "runly.projects", Component: MyTasksWidget },
  { id: "approvals", moduleKey: "runly.core", Component: ApprovalsWidget },
  { id: "mentions", moduleKey: "runly.chat", Component: MentionsWidget },
  { id: "agenda", moduleKey: "runly.calendar", Component: AgendaWidget },
];

export default function WorkScreen() {
  const { availableModules } = useRuntimeModules();
  const byKey = useMemo(() => new Map((availableModules ?? []).map((module) => [module.key, module])), [availableModules]);
  const sections = SECTIONS.filter((section) => byKey.has(section.moduleKey));
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader title="Mi trabajo" description="Lo que necesita tu atención hoy: tareas, aprobaciones, menciones y agenda." />
      {sections.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Briefcase className="h-4 w-4" aria-hidden /> Aún no tienes módulos con trabajo pendiente.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sections.map(({ id, moduleKey, Component }) => <Component key={id} module={byKey.get(moduleKey)} />)}
        </div>
      )}
    </div>
  );
}
