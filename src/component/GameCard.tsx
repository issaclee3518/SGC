import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

export type Game = {
  id: string;
  title: string;
  description?: string;
  /** Supabase Storage public URL (빌드 완료 .html) */
  playUrl: string;
  storageBaseUrl: string;
};

type GameCardProps = {
  game: Game;
  height: number;
};

function isHtmlDocument(content: string): boolean {
  const t = content.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

/**
 * Storage의 .html을 fetch 후 WebView에 주입해 실행합니다.
 * uri만 쓰면(특히 expo web) HTML 소스가 글자로 보이는 경우가 있어 fetch 방식 사용.
 */
export function GameCard({ game, height }: GameCardProps) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      setHtml(null);

      try {
        const res = await fetch(game.playUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const content = await res.text();
        if (cancelled) return;

        if (!isHtmlDocument(content)) {
          throw new Error(
            'Storage file is not HTML. Re-publish via SGS so .html is saved.',
          );
        }

        setHtml(content);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [game.playUrl]);

  return (
    <View style={[styles.root, { height }]}>
      {html ? (
        <WebView
          source={{ html, baseUrl: game.storageBaseUrl }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
          onError={() => setError(true)}
          onHttpError={() => setError(true)}
        />
      ) : null}

      {loading && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.overlayText}>{game.title}</Text>
        </View>
      )}

      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>게임을 불러오지 못했습니다</Text>
          <Text style={styles.errorSub} numberOfLines={2}>
            {game.title}
          </Text>
          <Text style={styles.errorHint}>
            storage_path가 .html인지, Storage 파일이 HTML인지 확인하세요.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: '#0E0E0E',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,14,14,0.85)',
    gap: 12,
    paddingHorizontal: 24,
  },
  overlayText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },
  errorHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
