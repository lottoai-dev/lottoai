// contexts/BildirimContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Bildirim = {
  id: string;
  title: string;
  body: string;
  screen?: string;
  createdAt: string; // ISO string
  isRead: boolean;
};

type BildirimContextType = {
  bildirimler: Bildirim[];
  unreadCount: number;
  addBildirim: (b: Omit<Bildirim, 'id' | 'createdAt' | 'isRead'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
};

const BildirimContext = createContext<BildirimContextType | null>(null);

const STORAGE_KEY = 'bildirimler';
const MAX_BILDIRIM = 20;

export function BildirimProvider({ children }: { children: React.ReactNode }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);

  // AsyncStorage'dan yükle
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (data) setBildirimler(JSON.parse(data));
      })
      .catch(() => {});
  }, []);

  // AsyncStorage'a kaydet
  const persist = (list: Bildirim[]) => {
    const trimmed = list.slice(0, MAX_BILDIRIM);
    setBildirimler(trimmed);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)).catch(() => {});
  };

  const addBildirim = useCallback(
    (b: Omit<Bildirim, 'id' | 'createdAt' | 'isRead'>) => {
      const yeni: Bildirim = {
        ...b,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      setBildirimler((prev) => {
        const updated = [yeni, ...prev];
        persist(updated);
        return updated;
      });
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setBildirimler((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, isRead: true } : b));
      persist(updated);
      return updated;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setBildirimler((prev) => {
      const updated = prev.map((b) => ({ ...b, isRead: true }));
      persist(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    persist([]);
  }, []);

  const unreadCount = bildirimler.filter((b) => !b.isRead).length;

  return (
    <BildirimContext.Provider
      value={{ bildirimler, unreadCount, addBildirim, markAsRead, markAllAsRead, clearAll }}
    >
      {children}
    </BildirimContext.Provider>
  );
}

export function useBildirim() {
  const ctx = useContext(BildirimContext);
  if (!ctx) throw new Error('useBildirim must be used within BildirimProvider');
  return ctx;
}