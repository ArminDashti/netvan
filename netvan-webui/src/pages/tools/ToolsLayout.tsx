import { Outlet } from "react-router-dom";

export function ToolsLayout() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Tools</h1>
      <Outlet />
    </div>
  );
}
