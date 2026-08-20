// contexts/BildirimContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { STORAGE_KEYS } from '../constants/storage-keys';

export type Bildirim = {
  id: string;
  title: string;
  body: string;
  screen?: string;
  createdAt: string;
  isRead: boolean;
};

export type AddBildirimInput = Omit<Bildirim, 'id' | 'createdAt' | 'isRead'> & {
  /** DB notifications.id veya başka kararlı anahtar; verilmezse rastgele üretilir. */
  id?: string;
  /** Gerçek gönderim zamanı; verilmezse ekleme anı kullanılır. */
  createdAt?: string;
};

/** Push date ile DB created_at milisaniye farkını yumuşatmak için saniye hassasiyeti. */
function createdAtKey(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(Math.floor(ms / 1000) * 1000).toISOString();
}

type BildirimContextType = {
  bildirimler: Bildirim[];
  unreadCount: number;
  addBildirim: (b: AddBildirimInput) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
};

const BildirimContext = createContext<BildirimContextType | null>(null);
const MAX_BILDIRIM = 20;

export function BildirimProvider({ children }: { children: React.ReactNode }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.BILDIRIMLER)
      .then((data) => {
        if (data) setBildirimler(JSON.parse(data));
      })
      .catch(() => {});
  }, []);

  const persist = (list: Bildirim[]) => {
    const trimmed = list.slice(0, MAX_BILDIRIM);
    setBildirimler(trimmed);
    AsyncStorage.setItem(STORAGE_KEYS.BILDIRIMLER, JSON.stringify(trimmed)).catch(() => {});
  };

  const addBildirim = useCallback((b: AddBildirimInput) => {
    const parsed = b.createdAt ? new Date(b.createdAt) : null;
    const createdAt =
      parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toISOString()
        : new Date().toISOString();

    const id =
      b.id && b.id.length > 0
        ? b.id
        : Date.now().toString() + Math.random().toString(36).substr(2, 9);

    const yeni: Bildirim = {
      title: b.title,
      body: b.body,
      screen: b.screen,
      id,
      createdAt,
      isRead: false,
    };

    setBildirimler((prev) => {
      const contentKey = `${yeni.title}\0${yeni.body}\0${createdAtKey(yeni.createdAt)}`;
      const isDup = prev.some(
        (existing) =>
          existing.id === yeni.id ||
          `${existing.title}\0${existing.body}\0${createdAtKey(existing.createdAt)}` === contentKey
      );
      if (isDup) return prev;

      const updated = [yeni, ...prev];
      persist(updated);
      return updated;
    });
  }, []);

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