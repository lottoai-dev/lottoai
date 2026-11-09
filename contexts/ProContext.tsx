// contexts/ProContext.tsx
// Uygulama genelinde "kullanici Pro mu?" bilgisi (1.2.0).
//
// Iki kaynak birlestirilir:
// 1. RevenueCat SDK (customerInfo): satin alma/geri yukleme aninda guncellenir.
// 2. Sunucu (public.is_pro()): revenuecat-webhook'un yazdigi user_entitlements.
//    SDK'nin yapilandirilmadigi platformlarda (simdilik Android) ve baska
//    cihazda alinan abonelikte tek kaynak budur.
// Ikisinden biri Pro diyorsa kullanici Pro sayilir. Giris yoksa Pro degil.
//
// Oturum degisikliklerini de burada RevenueCat'e iletiriz (logIn/logOut);
// AuthContext'e dokunulmaz.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';

import { hasProEntitlement, identifyPurchasesUser, initPurchases } from '../lib/purchases';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type ProContextType = {
  /** Kullanici su an Pro mu (giris yoksa her zaman false). */
  isPro: boolean;
  /** Ilk durum henuz okunmadi. */
  isLoading: boolean;
  /** Satin alma / geri yukleme sonrasi veya ekran acilisinda durumu tazeler. */
  refresh: () => Promise<void>;
};

const ProContext = createContext<ProContextType>({
  isPro: false,
  isLoading: true,
  refresh: async () => {},
});

async function fetchServerPro(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_pro');
  if (error) return false;
  return data === true;
}

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [sdkPro, setSdkPro] = useState(false);
  const [serverPro, setServerPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const sdkReady = useRef(initPurchases());
  // Eski bir istegin sonucu yeni kullanicinin durumunu ezmesin.
  const currentUserRef = useRef<string | null>(null);

  const loadServer = useCallback(async (forUser: string | null) => {
    if (!forUser) {
      setServerPro(false);
      return;
    }
    const pro = await fetchServerPro();
    if (currentUserRef.current === forUser) setServerPro(pro);
  }, []);

  // Oturum degisti: RevenueCat'e bildir, iki kaynagi da yeniden oku.
  useEffect(() => {
    if (authLoading) return;
    currentUserRef.current = userId;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const [info] = await Promise.all([
        identifyPurchasesUser(userId),
        loadServer(userId),
      ]);
      if (cancelled) return;
      setSdkPro(userId ? hasProEntitlement(info) : false);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading, loadServer]);

  // SDK, satin alma / yenileme / iptal gibi degisikliklerde haber verir.
  useEffect(() => {
    if (!sdkReady.current) return;
    const listener = (info: CustomerInfo) => {
      if (currentUserRef.current) setSdkPro(hasProEntitlement(info));
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Uygulama one gelince sunucu durumunu tazele (baska cihazda alinmis olabilir).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadServer(currentUserRef.current);
    });
    return () => sub.remove();
  }, [loadServer]);

  const refresh = useCallback(async () => {
    const forUser = currentUserRef.current;
    if (!forUser) return;
    const tasks: Promise<unknown>[] = [loadServer(forUser)];
    if (sdkReady.current) {
      tasks.push(
        Purchases.getCustomerInfo()
          .then((info) => {
            if (currentUserRef.current === forUser) setSdkPro(hasProEntitlement(info));
          })
          .catch(() => {}),
      );
    }
    await Promise.all(tasks);
  }, [loadServer]);

  const isPro = !!userId && (sdkPro || serverPro);

  return (
    <ProContext.Provider value={{ isPro, isLoading: authLoading || isLoading, refresh }}>
      {children}
    </ProContext.Provider>
  );
}

export function usePro() {
  return useContext(ProContext);
}
