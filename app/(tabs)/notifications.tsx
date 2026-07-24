// app/(tabs)/notifications.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Surface } from '../../components/ui/surface';
import { Toggle } from '../../components/ui/toggle';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme } from '../../constants/theme';
import { useAlert } from '../../contexts/AlertContext';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, getGameAccentColor, type Game, type GameId } from '../../lib/games';
import { t } from '../../lib/i18n';
import { BackIcon, BellIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ClockIcon } from '../../lib/icons';
import {
  applyNotificationSettings,
  getGameSettings,
  initializeNotificationSettingsIfNeeded,
  loadNotificationSettings,
  requestNotificationPermissionWithAlert,
  scheduleGameNotifications,
  type GameSettings,
  type NotifSettings,
} from '../../lib/notificationSettings';
import { syncNotifyResults } from '../../lib/push-token';
import { useTheme } from '../../lib/theme';

const SETTINGS_KEY = STORAGE_KEYS.NOTIFICATION_SETTINGS;

const BEFORE_OPTIONS = [15, 30, 60, 120] as const;

function formatMinutes(min: number): string {
  if (min < 60) return `${min} dk`;
  return `${min / 60} saat`;
}

function toggleHaptic() {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

function getNextDrawTime(game: Game): Date | null {
  const now = new Date();
  let earliest: Date | null = null;

  for (const day of game.drawDays) {
    const candidate = new Date();
    candidate.setHours(game.drawHour, game.drawMinute, 0, 0);
    const currentDay = now.getDay();
    let daysUntil = day - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && candidate <= now) daysUntil = 7;
    candidate.setDate(candidate.getDate() + daysUntil);
    if (!earliest || candidate < earliest) earliest = candidate;
  }
  return earliest;
}

