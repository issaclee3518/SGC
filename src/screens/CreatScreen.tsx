import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  checkApiHealth,
  generateGamePreview,
  getApiBase,
  publishGame,
  reviseGamePreview,
  type GamePreview,
} from '../lib/aiService';

const MAX_PROMPT_LENGTH = 2000;
const PREVIEW_HEIGHT = Math.min(360, Dimensions.get('window').height * 0.42);

type CreatScreenProps = {
  onGameCreated?: () => void;
};

/**
 * 생성 → 클라이언트 미리보기 → 수정(재생성) → 완성(Supabase 저장)
 */
export function CreatScreen({ onGameCreated }: CreatScreenProps) {
  const [prompt, setPrompt] = React.useState('');
  const [revisionPrompt, setRevisionPrompt] = React.useState('');
  const [draft, setDraft] = React.useState<GamePreview | null>(null);
  const [showRevision, setShowRevision] = React.useState(false);
  const [busy, setBusy] = React.useState<'generate' | 'revise' | 'publish' | null>(
    null,
  );
  const [apiOk, setApiOk] = React.useState<boolean | null>(null);
  const apiBase = getApiBase();

  React.useEffect(() => {
    let cancelled = false;
    checkApiHealth().then((ok) => {
      if (!cancelled) setApiOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const isBusy = busy !== null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>AI 게임 제작</Text>
        <Text style={styles.subtitle}>
          생성하기로 미리보기 후 테스트하고, 수정·완성으로 반영합니다. 완성 시에만
          Supabase에 저장됩니다.
        </Text>
        {__DEV__ ? (
          <Text
            style={[
              styles.apiHint,
              apiOk === false && styles.apiHintError,
              apiOk === true && styles.apiHintOk,
            ]}
          >
            API: {apiBase}
            {apiOk === null
              ? ' (연결 확인 중…)'
              : apiOk
                ? ' · 서버 연결됨'
                : ' · 서버 없음 — SGS npm run dev (5001)'}
          </Text>
        ) : null}

        <Text style={styles.label}>게임 프롬프트</Text>
        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="예: 탭하면 점프하는 러너. 장애물을 피하고 점수를 올리는 미니게임."
          placeholderTextColor="rgba(255,255,255,0.35)"
          multiline
          textAlignVertical="top"
          maxLength={MAX_PROMPT_LENGTH}
          editable={!isBusy}
        />
        <Text style={styles.counter}>
          {prompt.length} / {MAX_PROMPT_LENGTH}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (!prompt.trim() || isBusy) && styles.btnDisabled,
            pressed && prompt.trim() && !isBusy && styles.btnPressed,
          ]}
          disabled={!prompt.trim() || isBusy}
          onPress={async () => {
            setBusy('generate');
            try {
              const preview = await generateGamePreview(prompt);
              setDraft(preview);
              setShowRevision(false);
              setRevisionPrompt('');
            } catch (e) {
              Alert.alert('오류', e instanceof Error ? e.message : '생성 실패');
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'generate' ? (
            <ActivityIndicator color="#0E0E0E" />
          ) : (
            <Text style={styles.primaryBtnText}>생성하기</Text>
          )}
        </Pressable>

        {draft ? (
          <View style={styles.previewSection}>
            <Text style={styles.label}>미리보기 (테스트)</Text>
            <View style={[styles.previewBox, { height: PREVIEW_HEIGHT }]}>
              <WebView
                source={{ html: draft.html }}
                style={styles.previewWeb}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
              />
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
                disabled={isBusy}
                onPress={() => setShowRevision((v) => !v)}
              >
                <Text style={styles.secondaryBtnText}>수정</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.completeBtn,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
                disabled={isBusy}
                onPress={async () => {
                  setBusy('publish');
                  try {
                    await publishGame({
                      html: draft.html,
                      name: draft.name,
                    });
                    setDraft(null);
                    setPrompt('');
                    setRevisionPrompt('');
                    setShowRevision(false);
                    onGameCreated?.();
                    Alert.alert(
                      '완료',
                      '게임이 저장되었습니다. Games 탭에서 확인하세요.',
                    );
                  } catch (e) {
                    Alert.alert(
                      '오류',
                      e instanceof Error ? e.message : '저장 실패',
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === 'publish' ? (
                  <ActivityIndicator color="#0E0E0E" />
                ) : (
                  <Text style={styles.primaryBtnText}>완성</Text>
                )}
              </Pressable>
            </View>

            {showRevision ? (
              <View style={styles.revisionBlock}>
                <Text style={styles.label}>수정할 내용</Text>
                <TextInput
                  style={styles.revisionInput}
                  value={revisionPrompt}
                  onChangeText={setRevisionPrompt}
                  placeholder="예: 점프 높이를 더 높게, 적 속도를 느리게"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  multiline
                  textAlignVertical="top"
                  maxLength={MAX_PROMPT_LENGTH}
                  editable={!isBusy}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    styles.applyRevisionBtn,
                    (!revisionPrompt.trim() || isBusy) && styles.btnDisabled,
                    pressed &&
                      revisionPrompt.trim() &&
                      !isBusy &&
                      styles.btnPressed,
                  ]}
                  disabled={!revisionPrompt.trim() || isBusy}
                  onPress={async () => {
                    setBusy('revise');
                    try {
                      const preview = await reviseGamePreview({
                        js: draft.js,
                        revisionPrompt,
                        originalPrompt: prompt,
                      });
                      setDraft(preview);
                      setRevisionPrompt('');
                      setShowRevision(false);
                    } catch (e) {
                      Alert.alert(
                        '오류',
                        e instanceof Error ? e.message : '수정 실패',
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === 'revise' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.secondaryBtnText}>수정 적용</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
    marginBottom: 12,
  },
  apiHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  apiHintOk: {
    color: 'rgba(120,220,160,0.9)',
  },
  apiHintError: {
    color: 'rgba(255,120,120,0.95)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
  },
  input: {
    minHeight: 140,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  counter: {
    marginTop: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'right',
  },
  primaryBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  completeBtn: {
    flex: 1,
    marginTop: 0,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0E0E0E',
  },
  btnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  btnPressed: {
    opacity: 0.9,
  },
  previewSection: {
    marginTop: 28,
  },
  previewBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#0E0E0E',
  },
  previewWeb: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  revisionBlock: {
    marginTop: 16,
  },
  revisionInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  applyRevisionBtn: {
    marginTop: 12,
  },
});
