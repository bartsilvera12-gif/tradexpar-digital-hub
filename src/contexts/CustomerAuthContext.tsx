import React, { createContext, useContext, useMemo, useState } from "react";
import type { CustomerUser } from "@/types";
import { api } from "@/services/api";

interface CustomerAuthContextType {
  user: CustomerUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "tradexpar_customer_user";

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CustomerUser;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const persistUser = (next: CustomerUser | null) => {
    setUser(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.customerLogin({ email, password });
      persistUser(response.user);
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.customerRegister({ name, email, password });
      persistUser(response.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => persistUser(null);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