function useCountdown(targetDate: Date | null) {
  const [parts, setParts] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!targetDate) { setParts(null); return; }
    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setParts({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      const totalSeconds = Math.floor(diff / 1000);
      setParts({
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return parts;
}

function CountdownLabel({ targetDate, theme }: { targetDate: Date | null; theme: AppTheme }) {
  const parts = useCountdown(targetDate);
  const c = theme.colors;

  if (!parts) return <Text style={{ ...theme.typography.caption, color: c.text3 }}>—</Text>;

  if (parts.days === 0 && parts.hours === 0 && parts.minutes === 0 && parts.seconds === 0) {
    return (
      <Text style={{ ...theme.typography.caption, color: c.brand, fontFamily: theme.font.bold }}>
        Şimdi!
      </Text>
    );
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const showDays = parts.days > 0;
  const segments = showDays
    ? [`${parts.days}g`, `${pad(parts.hours)}s`, `${pad(parts.minutes)}dk`]
    : [`${pad(parts.hours)}s`, `${pad(parts.minutes)}dk`, `${pad(parts.seconds)}sn`];

  return (
    <Text style={{ ...theme.typography.caption, color: c.text2, fontVariant: ['tabular-nums'] }}>
      {segments.join(' : ')}
    </Text>
  );
}

function GameCard({
  game,
  settings,
  expandedGame,
  onToggleBefore,
  onToggleAfter,
  onExpandBefore,
  onBeforeMinutesChange,
  theme,
}: {
  game: Game;
  settings: GameSettings;
  expandedGame: GameId | null;
  onToggleBefore: (gameId: GameId, value: boolean) => void;
  onToggleAfter: (gameId: GameId, value: boolean) => void;
  onExpandBefore: (gameId: GameId) => void;
  onBeforeMinutesChange: (gameId: GameId, minutes: number) => void;
  theme: AppTheme;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const color = getGameAccentColor(game.id);
  const expanded = expandedGame === game.id;
  const nextDraw = useMemo(() => getNextDrawTime(game), [game]);

  return (
    <Surface style={s.gameCard}>
      <View style={[s.gameAccent, { backgroundColor: color }]} />
      <View style={s.gameInner}>
        <View style={s.gameHeader}>
          <View style={[s.gameEmblem, { backgroundColor: `${color}14` }]}>
            <GameEmblem game={game.id} size={38} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.gameName, { color }]}>{game.name}</Text>
            <View style={s.gameMeta}>
              <CalendarIcon color={c.text3} size={13} />
              <Text style={s.gameMetaText}>
                {game.drawDaysLong} · {game.drawHour}:{String(game.drawMinute).padStart(2, '0')}
              </Text>
            </View>
          </View>
          <View style={[s.countdownBadge, { backgroundColor: `${color}14` }]}>
            <ClockIcon color={color} size={12} />
            <CountdownLabel targetDate={nextDraw} theme={theme} />
          </View>
        </View>

        <View style={[s.toggleRow, { borderTopColor: c.hairline }]}>
          <Pressable
            style={({ pressed }) => [s.togglePressable, pressed && settings.before && { opacity: 0.7 }]}
            onPress={() => {
              if (!settings.before) return;
              toggleHaptic();
              onExpandBefore(game.id);
            }}
            disabled={!settings.before}
          >
            <View style={s.toggleTextWrap}>
              <Text style={s.toggleLabel}>Çekiliş hatırlatıcısı</Text>
              <Text style={[s.toggleDesc, settings.before && !expanded && s.toggleDescActive]}>
                {settings.before
                  ? expanded
                    ? `Süreyi seç · ${formatMinutes(settings.beforeMinutes)}`
                    : `Çekilişten ${formatMinutes(settings.beforeMinutes)} önce · Süreyi değiştir`
                  : 'Kapalı'}
              </Text>
            </View>
            {settings.before ? (
              <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                <ChevronDownIcon color={c.text3} size={18} strokeWidth={2.2} />
              </View>
            ) : null}
          </Pressable>
          <Toggle
            value={settings.before}
            onChange={(v) => { onToggleBefore(game.id, v); }}
            accent={color}
          />
        </View>

        {settings.before && expanded ? (
          <View style={[s.timeOptionsRow, { borderTopColor: c.hairline }]}>
            {BEFORE_OPTIONS.map((opt) => {
              const active = settings.beforeMinutes === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => { toggleHaptic(); onBeforeMinutesChange(game.id, opt); }}
                  style={[
                    s.timeOption,
                    {
                      backgroundColor: active ? color : c.surfaceAlt,
                    },
                  ]}
                >
                  <Text style={[s.timeOptionText, { color: active ? '#fff' : c.text2 }]}>
                    {formatMinutes(opt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[s.toggleRow, { borderTopColor: c.hairline }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>{t('notifToggleAfterLabel')}</Text>
            <Text style={s.toggleDesc}>
              {settings.after ? t('notifToggleAfterDesc') : 'Kapalı'}
            </Text>
          </View>
          <Toggle
            value={settings.after}
            onChange={(v) => { onToggleAfter(game.id, v); }}
            accent={color}
          />
        </View>
      </View>
    </Surface>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { showAlert } = useAlert();
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [hasPermission, setHasPermission] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [settings, setSettings] = useState<NotifSettings>({});
  const [expandedGame, setExpandedGame] = useState<GameId | null>(null);

  const refreshPermission = useCallback(async () => {
    const { status, canAskAgain: askAgain } = await Notifications.getPermissionsAsync();
    const granted = status === 'granted';
    setHasPermission(granted);
    setCanAskAgain(askAgain !== false);
    return granted;
  }, []);

  const applySettingsAfterPermission = useCallback(async (loaded: NotifSettings) => {
    await applyNotificationSettings(loaded);
  }, []);

  useEffect(() => {
    (async () => {
      const granted = await refreshPermission();

      let loaded = await loadNotificationSettings();
      const initialized = await initializeNotificationSettingsIfNeeded(true);
      if (initialized) loaded = initialized;

      setSettings(loaded);

      if (!granted) return;
      await applySettingsAfterPermission(loaded);
    })();
  }, [applySettingsAfterPermission, refreshPermission]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const wasGranted = hasPermission;
      const granted = await refreshPermission();
      // Kullanıcı Ayarlar'dan izin verdiyse ayarları yeniden uygula
      if (!wasGranted && granted) {
        try {
          let loaded = await loadNotificationSettings();
          const initialized = await initializeNotificationSettingsIfNeeded(true);
          if (initialized) loaded = initialized;
          setSettings(loaded);
          await applySettingsAfterPermission(loaded);
        } catch {}
      }
    });
    return () => sub.remove();
  }, [applySettingsAfterPermission, hasPermission, refreshPermission]);

  const openSystemSettings = () => {
    Linking.openSettings();
  };

  const handleRequestPermission = async (): Promise<boolean> => {
    if (!canAskAgain) {
      openSystemSettings();
      return false;
    }
    const granted = await requestNotificationPermissionWithAlert(showAlert);
    await refreshPermission();
    if (granted) {
      try {
        let loaded = await loadNotificationSettings();
        const initialized = await initializeNotificationSettingsIfNeeded(true);
        if (initialized) loaded = initialized;
        await applySettingsAfterPermission(loaded);
      } catch {}
    }
    return granted;
  };

  const ensurePermission = async (): Promise<boolean> => {
    if (hasPermission) return true;
    if (!canAskAgain) {
      showAlert(t('notifPermRequired'), t('notifPermSettings'), [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    return handleRequestPermission();
  };

  const resolveGameSettings = (gameId: GameId): GameSettings => getGameSettings(settings, gameId);

  const handleExpandBefore = (gameId: GameId) => {
    setExpandedGame((prev) => (prev === gameId ? null : gameId));
  };

  const handleToggleBefore = async (gameId: GameId, value: boolean) => {
    if (!(await ensurePermission())) return;
    const gs = resolveGameSettings(gameId);
    const updated: GameSettings = { ...gs, before: value };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleGameNotifications(gameId, updated);
    if (value) setExpandedGame(gameId);
    else setExpandedGame((prev) => (prev === gameId ? null : prev));
  };

  const handleToggleAfter = async (gameId: GameId, value: boolean) => {
    if (!(await ensurePermission())) return;
    const gs = resolveGameSettings(gameId);
    const updated: GameSettings = { ...gs, after: value };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleGameNotifications(gameId, updated);
    const anyAfter = Object.values(newSettings).some((entry) => entry?.after);
    await syncNotifyResults(anyAfter);
  };

  const handleBeforeMinutesChange = async (gameId: GameId, minutes: number) => {
    if (!(await ensurePermission())) return;
    const gs = resolveGameSettings(gameId);
    const updated: GameSettings = { ...gs, beforeMinutes: minutes };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleGameNotifications(gameId, updated);
    setExpandedGame(null);
  };

  return (
    <View style={s.container}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40 }}
      >
        <View style={s.nav}>
          <Pressable
            onPress={() => { toggleHaptic(); router.back(); }}
            style={[s.navBtn, { backgroundColor: c.surface }]}
            hitSlop={6}
          >
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <Text style={s.navTitle}>Hatırlatıcılar</Text>
          <View style={{ width: 38 }} />
        </View>

        <Text style={s.subtitle}>Çekiliş hatırlatıcısı ve sonuç bildirimi</Text>

        {!hasPermission ? (
          <PressableScale
            onPress={canAskAgain ? handleRequestPermission : openSystemSettings}
          >
            <Surface style={s.permCard}>
              <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
              <View style={[s.permIcon, { backgroundColor: c.brandSoft }]}>
                <BellIcon color={c.brand} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.permTitle}>
                  {canAskAgain ? t('notifPermission') : 'Bildirim izni kapalı'}
                </Text>
                <Text style={s.permDesc}>
                  {canAskAgain
                    ? t('notifPermissionDesc')
                    : 'Hatırlatıcılar için Ayarlar\'dan bildirim iznini aç'}
                </Text>
              </View>
              <Text style={[s.permBtn, { color: c.brand }]}>
                {canAskAgain ? 'İzin ver' : 'Ayarları aç'}
              </Text>
            </Surface>
          </PressableScale>
        ) : (
          <Surface style={s.granted}>
            <View style={[s.panelAccent, { backgroundColor: c.brand }]} />
            <CheckIcon color={c.brand} size={18} />
            <Text style={s.grantedText}>{t('notifGranted')}</Text>
          </Surface>
        )}

        <Text style={s.sectionTitle}>Oyun hatırlatıcıları</Text>

        {GAMES.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            settings={resolveGameSettings(game.id)}
            expandedGame={expandedGame}
            onToggleBefore={handleToggleBefore}
            onToggleAfter={handleToggleAfter}
            onExpandBefore={handleExpandBefore}
            onBeforeMinutesChange={handleBeforeMinutesChange}
            theme={theme}
          />
        ))}

        <View style={[s.note, { backgroundColor: c.surfaceAlt }]}>
          <ClockIcon color={c.text3} size={15} />
          <Text style={s.noteText}>
            Çekiliş hatırlatıcıları kapanış saatinden seçtiğiniz süre kadar önce gelir.
            Sonuç bildirimleri yalnızca çekiliş sonuçları uygulamaya girildiğinde gönderilir; Kuponlarım'a yönlendirir.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  const c = theme.colors;
  const { spacing, radius, typography: ty } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    nav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 6,
    },
    navBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...ty.h3, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, paddingHorizontal: spacing.xl, marginBottom: spacing.md },

    permCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: spacing.xl, padding: 16, paddingLeft: 20,
      borderRadius: radius.xl, marginBottom: spacing.md, overflow: 'hidden',
    },
    panelAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    permIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    permTitle: { ...ty.title, color: c.text },
    permDesc: { ...ty.caption, color: c.text3, marginTop: 2 },
    permBtn: { ...ty.label },

    granted: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginHorizontal: spacing.xl, padding: 13, paddingLeft: 17,
      borderRadius: radius.lg, marginBottom: spacing.lg, overflow: 'hidden',
    },
    grantedText: { ...ty.bodySemibold, color: c.text },

    sectionTitle: { ...ty.h3, color: c.text, paddingHorizontal: spacing.xl, marginBottom: 12 },

    gameCard: {
      marginHorizontal: spacing.xl, marginBottom: 12,
      flexDirection: 'row', overflow: 'hidden', borderRadius: radius.xl,
    },
    gameAccent: { width: 4 },
    gameInner: { flex: 1, padding: 16 },
    gameHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    gameEmblem: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gameName: { ...ty.h3, flex: 1 },
    gameMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    gameMetaText: { ...ty.caption, color: c.text3 },
    countdownBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: radius.pill,
    },

    toggleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, marginTop: 8,
    },
    togglePressable: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    toggleTextWrap: { flex: 1 },
    toggleLabel: { ...ty.bodySemibold, color: c.text },
    toggleDesc: { ...ty.caption, color: c.text3, marginTop: 2 },
    toggleDescActive: { color: c.text2 },

    timeOptionsRow: {
      flexDirection: 'row', gap: 8,
      paddingVertical: 10, marginTop: 4,
    },
    timeOption: {
      flex: 1, alignItems: 'center', paddingVertical: 8,
      borderRadius: radius.md, backgroundColor: c.surfaceAlt,
    },
    timeOptionText: { ...ty.caption, fontFamily: theme.font.semibold },

    note: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      marginHorizontal: spacing.xl, marginTop: spacing.sm,
      padding: 13, borderRadius: radius.lg,
    },
    noteText: { ...ty.caption, color: c.text2, flex: 1, lineHeight: 18 },
  });
}