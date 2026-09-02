import { Outlet } from "react-router-dom";

export function LatencyLayout() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Latency</h1>
      <Outlet />
    </div>
  );
}
