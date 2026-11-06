import React, { useState, useEffect } from "react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import IDXScreener from "./IDXScreener";
import Fundamentals from "./Fundamentals";
import StockAnalysis from "./StockAnalysis";
import Portfolio from "./Portfolio";
import MarketSnapshot from "./MarketSnapshot";
import Charting from "./Charting";
import About from "./About";

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
        {/* Phones: logo + sign-in on the first row, tabs on a full-width second row.
            Desktop: logo, tabs, sign-in on one row. */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex flex-wrap md:flex-nowrap items-center justify-between">
          <button
            onClick={() => setTab("about")}
            title="About Maxtrade"
            className="order-1 flex items-center gap-2 py-2 pr-4 md:mr-2 shrink-0"
            aria-label="About Maxtrade"
          >
            <LogoMark className="w-7 h-7" />
            <span className="text-base font-semibold tracking-tight whitespace-nowrap">
              <span className="text-red-500">Max</span>trade
            </span>
          </button>
          <div className="order-3 md:order-2 w-full md:w-auto flex gap-1 min-w-0 md:flex-1 overflow-x-auto [scrollbar-width:none] border-t border-slate-800 md:border-0">
            <TabButton active={tab === "today"} onClick={() => setTab("today")}>Market Snapshot</TabButton>
            <TabButton active={tab === "analysis"} onClick={() => setTab("analysis")}>AI Analysis</TabButton>
            <TabButton active={tab === "screener"} onClick={() => setTab("screener")}>Screener</TabButton>
            <TabButton active={tab === "fundamentals"} onClick={() => setTab("fundamentals")}>Fundamentals</TabButton>
            <TabButton active={tab === "charting"} onClick={() => setTab("charting")}>Charting</TabButton>
            <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>Portfolio</TabButton>
            <TabButton active={tab === "about"} onClick={() => setTab("about")}>About</TabButton>
          </div>
          <div className="order-2 md:order-3 flex items-center gap-3 py-2 pl-3 shrink-0">
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
      {tab === "fundamentals" && <Fundamentals companies={companies} />}
      {tab === "analysis" && <StockAnalysis companies={companies} />}
      {tab === "charting" && <Charting companies={companies} />}
      {tab === "portfolio" && <Portfolio companies={companies} />}
      {tab === "about" && <About />}
    </div>
  );
}

function LogoMark({ className = "" }) {
  // "MT" monogram: red tile, white letters (matches the red "Max" in the name).
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#ef4444" />
      <text
        x="16"
        y="21.5"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
        fontSize="15"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="#ffffff"
      >
        MT
      </text>
    </svg>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
        active ? "border-white text-white" : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
