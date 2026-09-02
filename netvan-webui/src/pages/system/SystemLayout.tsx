import { Outlet } from "react-router-dom";

export function SystemLayout() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">System</h1>
      <Outlet />
    </div>
  );
}
