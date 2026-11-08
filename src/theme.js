import { useSyncExternalStore } from "react";

// Theme preference: "light" | "dark", stored in localStorage. With nothing
// stored we follow the OS setting. index.html applies the class before React
// loads so the page doesn't flash white.
const KEY = "maxtrade-theme";
const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const listeners = new Set();

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function current() {
  return stored() || (media?.matches ? "dark" : "light");
}

function apply() {
  document.documentElement.classList.toggle("dark", current() === "dark");
  listeners.forEach((l) => l());
}

media?.addEventListener("change", () => {
  if (!stored()) apply();
});

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: still switch for this page view
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  listeners.forEach((l) => l());
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function snapshot() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Returns "light" or "dark" and re-renders when it changes.
export function useTheme() {
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}

if (typeof document !== "undefined") apply();
