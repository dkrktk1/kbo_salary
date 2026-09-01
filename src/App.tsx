/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Home from "./components/Home";
import TeamAnalysis from "./components/TeamAnalysis";
import PlayerReport from "./components/PlayerReport";
import Simulator from "./components/Simulator";
import ReverseEngineering from "./components/ReverseEngineering";

export default function App() {
  return (
    <Router>
      <div className="flex h-screen w-full bg-dark-main text-gray-200 overflow-hidden font-sans">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative bg-dark-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/team" element={<TeamAnalysis />} />
            <Route path="/player" element={<PlayerReport />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/reverse-engineering" element={<ReverseEngineering />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
