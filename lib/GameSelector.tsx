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
};

const GameSelector = React.memo(function GameSelector({ selectedGame, onSelect, newResults = [] }: Props) {
  const theme = useTheme();
  const c = theme.colors;
  const countryGames = getGamesByCountry(getDefaultCountry());

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {countryGames.map((game) => {
        const color = GameAccent[game.id] ?? c.brand;
        const selected = selectedGame.id === game.id;
        const hasNew = newResults.includes(game.name);
        return (
          <PressableScale key={game.id} onPress={() => onSelect(game)}>
            <View
              style={[
                styles.card,
                { backgroundColor: selected ? color : c.surface, borderColor: selected ? color : c.border },
                theme.shadowSm,
              ]}
            >
              {hasNew ? <View style={[styles.newDot, { backgroundColor: c.danger, borderColor: selected ? color : c.surface }]} /> : null}
              {selected ? (
                <View style={styles.embWrap}>
                  <GameEmblem game={game.id} size={36} />
                </View>
              ) : (
                <GameEmblem game={game.id} size={36} />
              )}
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.name, { color: selected ? '#fff' : c.text }]} allowFontScaling={false}>
                  {game.name}
                </Text>
                <Text
                  style={[styles.meta, { color: selected ? 'rgba(255,255,255,0.82)' : c.text3 }]}
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
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  embWrap: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 11 },
  newDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2, zIndex: 2 },
  name: { fontFamily: 'PlusJakarta-Bold', fontSize: 12.5, textAlign: 'center' },
  meta: { fontFamily: 'PlusJakarta-SemiBold', fontSize: 10.5, marginTop: 2 },
});