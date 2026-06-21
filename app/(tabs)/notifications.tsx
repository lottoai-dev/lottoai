// app/(tabs)/notifications.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Surface } from '../../components/ui/surface';
import { Toggle } from '../../components/ui/toggle';
import { STORAGE_KEYS } from '../../constants/storage-keys';
import { AppTheme, GameAccent } from '../../constants/theme';
import { GameEmblem } from '../../lib/emblems';
import { GAMES, type Game, type GameId } from '../../lib/games';
import { t } from '../../lib/i18n';
import { BackIcon, BellIcon, CalendarIcon, CheckIcon, ClockIcon } from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type GameSettings = {
  before: boolean;
  beforeMinutes: number;
  after: boolean;
};

type NotifSettings = Partial<Record<GameId, GameSettings>>;
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
  onBeforeMinutesChange,
  theme,
}: {
  game: Game;
  settings: GameSettings;
  expandedGame: GameId | null;
  onToggleBefore: (gameId: GameId, value: boolean) => void;
  onToggleAfter: (gameId: GameId, value: boolean) => void;
  onBeforeMinutesChange: (gameId: GameId, minutes: number) => void;
  theme: AppTheme;
}) {
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);
  const color = GameAccent[game.id] ?? c.brand;
  const expanded = expandedGame === game.id;
  const nextDraw = useMemo(() => getNextDrawTime(game), [game]);

  return (
    <Surface style={s.gameCard}>
      <View style={[s.gameAccent, { backgroundColor: settings.before || settings.after ? color : 'transparent' }]} />
      <View style={s.gameInner}>
        <View style={s.gameHeader}>
          <GameEmblem game={game.id} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={s.gameName}>{game.name}</Text>
            <View style={s.gameMeta}>
              <CalendarIcon color={c.text3} size={13} />
              <Text style={s.gameMetaText}>
                {game.drawDaysLong} · {game.drawHour}:{String(game.drawMinute).padStart(2, '0')}
              </Text>
            </View>
          </View>
          <View style={[s.countdownBadge, { backgroundColor: color + '12', borderColor: color + '22' }]}>
            <ClockIcon color={color} size={12} />
            <CountdownLabel targetDate={nextDraw} theme={theme} />
          </View>
        </View>

        <View style={[s.toggleRow, { borderTopColor: c.hairline }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Çekiliş hatırlatıcısı</Text>
            <Text style={s.toggleDesc}>
              {settings.before
                ? `Çekilişten ${formatMinutes(settings.beforeMinutes)} önce bildirim`
                : 'Kapalı'}
            </Text>
          </View>
          <Toggle
            value={settings.before}
            onChange={(v) => { toggleHaptic(); onToggleBefore(game.id, v); }}
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
                      borderColor: active ? color : c.border,
                      backgroundColor: active ? color : 'transparent',
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
            <Text style={s.toggleLabel}>Sonuç bildirimi</Text>
            <Text style={s.toggleDesc}>
              {settings.after ? 'Sonuç açıklandığında anında bildirim' : 'Kapalı'}
            </Text>
          </View>
          <Toggle
            value={settings.after}
            onChange={(v) => { toggleHaptic(); onToggleAfter(game.id, v); }}
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
  const c = theme.colors;
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [hasPermission, setHasPermission] = useState(false);
  const [settings, setSettings] = useState<NotifSettings>({});
  const [expandedGame, setExpandedGame] = useState<GameId | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setHasPermission(status === 'granted');
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) setSettings(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const handleRequestPermission = async () => {
    toggleHaptic();
    setHasPermission(await requestPermission());
  };

  const getGameSettings = (gameId: GameId): GameSettings =>
    settings[gameId] ?? { before: false, beforeMinutes: 30, after: false };

  const handleToggleBefore = async (gameId: GameId, value: boolean) => {
    if (!hasPermission) { await handleRequestPermission(); return; }
    const gs = getGameSettings(gameId);
    const updated: GameSettings = { ...gs, before: value };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleNotifications(gameId, updated);
    if (value) setExpandedGame(gameId);
  };

  const handleToggleAfter = async (gameId: GameId, value: boolean) => {
    if (!hasPermission) { await handleRequestPermission(); return; }
    const gs = getGameSettings(gameId);
    const updated: GameSettings = { ...gs, after: value };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    const anyAfter = Object.values(newSettings).some((s) => s.after);
    await supabase
      .from('push_tokens')
      .update({ notify_results: anyAfter })
      .eq('token', (await Notifications.getExpoPushTokenAsync({
        projectId: '1686d4a1-7dbf-4293-a0b3-a71afc9e4a61',
      })).data);
  };

  const handleBeforeMinutesChange = async (gameId: GameId, minutes: number) => {
    if (!hasPermission) { await handleRequestPermission(); return; }
    const gs = getGameSettings(gameId);
    const updated: GameSettings = { ...gs, beforeMinutes: minutes };
    const newSettings = { ...settings, [gameId]: updated };
    setSettings(newSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    await scheduleNotifications(gameId, updated);
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
            style={[s.navBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
            hitSlop={6}
          >
            <BackIcon color={c.text2} size={22} />
          </Pressable>
          <Text style={s.navTitle}>Hatırlatıcılar</Text>
          <View style={{ width: 38 }} />
        </View>

        <Text style={s.subtitle}>Çekiliş öncesi ve sonrası bildirim al</Text>

        {!hasPermission ? (
          <PressableScale
            onPress={handleRequestPermission}
            style={[s.permCard, { backgroundColor: c.brandSoft, borderColor: c.brandBorder }]}
          >
            <View style={[s.permIcon, { backgroundColor: c.brand }]}>
              <BellIcon color={c.brandText} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.permTitle}>Bildirim izni gerekli</Text>
              <Text style={s.permDesc}>Hatırlatıcıları kullanmak için izin ver</Text>
            </View>
            <Text style={[s.permBtn, { color: c.brand }]}>İzin ver</Text>
          </PressableScale>
        ) : (
          <View style={[s.granted, { backgroundColor: c.brandSoft, borderColor: c.brandBorder }]}>
            <CheckIcon color={c.brand} size={18} />
            <Text style={[s.grantedText, { color: c.brand }]}>Bildirim izni verildi</Text>
          </View>
        )}

        <Text style={s.sectionTitle}>Oyun hatırlatıcıları</Text>

        {GAMES.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            settings={getGameSettings(game.id)}
            expandedGame={expandedGame}
            onToggleBefore={handleToggleBefore}
            onToggleAfter={handleToggleAfter}
            onBeforeMinutesChange={handleBeforeMinutesChange}
            theme={theme}
          />
        ))}

        <View style={[s.note, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}>
          <ClockIcon color={c.text3} size={15} />
          <Text style={s.noteText}>
            Bildirimler çekiliş kapanış saatinden seçtiğiniz süre kadar önce gönderilir.
            Sonuç bildirimleri ise sonuçlar açıklandığı anda iletilir.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

async function requestPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    Alert.alert(t('notifTitle'), t('notifDeviceWarning'));
    return false;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(t('notifPermRequired'), t('notifPermSettings'));
    return false;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('lottoai', {
      name: t('notifChannelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  return true;
}

async function scheduleNotifications(gameId: GameId, settings: GameSettings) {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.gameId === gameId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const hourStr = String(game.drawHour).padStart(2, '0');
  const minuteStr = String(game.drawMinute).padStart(2, '0');

  for (const day of game.drawDays) {
    const weekday = day === 0 ? 1 : day + 1;

    if (settings.before) {
      const beforeDate = new Date();
      beforeDate.setHours(game.drawHour, game.drawMinute, 0, 0);
      beforeDate.setMinutes(beforeDate.getMinutes() - settings.beforeMinutes);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notifBeforeTitle', { name: game.name }),
          body: t('notifBeforeBody', { hour: hourStr, minute: minuteStr }),
          sound: true,
          data: { gameId, type: 'before', screen: 'generate' },
        },
        trigger: {
          type: 'weekly',
          weekday,
          hour: beforeDate.getHours(),
          minute: beforeDate.getMinutes(),
          repeats: true,
        } as any,
      });
    }
  }
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
    navBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...ty.h3, color: c.text },
    subtitle: { ...ty.bodyMedium, color: c.text2, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },

    permCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: spacing.xl, padding: 16, borderRadius: radius.lg,
      borderWidth: 1, marginBottom: spacing.md,
    },
    permIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    permTitle: { ...ty.title, color: c.text },
    permDesc: { ...ty.caption, color: c.text2, marginTop: 2 },
    permBtn: { ...ty.label, fontFamily: theme.font.bold },

    granted: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginHorizontal: spacing.xl, padding: 13,
      borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg,
    },
    grantedText: { ...ty.bodySemibold },

    sectionTitle: { ...ty.h3, color: c.text, paddingHorizontal: spacing.xl, marginBottom: 12 },

    gameCard: {
      marginHorizontal: spacing.xl, marginBottom: 12,
      flexDirection: 'row', overflow: 'hidden', borderRadius: radius.xl,
    },
    gameAccent: { width: 4 },
    gameInner: { flex: 1, padding: 16 },
    gameHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    gameName: { ...ty.h3, color: c.text, flex: 1 },
    gameMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    gameMetaText: { ...ty.caption, color: c.text3 },
    countdownBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: radius.pill, borderWidth: 1,
    },

    toggleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, borderTopWidth: 1, marginTop: 8,
    },
    toggleLabel: { ...ty.bodySemibold, color: c.text },
    toggleDesc: { ...ty.caption, color: c.text3, marginTop: 2 },

    timeOptionsRow: {
      flexDirection: 'row', gap: 8,
      paddingVertical: 10, borderTopWidth: 1, marginTop: 4,
    },
    timeOption: {
      flex: 1, alignItems: 'center', paddingVertical: 8,
      borderRadius: radius.sm, borderWidth: 1,
    },
    timeOptionText: { ...ty.caption, fontFamily: theme.font.bold },

    note: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      marginHorizontal: spacing.xl, marginTop: spacing.sm,
      padding: 13, borderRadius: radius.md, borderWidth: 1,
    },
    noteText: { ...ty.caption, color: c.text2, flex: 1, lineHeight: 18 },
  });
}