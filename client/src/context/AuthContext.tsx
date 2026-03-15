import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, onAuthStateChanged, signOut, signInWithGoogle, signInWithYahoo, type User } from "../lib/firebase";

export interface AppUser {
  id: number;
  email: string;
  display_name: string;
  account_type: "free" | "pro";
  notification_email_enabled: boolean;
  created_at: string;
  firebaseUser: User;
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithYahoo: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAppUser(firebaseUser: User): Promise<AppUser | null> {
  try {
    const token = await firebaseUser.getIdToken();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, firebaseUser };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const appUser = await fetchAppUser(fbUser);
        setUser(appUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function loginWithGoogle() {
    const result = await signInWithGoogle();
    const appUser = await fetchAppUser(result.user);
    setUser(appUser);
    setFirebaseUser(result.user);
  }

  async function loginWithYahoo() {
    const result = await signInWithYahoo();
    const appUser = await fetchAppUser(result.user);
    setUser(appUser);
    setFirebaseUser(result.user);
  }

  async function logout() {
    await signOut();
    setUser(null);
    setFirebaseUser(null);
  }

  async function refreshUser() {
    if (!firebaseUser) return;
    const appUser = await fetchAppUser(firebaseUser);
    setUser(appUser);
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, loginWithGoogle, loginWithYahoo, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
