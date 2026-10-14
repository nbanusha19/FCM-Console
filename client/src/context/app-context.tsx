import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppUser } from "@/lib/types";
import { clearLegacyDemoData } from "@/data/defaults";
import { KEYS, getData, saveData } from "@/services/storage";
import { clearSession, loginRequest, restoreSession } from "@/services/auth";
import { listBranches } from "@/services/branches";
import { listRoles } from "@/services/roles";
import { listUsers } from "@/services/users";

export type Theme = "light" | "dark" | "ocean" | "sunset";
export const THEMES: Theme[] = ["light", "dark", "ocean", "sunset"];

interface AppContextValue {
  hydrated: boolean;
  user: AppUser | null;
  theme: Theme;
  version: number;
  login: (email: string, password: string) => Promise<AppUser>;
  logout: () => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

async function hydrateMastersFromApi(user: AppUser) {
  try {
    saveData(KEYS.branches, await listBranches(true));
  } catch {
    /* Keep locally stored masters if setup is unavailable. */
  }
  if (user.role !== "ADMIN") return;
  try {
    const [users, roles] = await Promise.all([listUsers(), listRoles(true)]);
    saveData(KEYS.users, users);
    saveData(KEYS.roles, roles);
  } catch {
    /* Keep locally stored admin masters if setup is unavailable. */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [theme, setTheme] = useState<Theme>("ocean");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    clearLegacyDemoData();
    const saved = getData<Theme>(KEYS.theme, "ocean");
    setTheme(THEMES.includes(saved) ? saved : "ocean");

    void restoreSession()
      .then(async (next) => {
        saveData(KEYS.currentUser, next);
        setUser(next);
        if (next) {
          await hydrateMastersFromApi(next);
          setVersion((v) => v + 1);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset["theme"] = theme;
  }, [theme, hydrated]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    saveData(KEYS.currentUser, next);
    await hydrateMastersFromApi(next);
    setUser(next);
    setVersion((v) => v + 1);
    return next;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    saveData<AppUser | null>(KEYS.currentUser, null);
    setUser(null);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]!;
      saveData(KEYS.theme, next);
      return next;
    });
  }, []);

  const chooseTheme = useCallback((t: Theme) => {
    saveData(KEYS.theme, t);
    setTheme(t);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      user,
      theme,
      version,
      login,
      logout,
      toggleTheme,
      setTheme: chooseTheme,
      refresh,
    }),
    [hydrated, user, theme, version, login, logout, toggleTheme, chooseTheme, refresh],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
