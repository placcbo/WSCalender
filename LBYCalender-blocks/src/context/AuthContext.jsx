import { createContext, useContext, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Mocked Google auth.
//
// Later this becomes real Google OAuth: the popup below is replaced by
// Google's identity script, and `login()` will exchange the Google ID token
// with the Go backend for a session instead of picking from MOCK_ACCOUNTS.
// The shape of `user` (id, name, email, avatarUrl, role) is kept identical
// so nothing downstream needs to change.
// ---------------------------------------------------------------------------

export const MOCK_ACCOUNTS = [
  {
    id: "demo-user-1",
    name: "Amara Osei",
    email: "amara.osei@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=47",
    role: "user",
    workType: "Extraction",
  },
  {
    id: "demo-user-2",
    name: "Liam Chen",
    email: "liam.chen@gmail.com",
    avatarUrl: "https://i.pravatar.cc/100?img=12",
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
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const login = useCallback((accountId) => {
    setIsAuthenticating(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
        setUser(account ?? null);
        setIsAuthenticating(false);
        resolve(account);
      }, 350);
    });
  }, []);

  const logout = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticating, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
