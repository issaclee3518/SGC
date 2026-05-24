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
import { GamePreviewWebView } from '../component/GamePreviewWebView';
import { PipelinePanel } from '../component/PipelinePanel';
import {
  ApiPipelineError,
  checkApiHealth,
  createChatSession,
  generateGamePreview,
  getApiBase,
  publishGame,
  reviseGamePreview,
  sendChatMessage,
  type ChatMessage,
  type GamePreview,
} from '../lib/aiService';
import {
  CREATE_PIPELINE_TEMPLATE,
  mergeServerPipeline,
  upsertStep,
  type PipelineStep,
} from '../lib/pipeline';
import { getReviseSource } from '../lib/reviseSource';
import { useAuth } from '../context/AuthContext';

const MAX_CHAT_LENGTH = 500;
const WINDOW_HEIGHT = Dimensions.get('window').height;
/** 스크롤 위 미리보기 WebView 높이 (아래로 내리면 진단 패널) */
const PREVIEW_VIEWPORT_HEIGHT = Math.round(
  Math.min(520, Math.max(320, WINDOW_HEIGHT * 0.58)),
);

type CreatScreenProps = {
  onGameCreated?: () => void;
};

function getPlanningSummary(messages: ChatMessage[]): string {
  const summaryMsg = [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === 'assistant' &&
        (m.content.includes('✅ 기획 요약:') || m.content.includes('기획 요약:')),
    );
  if (summaryMsg) {
    return summaryMsg.content
      .replace(/^[\s\S]*?(?:✅\s*)?기획 요약:\s*/u, '')
      .trim();
  }
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' / ');
}

function hasUserMessage(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === 'user');
}

function initCreatePipeline(healthOk: boolean | null): PipelineStep[] {
  return CREATE_PIPELINE_TEMPLATE.map((s) =>
    s.id === 'client_health'
      ? {
          ...s,
          status:
            healthOk === null
              ? 'running'
              : healthOk
                ? 'ok'
                : 'error',
          detail:
            healthOk === null
              ? undefined
              : healthOk
                ? 'GET /api/games/health'
                : 'SGS 미연결',
        }
      : { ...s },
  );
}

/**
 * 생성 → 미리보기(진단) → 수정 → 완성(Supabase)
 */
