// lib/GameSelector.tsx
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GAME_COLORS, getDefaultCountry, getGamesByCountry, type Game } from './games';

type Props = {
  selectedGame: Game;
  onSelect: (game: Game) => void;
  newResults?: string[];
};

export default function GameSelector({ selectedGame, onSelect, newResults = [] }: Props) {
  const country = getDefaultCountry();
  const countryGames = getGamesByCountry(country);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.selector}>
      {countryGames.map((game) => {
        const gc = GAME_COLORS[game.name as keyof typeof GAME_COLORS];
        const color = gc?.main || '#6C63FF';
        const isSelected = selectedGame.id === game.id;
        const hasNew = newResults.includes(game.name);
        return (
          <View key={game.id} style={styles.tabWrapper}>
            {hasNew && <View style={styles.newDot} />}
            <TouchableOpacity
              style={[styles.tab, isSelected && { backgroundColor: color, borderColor: color }]}
              onPress={() => onSelect(game)}>
              <Text style={styles.emoji}>{game.icon}</Text>
              <Text style={[styles.name, isSelected && { color: '#fff' }]}>
                {game.name}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  selector: {
    paddingLeft: 20,
    marginBottom: 16,
  },
  tabWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  newDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF6B6B',
    position: 'absolute',
    top: 0,
    right: 2,
    zIndex: 1,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  tab: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    minWidth: 100,
  },
  emoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  name: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});