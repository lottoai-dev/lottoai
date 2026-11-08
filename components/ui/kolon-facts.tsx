// components/ui/kolon-facts.tsx
// Kolonun aktif filtrelere göre özetini küçük etiketler hâlinde gösterir
// (✓ 3 çift · 3 tek, ✓ Toplam 142 (120–160) …). Hesap lib/kolonFacts.ts'te.
// Filtre yoksa hiçbir şey çizmez.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { KolonFact } from '../../lib/kolonFacts';
import { CheckIcon, CloseIcon } from '../../lib/icons';
import { useTheme } from '../../lib/theme';

export function KolonFacts({ facts, accent }: { facts: KolonFact[]; accent: string }) {
  const theme = useTheme();
  const c = theme.colors;

  if (facts.length === 0) return null;

  return (
    <View style={styles.row} accessibilityLabel="Filtre özeti">
      {facts.map((fact) => {
        const color = fact.ok ? accent : c.text3;
        return (
          <View
            key={fact.key}
            style={[
              styles.pill,
              { backgroundColor: fact.ok ? `${accent}14` : c.surfaceAlt, borderRadius: theme.radius.pill },
            ]}
            accessibilityLabel={`${fact.label}${fact.ok ? '' : ', sağlanmadı'}`}
          >
            {fact.ok ? (
              <CheckIcon color={color} size={12} strokeWidth={2.6} />
            ) : (
              <CloseIcon color={color} size={12} />
            )}
            <Text style={[theme.typography.caption, styles.label, { color, fontFamily: theme.font.semibold }]}>
              {fact.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  label: { fontVariant: ['tabular-nums'] },
});
