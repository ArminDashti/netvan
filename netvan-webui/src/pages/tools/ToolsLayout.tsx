import { Outlet } from "react-router-dom";

export function ToolsLayout() {
  return (
    <div className="space-y-5">
      <Outlet />
    </div>
  );
}
