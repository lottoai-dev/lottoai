// lib/GameSelector.tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../components/ui/surface';
import { GameAccent } from '../constants/theme';
import { GameEmblem } from './emblems';
import { getDefaultCountry, getGamesByCountry, type Game } from './games';
import { useTheme } from './theme';

type Props = {
  selectedGame: Game;
  onSelect: (game: Game) => void;
  newResults?: string[];
  variant?: 'default' | 'compact';
};

const GameSelector = React.memo(function GameSelector({
  selectedGame,
  onSelect,
  newResults = [],
  variant = 'default',
}: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const countryGames = getGamesByCountry(getDefaultCountry());

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {countryGames.map((game) => {
        const color = GameAccent[game.id] ?? c.brand;
        const selected = selectedGame.id === game.id;
        const hasNew = newResults.includes(game.name);
        const compact = variant === 'compact';
        return (
          <PressableScale key={game.id} onPress={() => onSelect(game)}>
            <View
              style={[
                styles.card,
                compact && styles.compactCard,
                {
                  backgroundColor: selected
                    ? compact
                      ? color + '18'
                      : color
                    : c.surface,
                },
              ]}
            >
              {hasNew ? (
                <View
                  style={[
                    styles.newDot,
                    compact && styles.compactNewDot,
                    { backgroundColor: c.danger },
                  ]}
                />
              ) : null}
              {selected && !compact ? (
                <View style={styles.embWrap}>
                  <GameEmblem game={game.id} size={compact ? 30 : 36} />
                </View>
              ) : (
                <GameEmblem game={game.id} size={compact ? 30 : 36} />
              )}
              <View style={{ alignItems: compact ? 'flex-start' : 'center', flexShrink: 1 }}>
                <Text
                  style={[
                    styles.name,
                    compact && styles.compactName,
                    { color: selected ? (compact ? color : '#fff') : c.text },
                  ]}
                  allowFontScaling={false}
                  numberOfLines={1}
                >
                  {game.name}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: selected && !compact ? 'rgba(255,255,255,0.82)' : c.text3 },
                  ]}
                  allowFontScaling={false}
                >
                  {game.count} / {game.max}
                </Text>
              </View>
            </View>
          </PressableScale>
        );
      })}
      <View style={{ width: 8 }} />
    </ScrollView>
  );
});

export default GameSelector;

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 10 },
  card: {
    minWidth: 118,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    gap: 8,
  },
  compactCard: {
    minWidth: 152,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  compactName: { maxWidth: 96, textAlign: 'left' },
  embWrap: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 11 },
  newDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, zIndex: 2 },
  compactNewDot: { top: 5, right: 5 },
  name: { fontFamily: 'PlusJakarta-SemiBold', fontSize: 12.5, textAlign: 'center' },
  meta: { fontFamily: 'PlusJakarta-Medium', fontSize: 10.5, marginTop: 2 },
});
