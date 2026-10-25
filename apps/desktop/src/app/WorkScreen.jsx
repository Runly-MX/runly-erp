// "Mi trabajo": what needs the person today, from every module they can use. Each
// section is an existing Home widget (same data, same permissions) on the same board
// as Home: rearrange, resize (with a live frame) or hide sections; the choice is kept
// per person. One section failing or being unavailable never hides the others.
import { useMemo, useState } from "react";
import { PageHeader } from "@runly/ui";
import { useRuntimeModules } from "./useRuntimeModules";
import { useHomeWidgetPrefs } from "../hooks/useHomeWidgetPrefs";
import { addWidget, availableWidgets, moveWidget, removeWidget, resolveShown, sizeOf, withShown, withSize } from "../lib/homeWidgets";
import { HomeWidgetBoard, HomeWidgetEditBar } from "./home/HomeWidgetBoard";
import { ApprovalsWidget } from "./home/widgets/ApprovalsWidget";
import { MyTasksWidget } from "./home/widgets/MyTasksWidget";
import { MentionsWidget } from "./home/widgets/MentionsWidget";
import { AgendaWidget } from "./home/widgets/AgendaWidget";

const SECTIONS = [
  { id: "tasks", title: "Mis tareas", description: "Tareas abiertas asignadas a ti", moduleKey: "runly.projects", Component: MyTasksWidget },
  { id: "approvals", title: "Aprobaciones", description: "Lo que espera tu decisión", moduleKey: "runly.core", Component: ApprovalsWidget },
  { id: "mentions", title: "Menciones", description: "Quién te mencionó en el chat", moduleKey: "runly.chat", Component: MentionsWidget },
  { id: "agenda", title: "Agenda", description: "Tus próximos eventos", moduleKey: "runly.calendar", Component: AgendaWidget },
];

export default function WorkScreen() {
  const { availableModules } = useRuntimeModules();
  const prefs = useHomeWidgetPrefs("work.widgets");
  const [editing, setEditing] = useState(false);
  const byKey = useMemo(() => new Map((availableModules ?? []).map((module) => [module.key, module])), [availableModules]);
  const offered = useMemo(() => availableWidgets(SECTIONS, byKey.keys()), [byKey]);
  const offeredIds = useMemo(() => offered.map((section) => section.id), [offered]);
  const shownIds = useMemo(() => resolveShown(prefs.pref, offeredIds, { defaultAll: true }), [prefs.pref, offeredIds]);
  const byId = useMemo(() => new Map(offered.map((section) => [section.id, section])), [offered]);
  const saveShown = (ids) => prefs.save((current) => withShown(current, ids));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <PageHeader title="Mi trabajo" description="Lo que necesita tu atención hoy: tareas, aprobaciones, menciones y agenda." />
      {!prefs.isLoading && (
        <>
          <HomeWidgetEditBar editing={editing} onToggle={() => setEditing((value) => !value)} tray={offered.filter((section) => !shownIds.includes(section.id))} onAdd={(id) => saveShown(addWidget(shownIds, id))} />
          <HomeWidgetBoard
            widgets={shownIds.map((id) => byId.get(id))}
            modulesByKey={byKey}
            sizeOfId={(id) => sizeOf(prefs.pref, id)}
            editing={editing}
            onEdit={() => setEditing(true)}
            onReorder={(from, to) => saveShown(moveWidget(shownIds, from, to))}
            onRemove={(id) => saveShown(removeWidget(shownIds, id))}
            onResize={(id, size) => prefs.save((current) => withShown(withSize(current, id, size), resolveShown(current, offeredIds, { defaultAll: true })))}
          />
        </>
      )}
    </div>
  );
}
