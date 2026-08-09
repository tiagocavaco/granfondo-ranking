import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { setGetDb } from "@granfondo/api";
import { getDb } from "./db/db-client";
import Layout from "./components/Layout";
import AliasesPage from "./pages/AliasesPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import TeamAliasesPage from "./pages/TeamAliasesPage";
import RawAthletePage from "./pages/RawAthletePage";
import RawTeamPage from "./pages/RawTeamPage";
import CandidatesPage from "./pages/CandidatesPage";
import RawEventPage from "./pages/RawEventPage";
import BlocksPage from "./pages/BlocksPage";

setGetDb(getDb);

export default function App() {
  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/aliases" replace />} />
          <Route path="aliases" element={<AliasesPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="blocks" element={<BlocksPage />} />
          <Route path="team-aliases" element={<TeamAliasesPage />} />
          <Route path="athlete" element={<RawAthletePage />} />
          <Route path="athlete/:athleteId" element={<RawAthletePage />} />
          <Route path="team" element={<RawTeamPage />} />
          <Route path="team/:teamKey" element={<RawTeamPage />} />
          <Route path="event" element={<RawEventPage />} />
          <Route path="event/:eventId" element={<RawEventPage />} />
          <Route path="candidates" element={<CandidatesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
