import { ActiveCompanyProvider, ActiveCompanyGate } from "../company/ActiveCompanyProvider";
import { RealtimeProvider } from "../providers/RealtimeProvider";
import { CallsProvider } from "../modules/runly.chat/calls/CallsProvider";
import { RunlyApp } from "./RunlyApp";

// Everything that only exists after login. AppEntry loads this chunk lazily so the
// login, setup and public pages do not download the ERP shell and its providers.
export default function AuthenticatedShell() {
  return (
    <ActiveCompanyProvider>
      <ActiveCompanyGate>
        <RealtimeProvider>
          <CallsProvider>
            <RunlyApp />
          </CallsProvider>
        </RealtimeProvider>
      </ActiveCompanyGate>
    </ActiveCompanyProvider>
  );
}

export function CompanyScope({ children }) {
  return (
    <ActiveCompanyProvider>
      <ActiveCompanyGate>{children}</ActiveCompanyGate>
    </ActiveCompanyProvider>
  );
}
