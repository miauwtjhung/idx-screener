import React, { useState, useEffect } from "react";
import IDXScreener from "./IDXScreener";
import Portfolio from "./Portfolio";

export default function App() {
  const [tab, setTab] = useState("screener");
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    fetch("/idx-companies.json")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {});
  }, []);

  return (
    <div>
      <nav className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          <TabButton active={tab === "screener"} onClick={() => setTab("screener")}>Screener</TabButton>
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>Portfolio</TabButton>
        </div>
      </nav>

      {tab === "screener" ? <IDXScreener /> : <Portfolio companies={companies} />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-white text-white" : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
