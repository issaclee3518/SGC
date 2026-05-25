import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  FEED_PIPELINE_TEMPLATE,
  upsertStep,
  type PipelineStep,
} from '../lib/pipeline';
import { PipelinePanel } from './PipelinePanel';
import { GameLeaderboardPanel } from './GameLeaderboardPanel';
import { GameLikeButton } from './GameLikeButton';
import { submitLeaderboardScore } from '../lib/leaderboardService';

export type Game = {
  id: string;
  title: string;
  playUrl: string;
  storageBaseUrl: string;
  iconUrl?: string;
  likeCount?: number;
  likedByMe?: boolean;
};

type GameCardProps = {
  game: Game;
  height: number;
  showPipeline?: boolean;
  showLeaderboard?: boolean;
  onToggleLike?: (gameId: string) => void;
};

function isHtmlDocument(content: string): boolean {
  const t = content.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

const SCORE_BRIDGE_SCRIPT = `
(function() {
  if (window.__scoreBridgeInstalled) return;
  window.__scoreBridgeInstalled = true;
  window.reportGameScore = function(score) {
    var n = Number(score);
    if (!isFinite(n) || n < 0) return;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'game_score', score: n }));
    }
  };
})();
true;
`;

const RUNTIME_CHECK_SCRIPT = `
setTimeout(function() {
  if (!window.ReactNativeWebView) return;
  var el = document.getElementById('boot-error');
  if (el) {
    var txt = el.textContent || '';
    var spurious = txt === 'Script error.' || txt.indexOf('iOS가 상세를 숨김') !== -1;
    if (!spurious) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'game_error',
        message: txt || '게임 실행 오류'
      }));
      return;
    }
    el.parentNode.removeChild(el);
  }
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'game_ok' }));
}, 300);
true;
`;

export function GameCard({
  game,
  height,
  showPipeline = true,
  showLeaderboard = false,
  onToggleLike,
}: GameCardProps) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);
  const [pipelineSteps, setPipelineSteps] = React.useState<PipelineStep[]>(
    () => FEED_PIPELINE_TEMPLATE.map((s) => ({ ...s })),
  );

  const setStep = React.useCallback((patch: PipelineStep) => {
    setPipelineSteps((prev) => upsertStep(prev, patch));
  }, []);

  const bestSubmittedScore = React.useRef(-1);
  const [leaderboardTick, setLeaderboardTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      setErrorDetail(null);
      setHtml(null);
      setPipelineSteps(
        FEED_PIPELINE_TEMPLATE.map((s) =>
          s.id === 'feed_list'
            ? { ...s, status: 'ok', detail: `게임 id=${game.id}` }
            : { ...s, status: 'pending', detail: undefined, ms: undefined },
        ),
      );

      const fetchStart = Date.now();
      setStep({
        id: 'feed_fetch_html',
        label: '2. Storage HTML fetch',
        status: 'running',
        layer: 'client',
      });

      try {
        const res = await fetch(game.playUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const content = await res.text();
        if (cancelled) return;

        setStep({
          id: 'feed_fetch_html',
          label: '2. Storage HTML fetch',
          status: 'ok',
          ms: Date.now() - fetchStart,
          detail: `${content.length}자 · ${game.playUrl}`,
          layer: 'client',
        });

        if (!isHtmlDocument(content)) {
          setStep({
            id: 'feed_validate_html',
            label: '3. HTML 형식 검증',
            status: 'error',
            detail: 'HTML 문서가 아님 (.html 재발행 필요)',
            layer: 'client',
          });
          throw new Error('Not HTML document');
        }

        setStep({
          id: 'feed_validate_html',
          label: '3. HTML 형식 검증',
          status: 'ok',
          layer: 'client',
        });

        setHtml(content);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Load failed';
          setError(true);
          setErrorDetail(msg);
          setStep({
            id: 'feed_fetch_html',
            label: '2. Storage HTML fetch',
            status: 'error',
            detail: msg,
            layer: 'client',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [game.playUrl, game.id, setStep]);

  const pipelineHeight = showPipeline ? 140 : 0;
  const webHeight = Math.max(120, height - pipelineHeight);

  return (
    <View style={[styles.root, { height }]}>
      {showPipeline ? (
        <View style={styles.pipelineWrap}>
          <PipelinePanel
            title={`피드 렌더 · ${game.title}`}
            steps={pipelineSteps}
            defaultExpanded={error}
          />
        </View>
      ) : null}

      <View style={[styles.webWrap, { height: webHeight }]}>
        {html ? (
          <WebView
            source={{ html, baseUrl: game.storageBaseUrl }}
            style={styles.webview}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            onLoadStart={() => {
              setStep({
                id: 'feed_webview',
                label: '4. WebView 렌더',
                status: 'running',
                layer: 'client',
              });
            }}
            onLoadEnd={() => {
              setStep({
                id: 'feed_webview',
                label: '4. WebView 렌더',
                status: 'ok',
                layer: 'client',
              });
              setStep({
                id: 'feed_game_runtime',
                label: '5. 게임 JS 실행',
                status: 'running',
                layer: 'client',
              });
            }}
            onError={(e) => {
              const msg = e.nativeEvent.description ?? 'WebView error';
              setError(true);
              setErrorDetail(msg);
              setStep({
                id: 'feed_webview',
                label: '4. WebView 렌더',
                status: 'error',
                detail: msg,
                layer: 'client',
              });
            }}
            onMessage={(ev) => {
              try {
                const data = JSON.parse(ev.nativeEvent.data) as {
                  type?: string;
                  message?: string;
                  score?: number;
                };
                if (
                  showLeaderboard &&
                  data.type === 'game_score' &&
                  typeof data.score === 'number' &&
                  Number.isFinite(data.score)
                ) {
                  const score = Math.max(0, data.score);
                  if (score > bestSubmittedScore.current) {
                    bestSubmittedScore.current = score;
                    const gameId = Number(game.id);
                    if (Number.isFinite(gameId)) {
                      void submitLeaderboardScore(gameId, score)
                        .then(() => setLeaderboardTick((t) => t + 1))
                        .catch((err) => {
                          console.warn('leaderboard score:', err);
                          bestSubmittedScore.current = -1;
                        });
                    }
                  }
                } else if (data.type === 'game_error') {
                  setError(true);
                  setErrorDetail(data.message ?? '게임 JS 오류');
                  setStep({
                    id: 'feed_game_runtime',
                    label: '5. 게임 JS 실행',
                    status: 'error',
                    detail: data.message,
                    layer: 'client',
                  });
                } else if (data.type === 'game_ok') {
                  setStep({
                    id: 'feed_game_runtime',
                    label: '5. 게임 JS 실행',
                    status: 'ok',
                    detail: '실행 완료',
                    layer: 'client',
                  });
                }
              } catch {
                /* ignore */
              }
            }}
            injectedJavaScript={SCORE_BRIDGE_SCRIPT + RUNTIME_CHECK_SCRIPT}
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
              {errorDetail ?? game.title}
            </Text>
          </View>
        )}

        {showLeaderboard || onToggleLike ? (
          <View style={styles.actionsAnchor} pointerEvents="box-none">
            {showLeaderboard ? (
              <GameLeaderboardPanel
                gameId={game.id}
                refreshTick={leaderboardTick}
              />
            ) : null}
            {onToggleLike ? (
              <GameLikeButton
                likeCount={game.likeCount ?? 0}
                likedByMe={game.likedByMe ?? false}
                onPress={() => onToggleLike(game.id)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: '#0E0E0E',
    overflow: 'visible',
  },
  pipelineWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  webWrap: {
    width: '100%',
    overflow: 'visible',
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
  actionsAnchor: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 20,
    alignItems: 'center',
    gap: 10,
    overflow: 'visible',
  },
});
