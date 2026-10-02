import { Outlet } from "react-router-dom";

export function LatencyLayout() {
  return (
    <div className="space-y-5">
      <Outlet />
    </div>
  );
}
