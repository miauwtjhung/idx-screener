import React, { useState, useEffect } from "react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import IDXScreener from "./IDXScreener";
import Portfolio from "./Portfolio";
import MarketSnapshot from "./MarketSnapshot";

export default function App() {
  const [tab, setTab] = useState("today");
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
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex gap-1">
            <TabButton active={tab === "today"} onClick={() => setTab("today")}>Today</TabButton>
            <TabButton active={tab === "screener"} onClick={() => setTab("screener")}>Screener</TabButton>
            <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>Portfolio</TabButton>
          </div>
          <div className="flex items-center gap-3 py-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-sm text-slate-300 hover:text-white">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="text-sm bg-white text-slate-900 px-3 py-1.5 rounded font-medium">Sign up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton afterSignOutUrl="/" />
            </Show>
          </div>
        </div>
      </nav>

      {tab === "today" && <MarketSnapshot />}
      {tab === "screener" && <IDXScreener />}
      {tab === "portfolio" && <Portfolio companies={companies} />}
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
