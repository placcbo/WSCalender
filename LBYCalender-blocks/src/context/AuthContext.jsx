import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

// ---------------------------------------------------------------------------
// Mocked Google auth.
//
// Later this becomes real Google OAuth: the popup below is replaced by
// Google's identity script, and `login()` will exchange the Google ID token
// with the Go backend for a session instead of picking from MOCK_ACCOUNTS.
// The shape of `user` (id, name, email, avatarUrl, role) is kept identical
// so nothing downstream needs to change.
// ---------------------------------------------------------------------------

const EXTRACTION_VIEWER_STORAGE_KEY = "workstream-extraction-viewers";

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function readStoredViewerEmails() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXTRACTION_VIEWER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(normalizeEmail) : [];
  } catch {
    return [];
  }
}

export const MOCK_ACCOUNTS = [
  {
    id: "demo-user-1",
    name: "Amina Njeri",
    email: "amina.njeri@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=47",
    role: "user",
    workType: "Extraction",
  },
  {
    id: "demo-user-2",
    name: "Kipkoech Otieno",
    email: "kipkoech.otieno@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=12",
    role: "user",
    workType: "Cooking",
  },
  {
    id: "demo-user-3",
    name: "Wanjiku Muiruri",
    email: "wanjiku.muiruri@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=32",
    role: "user",
    workType: "Extraction",
  },
  {
    id: "demo-user-4",
    name: "Mwangi Kamau",
    email: "mwangi.kamau@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=56",
    role: "user",
    workType: "Cooking",
  },
  {
    id: "demo-user-5",
    name: "Nadia Akinyi",
    email: "nadia.akinyi@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=15",
    role: "user",
    workType: "Extraction",
  },
  {
    id: "demo-user-6",
    name: "Daniel Mutua",
    email: "daniel.mutua@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=24",
    role: "user",
    workType: "Cooking",
  },
  {
    id: "admin-1",
    name: "Foreman (Admin)",
    email: "foreman@worksite.com",
    avatarUrl: "https://i.pravatar.cc/100?img=68",
    role: "admin",
  },
   {
    id: "admin-2",
    name: "kevin Ndirangu(Admin)",
    email: "kevin.ndirangu@labelyourdata.com",
    // avatarUrl: "https://i.pravatar.cc/100?img=68",
    role: "admin",
  },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [extractionViewerEmails, setExtractionViewerEmails] = useState(() => readStoredViewerEmails());

  const resolveEffectiveWorkType = useCallback(
    (email, fallbackWorkType) => {
      if (!email) return fallbackWorkType;
      const normalizedEmail = normalizeEmail(email);
      return extractionViewerEmails.includes(normalizedEmail) ? "Extraction" : fallbackWorkType;
    },
    [extractionViewerEmails]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXTRACTION_VIEWER_STORAGE_KEY, JSON.stringify(extractionViewerEmails));
    }
  }, [extractionViewerEmails]);

  useEffect(() => {
    if (!user?.email) return;
    setUser((current) => {
      if (!current) return current;
      const nextEffectiveWorkType = resolveEffectiveWorkType(current.email, current.workType);
      if (nextEffectiveWorkType === current.effectiveWorkType) return current;
      return { ...current, effectiveWorkType: nextEffectiveWorkType };
    });
  }, [resolveEffectiveWorkType, user?.email]);

  const addExtractionViewerEmail = useCallback((email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;
    setExtractionViewerEmails((current) => (current.includes(normalizedEmail) ? current : [...current, normalizedEmail]));
  }, []);

  const removeExtractionViewerEmail = useCallback((email) => {
    const normalizedEmail = normalizeEmail(email);
    setExtractionViewerEmails((current) => current.filter((entry) => entry !== normalizedEmail));
  }, []);

  const login = useCallback(
    (accountId) => {
      setIsAuthenticating(true);
      return new Promise((resolve) => {
        setTimeout(() => {
          const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
          const resolvedAccount = account
            ? {
                ...account,
                effectiveWorkType: resolveEffectiveWorkType(account.email, account.workType),
              }
            : null;
          setUser(resolvedAccount);
          setIsAuthenticating(false);
          resolve(resolvedAccount);
        }, 350);
      });
    },
    [resolveEffectiveWorkType]
  );

  const logout = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({
      user: user ? { ...user, effectiveWorkType: resolveEffectiveWorkType(user.email, user.workType) } : null,
      isAuthenticating,
      login,
      logout,
      extractionViewerEmails,
      addExtractionViewerEmail,
      removeExtractionViewerEmail,
    }),
    [user, isAuthenticating, login, logout, resolveEffectiveWorkType, extractionViewerEmails, addExtractionViewerEmail, removeExtractionViewerEmail]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
