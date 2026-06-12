// components/ErrorBoundary.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from './ui/app-button';
import { Surface } from './ui/surface';
import { RefreshIcon } from '../lib/icons';
import { useTheme } from '../lib/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Bilinmeyen bir hata oluştu.' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.errorMessage} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  const c = theme.colors;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Surface style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: c.dangerSoft }]}>
          <RefreshIcon color={c.danger} size={32} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>Bir şeyler ters gitti</Text>
        <Text style={[styles.desc, { color: c.text2 }]}>
          Üzgünüz, beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </Text>
        {message ? (
          <View style={[styles.errorBox, { backgroundColor: c.surfaceAlt, borderColor: c.hairline }]}>
            <Text style={[styles.errorText, { color: c.text3 }]} numberOfLines={3}>
              {message}
            </Text>
          </View>
        ) : null}
        <AppButton
          label="Tekrar dene"
          variant="primary"
          size="md"
          fullWidth={false}
          onPress={onRetry}
          iconLeft={(color, size) => <RefreshIcon color={color} size={size} />}
        />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'PlusJakarta-ExtraBold',
    fontSize: 20,
    letterSpacing: -0.4,
  },
  desc: {
    fontFamily: 'PlusJakarta-Regular',
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 260,
  },
  errorBox: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontFamily: 'PlusJakarta-Medium',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});