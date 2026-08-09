import { NavLink, Outlet } from "react-router-dom";

const navItem = (isActive: boolean) =>
  `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-gray-900 text-white"
      : "text-gray-700 hover:bg-gray-200 hover:text-gray-900"
  }`;

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <h1 className="text-base font-bold text-gray-900">
            Granfondo Backoffice
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">local dev only</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Overrides
          </p>
          <NavLink
            to="/aliases"
            className={({ isActive }) => navItem(isActive)}
          >
            Athlete Aliases
          </NavLink>
          <NavLink
            to="/assignments"
            className={({ isActive }) => navItem(isActive)}
          >
            Result Assignments
          </NavLink>
          <NavLink to="/blocks" className={({ isActive }) => navItem(isActive)}>
            Blocked Results
          </NavLink>
          <NavLink
            to="/team-aliases"
            className={({ isActive }) => navItem(isActive)}
          >
            Team Aliases
          </NavLink>
          <NavLink
            to="/candidates"
            className={({ isActive }) => navItem(isActive)}
          >
            Candidates
          </NavLink>
          <p className="px-3 py-1 mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Raw Data
          </p>
          <NavLink
            to="/athlete"
            className={({ isActive }) => navItem(isActive)}
          >
            Raw Athlete
          </NavLink>
          <NavLink to="/team" className={({ isActive }) => navItem(isActive)}>
            Raw Team
          </NavLink>
          <NavLink to="/event" className={({ isActive }) => navItem(isActive)}>
            Raw Event
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
