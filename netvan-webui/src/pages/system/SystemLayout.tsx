import { Outlet } from "react-router-dom";

export function SystemLayout() {
  return (
    <div className="space-y-5">
      <Outlet />
    </div>
  );
}
