import { openQuickAction } from "../../lib/quickActionStore";

const meeting = (mode) => () => openQuickAction("meeting", { mode });

export default [
  {
    id: "call-person",
    title: "Llamar a una persona",
    subtitle: "Llamada de audio directa",
    keywords: ["llamar", "llamada", "telefono", "persona", "audio", "marcar"],
    icon: "Phone",
    color: "#0ea5e9",
    run: () => openQuickAction("call-person"),
  },
  {
    id: "meeting-now",
    title: "Iniciar reunión",
    subtitle: "Sala nueva, canal o grupo · videollamada",
    keywords: ["reunion", "llamada", "videollamada", "video", "canal", "grupo", "meet", "iniciar"],
    icon: "Video",
    color: "#10b981",
    run: meeting("now"),
  },
  {
    id: "meeting-inperson",
    title: "Reunión presencial",
    subtitle: "Graba y transcribe en sala desde este dispositivo",
    keywords: ["presencial", "grabar", "grabacion", "sala", "transcribir", "reunion"],
    icon: "Mic",
    color: "#f43f5e",
    run: meeting("inperson"),
  },
  {
    id: "meeting-schedule",
    title: "Programar reunión",
    subtitle: "Fecha, hora e invitaciones en el calendario",
    keywords: ["programar", "agendar", "reunion", "calendario", "cita", "invitar"],
    icon: "Calendar",
    color: "#38bdf8",
    run: meeting("schedule"),
  },
];