export function CreatScreen({ onGameCreated }: CreatScreenProps) {
  const { session: authSession } = useAuth();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState('');
  const [chatBusy, setChatBusy] = React.useState(false);
  const [readyToBuild, setReadyToBuild] = React.useState(false);
  const [planningSummary, setPlanningSummary] = React.useState('');
  const chatScrollRef = React.useRef<ScrollView>(null);
  const [revisionPrompt, setRevisionPrompt] = React.useState('');
  const [draft, setDraft] = React.useState<GamePreview | null>(null);
  const [showRevision, setShowRevision] = React.useState(false);
  const [busy, setBusy] = React.useState<'generate' | 'revise' | 'publish' | null>(
    null,
  );
  const [apiOk, setApiOk] = React.useState<boolean | null>(null);
  const [pipelineSteps, setPipelineSteps] = React.useState<PipelineStep[]>(() =>
    initCreatePipeline(null),
  );
  const [previewKey, setPreviewKey] = React.useState(0);
  const apiBase = getApiBase();

  const setPipeline = React.useCallback(
    (updater: (prev: PipelineStep[]) => PipelineStep[]) => {
      setPipelineSteps(updater);
    },
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    checkApiHealth().then((ok) => {
      if (!cancelled) {
        setApiOk(ok);
        setPipelineSteps(initCreatePipeline(ok));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  React.useEffect(() => {
    if (apiOk !== true || sessionId) return;
    let cancelled = false;
    createChatSession()
      .then(({ sessionId: id, messages }) => {
        if (!cancelled) {
          setSessionId(id);
          setChatMessages(messages);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          Alert.alert(
            '채팅 시작 실패',
            e instanceof Error ? e.message : '세션을 만들 수 없습니다.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiOk, sessionId]);

  React.useEffect(() => {
    chatScrollRef.current?.scrollToEnd({ animated: true });
  }, [chatMessages, chatBusy]);

  const resetPreviewPipeline = React.useCallback(() => {
    setPipeline((prev) =>
      prev.map((s) =>
        s.id === 'client_preview_fetch' || s.id === 'client_game_runtime'
          ? { ...s, status: 'pending', detail: undefined, ms: undefined }
          : s,
      ),
    );
  }, [setPipeline]);

  const applyServerPipeline = React.useCallback(
    (records: GamePreview['pipeline'], requestLabel: string) => {
      setPipeline((prev) => {
        const withRequest = upsertStep(prev, {
          id: 'client_request',
          label: `1. API 요청 (${requestLabel})`,
          status: 'ok',
          layer: 'client',
        });
        return mergeServerPipeline(withRequest, records);
      });
    },
    [setPipeline],
  );

  const failPipeline = React.useCallback(
    (
      requestLabel: string,
      message: string,
      serverPipeline?: GamePreview['pipeline'],
    ) => {
      setPipeline((prev) => {
        let steps = upsertStep(prev, {
          id: 'client_request',
          label: `1. API 요청 (${requestLabel})`,
          status: 'error',
          detail: message,
          layer: 'client',
        });
        steps = mergeServerPipeline(steps, serverPipeline);
        return steps;
      });
    },
    [setPipeline],
  );

  const isBusy = busy !== null || chatBusy;
  const previewLoading = busy === 'generate' || busy === 'revise';
  const canSendChat = chatInput.trim().length > 0 && !chatBusy && !!sessionId;
  const canBuild =
    !!sessionId && hasUserMessage(chatMessages) && !isBusy;

  const handleSendChat = React.useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !sessionId || chatBusy) return;

    setChatInput('');
    setChatBusy(true);
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const result = await sendChatMessage(sessionId, text);
      setChatMessages(result.messages);
      setReadyToBuild(result.readyToBuild);
      if (result.readyToBuild) {
        setPlanningSummary(getPlanningSummary(result.messages));
      }
    } catch (e) {
      setChatMessages((prev) => prev.slice(0, -1));
      setChatInput(text);
      Alert.alert('오류', e instanceof Error ? e.message : '메시지 전송 실패');
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, sessionId, chatBusy]);

  const previewHandlers = {
    onLoadStart: () => {
      setPipeline((prev) =>
        upsertStep(prev, {
          id: 'client_preview_fetch',
          label: '3. 미리보기 WebView 로드',
          status: 'running',
          layer: 'client',
        }),
      );
    },
    onLoadEnd: () => {
      setPipeline((prev) =>
        upsertStep(
          upsertStep(prev, {
            id: 'client_preview_fetch',
            label: '3. 미리보기 WebView 로드',
            status: 'ok',
            detail: draft ? `html ${draft.html.length}자` : undefined,
            layer: 'client',
          }),
          {
            id: 'client_game_runtime',
            label: '4. 게임 JS 실행',
            status: 'running',
            layer: 'client',
          },
        ),
      );
    },
    onError: (msg: string) => {
      setPipeline((prev) =>
        upsertStep(prev, {
          id: 'client_preview_fetch',
          label: '3. 미리보기 WebView 로드',
          status: 'error',
          detail: msg,
          layer: 'client',
        }),
      );
    },
    onRuntimeMessage: (data: {
      type?: string;
      message?: string;
      canvas?: string;
    }) => {
      if (data.type === 'game_error') {
        setPipeline((prev) =>
          upsertStep(prev, {
            id: 'client_game_runtime',
            label: '4. 게임 JS 실행',
            status: 'error',
            detail: data.message,
            layer: 'client',
          }),
        );
      } else if (data.type === 'game_ok') {
        setPipeline((prev) =>
          upsertStep(prev, {
            id: 'client_game_runtime',
            label: '4. 게임 JS 실행',
            status: 'ok',
            detail: data.canvas ? `canvas ${data.canvas}` : '실행 완료',
            layer: 'client',
          }),
        );
      }
    },
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      {!draft ? (
        <View style={styles.chatMode}>
          <View style={styles.chatHeader}>
            <Text style={styles.title}>AI 게임 제작</Text>
            <Text style={styles.subtitle}>
              기획 AI와 대화로 게임을 구체화한 뒤, 만들기를 누르면 코딩이 시작됩니다.
            </Text>
            {readyToBuild ? (
              <View style={styles.readyBanner}>
                <Text style={styles.readyBannerText}>
                  ✅ 기획이 정리됐어요. 아래 「게임 만들기」를 눌러 주세요.
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {chatMessages.map((msg, i) => (
              <View
                key={`${msg.role}-${i}`}
                style={[
                  styles.chatBubbleWrap,
                  msg.role === 'user'
                    ? styles.chatBubbleWrapUser
                    : styles.chatBubbleWrapAssistant,
                ]}
              >
                <Text style={styles.chatRoleLabel}>
                  {msg.role === 'user' ? '나' : '기획 AI'}
                </Text>
                <View
                  style={[
                    styles.chatBubble,
                    msg.role === 'user'
                      ? styles.chatBubbleUser
                      : styles.chatBubbleAssistant,
                  ]}
                >
                  <Text
                    style={[
                      styles.chatBubbleText,
                      msg.role === 'user' && styles.chatBubbleTextUser,
                    ]}
                  >
                    {msg.content}
                  </Text>
                </View>
              </View>
            ))}
            {chatBusy ? (
              <View style={styles.chatBubbleWrapAssistant}>
                <Text style={styles.chatRoleLabel}>기획 AI</Text>
                <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                  <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.chatFooter}>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="메시지 입력…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                multiline
                maxLength={MAX_CHAT_LENGTH}
                editable={!chatBusy && !!sessionId}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.chatSendBtn,
                  !canSendChat && styles.btnDisabled,
                  pressed && canSendChat && styles.btnPressed,
                ]}
                disabled={!canSendChat}
                onPress={() => void handleSendChat()}
              >
                <Text style={styles.chatSendBtnText}>전송</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.chatBuildBtn,
                !canBuild && styles.btnDisabled,
                pressed && canBuild && styles.btnPressed,
              ]}
              disabled={!canBuild}
              onPress={async () => {
                if (!sessionId) return;
                setBusy('generate');
                setPlanningSummary(getPlanningSummary(chatMessages));
                setPipeline((prev) =>
                  upsertStep(prev, {
                    id: 'client_request',
                    label: '1. API 요청 (생성)',
                    status: 'running',
                    layer: 'client',
                  }),
                );
                resetPreviewPipeline();
                try {
                  const preview = await generateGamePreview(undefined, sessionId);
                  applyServerPipeline(preview.pipeline, '생성');
                  setDraft(preview);
                  setPreviewKey((k) => k + 1);
                  setShowRevision(false);
                  setRevisionPrompt('');
                } catch (e) {
                  const err = e instanceof ApiPipelineError ? e : null;
                  failPipeline(
                    '생성',
                    e instanceof Error ? e.message : '생성 실패',
                    err?.pipeline,
                  );
                  Alert.alert('오류', e instanceof Error ? e.message : '생성 실패');
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'generate' ? (
                <ActivityIndicator color="#0E0E0E" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {readyToBuild ? '게임 만들기' : '게임 만들기 (기획 중…)'}
                </Text>
              )}
            </Pressable>

            {__DEV__ ? (
              <>
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
                      : ' · 서버 없음'}
                </Text>
                <PipelinePanel
                  title="파이프라인 진단 (제작)"
                  steps={pipelineSteps}
                />
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.previewMode}>
          <View style={styles.previewToolbar}>
            <Text style={styles.previewGameName} numberOfLines={1}>
              {draft.name}
            </Text>
            <Text style={styles.previewScrollHint}>
              아래로 스크롤하면 파이프라인 진단을 볼 수 있습니다
            </Text>

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
                  styles.toolbarPrimary,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
                disabled={isBusy}
                onPress={async () => {
                  setBusy('publish');
                  setPipeline((prev) =>
                    upsertStep(prev, {
                      id: 'client_request',
                      label: '1. API 요청 (완성)',
                      status: 'running',
                      layer: 'client',
                    }),
                  );
                  try {
                    if (!authSession?.access_token) {
                      throw new ApiPipelineError('로그인이 필요합니다.');
                    }
                    const result = await publishGame({
                      html: draft.html,
                      name: draft.name,
                      accessToken: authSession.access_token,
                    });
                    setPipeline((prev) =>
                      mergeServerPipeline(
                        upsertStep(prev, {
                          id: 'client_request',
                          label: '1. API 요청 (완성)',
                          status: 'ok',
                          layer: 'client',
                        }),
                        result.pipeline,
                      ),
                    );
                    setDraft(null);
                    setSessionId(null);
                    setChatMessages([]);
                    setChatInput('');
                    setReadyToBuild(false);
                    setPlanningSummary('');
                    setRevisionPrompt('');
                    setShowRevision(false);
                    onGameCreated?.();
                    Alert.alert(
                      '완료',
                      `저장됨 (id ${result.id}). Games 탭에서 확인하세요.`,
                    );
                  } catch (e) {
                    const err = e instanceof ApiPipelineError ? e : null;
                    failPipeline(
                      '완성',
                      e instanceof Error ? e.message : '저장 실패',
                      err?.pipeline,
                    );
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
                <TextInput
                  style={styles.revisionInput}
                  value={revisionPrompt}
                  onChangeText={setRevisionPrompt}
                  placeholder="수정할 내용 (예: 점프 높이 2배)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  multiline
                  editable={!isBusy}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.revisionApplyBtn,
                    (!revisionPrompt.trim() || isBusy) && styles.btnDisabled,
                    pressed &&
                      revisionPrompt.trim() &&
                      !isBusy &&
                      styles.btnPressed,
                  ]}
                  disabled={!revisionPrompt.trim() || isBusy}
                  onPress={async () => {
                    setBusy('revise');
                    setPipeline((prev) =>
                      upsertStep(prev, {
                        id: 'client_request',
                        label: '1. API 요청 (수정)',
                        status: 'running',
                        layer: 'client',
                      }),
                    );
                    resetPreviewPipeline();
                    try {
                      const preview = await reviseGamePreview({
                        js: getReviseSource(draft),
                        revisionPrompt,
                        originalPrompt: planningSummary || draft.metadata?.tagline,
                      });
                      applyServerPipeline(preview.pipeline, '수정');
                      setDraft(preview);
                      setPreviewKey((k) => k + 1);
                      setRevisionPrompt('');
                      setShowRevision(false);
                    } catch (e) {
                      const err = e instanceof ApiPipelineError ? e : null;
                      failPipeline(
                        '수정',
                        e instanceof Error ? e.message : '수정 실패',
                        err?.pipeline,
                      );
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
                    <ActivityIndicator color="#0E0E0E" size="small" />
                  ) : (
                    <Text style={styles.revisionApplyText}>수정 적용</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>

          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <View
              style={[
                styles.previewViewport,
                { height: PREVIEW_VIEWPORT_HEIGHT },
              ]}
            >
              {previewLoading ? (
                <View style={styles.previewLoading}>
                  <ActivityIndicator color="#FFFFFF" size="large" />
                  <Text style={styles.previewLoadingText}>
                    {busy === 'revise' ? '수정 반영 중…' : '게임 생성 중…'}
                  </Text>
                </View>
              ) : (
                <GamePreviewWebView
                  html={draft.html}
                  height={PREVIEW_VIEWPORT_HEIGHT}
                  webKey={previewKey}
                  {...previewHandlers}
                />
              )}
            </View>

            <View style={styles.pipelineSection}>
              <PipelinePanel
                title="파이프라인 진단 (제작)"
                steps={pipelineSteps}
                defaultExpanded
              />
            </View>
          </ScrollView>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E0E' },
  chatMode: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  chatHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  chatFooter: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 16,
    backgroundColor: '#0E0E0E',
    gap: 10,
  },
  chatBuildBtn: {
    marginTop: 0,
  },
  scroll: { flex: 1 },
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
    marginBottom: 4,
  },
  readyBanner: {
    backgroundColor: 'rgba(120,220,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(120,220,160,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  readyBannerText: {
    fontSize: 13,
    color: 'rgba(160,240,190,0.95)',
    lineHeight: 18,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  chatScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  chatBubbleWrap: {
    marginBottom: 8,
    maxWidth: '88%',
  },
  chatBubbleWrapUser: {
    alignSelf: 'flex-end',
  },
  chatBubbleWrapAssistant: {
    alignSelf: 'flex-start',
  },
  chatRoleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
    marginHorizontal: 4,
  },
  chatBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chatBubbleUser: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  chatBubbleAssistant: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chatBubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  chatBubbleTextUser: {
    color: '#0E0E0E',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 0,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chatSendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  chatSendBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0E0E0E',
  },
  apiHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  apiHintOk: { color: 'rgba(120,220,160,0.9)' },
  apiHintError: { color: 'rgba(255,120,120,0.95)' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
  },
  input: {
    minHeight: 120,
    maxHeight: 200,
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
  toolbarPrimary: {
    flex: 1,
    marginTop: 0,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#0E0E0E' },
  btnDisabled: { backgroundColor: 'rgba(255,255,255,0.22)' },
  btnPressed: { opacity: 0.9 },

  previewMode: {
    flex: 1,
  },
  previewToolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  previewGameName: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 4,
  },
  previewScrollHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 10,
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    paddingBottom: 32,
  },
  previewViewport: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#141414',
  },
  previewLoading: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#141414',
  },
  previewLoadingText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
  },
  pipelineSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  revisionBlock: { marginTop: 10, gap: 8 },
  revisionInput: {
    minHeight: 56,
    maxHeight: 88,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  revisionApplyBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  revisionApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0E0E0E',
  },
});
