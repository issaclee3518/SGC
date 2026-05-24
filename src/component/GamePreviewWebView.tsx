import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PREVIEW_WEBVIEW_BASE_URL } from '../lib/previewWebView';

/** 수정마다 baseUrl 경로를 바꿔 WKWebView 캐시/빈 화면 방지 */
function previewBaseUrl(webKey: number): string {
  return `${PREVIEW_WEBVIEW_BASE_URL}rev-${webKey}/`;
}

const RUNTIME_CHECK_SCRIPT = `
(function check() {
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
  var c = document.querySelector('canvas');
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'game_ok',
    canvas: c ? (c.width + 'x' + c.height) : 'no-canvas'
  }));
})();
setTimeout(check, 400);
setTimeout(check, 1200);
true;
`;

export type GamePreviewWebViewMessage =
  | { type: 'game_error'; message?: string }
  | { type: 'game_ok'; canvas?: string };

type GamePreviewWebViewProps = {
  html: string;
  /** 고정 높이. `fill`이 true면 무시하고 부모 flex 영역을 채움 */
  height?: number;
  fill?: boolean;
  webKey: number;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (description: string) => void;
  onRuntimeMessage?: (data: GamePreviewWebViewMessage) => void;
};

export function GamePreviewWebView({
  html,
  height,
  fill = false,
  webKey,
  onLoadStart,
  onLoadEnd,
  onError,
  onRuntimeMessage,
}: GamePreviewWebViewProps) {
  const source = React.useMemo(
    () => ({ html, baseUrl: previewBaseUrl(webKey) }),
    [html, webKey],
  );

  const shellStyle = fill
    ? styles.shellFill
    : [styles.shell, height != null ? { height } : { flex: 1 }];

  return (
    <View style={shellStyle} collapsable={false}>
      <WebView
        key={`game-preview-${webKey}`}
        source={source}
        style={styles.webview}
        containerStyle={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        incognito={Platform.OS === 'ios'}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onError={(e) => onError?.(e.nativeEvent.description ?? 'WebView error')}
        onHttpError={(e) => onError?.(`HTTP ${e.nativeEvent.statusCode}`)}
        onMessage={(ev) => {
          try {
            const data = JSON.parse(
              ev.nativeEvent.data,
            ) as GamePreviewWebViewMessage;
            onRuntimeMessage?.(data);
          } catch {
            /* ignore */
          }
        }}
        injectedJavaScript={RUNTIME_CHECK_SCRIPT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  shellFill: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  webview: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
});
