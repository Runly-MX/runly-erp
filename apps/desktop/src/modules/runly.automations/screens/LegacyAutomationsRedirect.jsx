// Automatizaciones moved out of Runly Core (/app/m/runly.core/automations[/key]):
// bookmarks, notifications and open tabs land on the new module.
import { Navigate, useLocation } from "react-router-dom";

export default function LegacyAutomationsRedirect() {
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^.*\/runly\.core\/automations/, "");
  return <Navigate to={`/app/m/runly.automations${rest}${search}`} replace />;
}
