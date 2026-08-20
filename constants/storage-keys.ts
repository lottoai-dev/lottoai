// constants/storage-keys.ts
export const STORAGE_KEYS = {
    SAVED_COUPONS: 'savedCoupons',
    GENERATION_HISTORY: 'generationHistory',
    NOTIFICATION_SETTINGS: 'notificationSettings_v3',
    ONBOARDING_COMPLETED: 'onboardingCompleted',
    USER_NAME: 'userName',
    THEME_PREF: 'themePref',
    BILDIRIMLER: 'bildirimler',
    LAST_DRAWS_CACHE: 'lastDrawsCache',
    /** Kullanıcı kimliğine göre günlük AI kota kilitleri ({ userId: YYYY-MM-DD }). */
    AI_QUOTA_EXHAUSTED_DAY: 'aiQuotaExhaustedDay',
    /** Bugün Geçmiş'i açılmış kupon ID'leri ({ date, couponIds }) — userId ile birleştirilir. */
    VIEWED_HISTORY_TODAY: 'viewedHistoryToday',
    /**
     * Feature kota cache öneki. Tam anahtar: `featureQuotaCache:{feature}:{userId}`
     * Değer: JSON `{ day: YYYY-MM-DD, used: number }`.
     */
    FEATURE_QUOTA_CACHE_PREFIX: 'featureQuotaCache',
  } as const;