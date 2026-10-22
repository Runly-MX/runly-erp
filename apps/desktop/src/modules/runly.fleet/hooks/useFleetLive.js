import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeContext } from "../../../providers/RealtimeProvider";

// Counter that bumps whenever the API reports a fleet write (fleet.changed on
// the company channel). Feed it to RunlyCrudView's refreshSignal so tables and
// open details refetch; React Query data is invalidated by the provider.
// The window-focus bump is a safety net for a missed broadcast.
export function useFleetLive() {
  const { on } = useRealtimeContext();
  const queryClient = useQueryClient();
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    const bump = () => setSignal((n) => n + 1);
    const off = on("fleet.changed", bump);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        bump();
        queryClient.invalidateQueries({ queryKey: ["fleet"] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [on, queryClient]);

  return signal;
}
