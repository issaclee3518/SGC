import React from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChatPromptComposer } from '../component/ChatPromptComposer';
import { GameBuildLoader } from '../component/GameBuildLoader';
import { GamePreviewWebView } from '../component/GamePreviewWebView';
import { PipelinePanel } from '../component/PipelinePanel';
import {
  ApiPipelineError,
  checkApiHealth,
  createChatSession,
  deleteChatSession,
  generateGamePreview,
  getApiBase,
  publishGame,
  reviseGamePreview,
  isChatSessionNotFoundError,
  sendChatMessageResilient,
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
import { uploadPendingGameIcon } from '../lib/gameIconService';
import { useAuth } from '../context/AuthContext';

const MAX_CHAT_LENGTH = 500;
const WINDOW_HEIGHT = Dimensions.get('window').height;
/** 스크롤 위 미리보기 WebView 높이 (아래로 내리면 진단 패널) */
const PREVIEW_VIEWPORT_HEIGHT = Math.round(
  Math.min(580, Math.max(320, WINDOW_HEIGHT * 0.7)),
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

function isPlanningComplete(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === 'assistant' &&
      (m.content.includes('✅ 기획 요약:') || m.content.includes('기획 요약:')),
  );
}

/** 수정 응답에 assetBuildId가 없으면 기존 미리보기 에셋 경로 유지 */
function mergePreviewDraft(
  prev: GamePreview | null,
  next: GamePreview,
): GamePreview {
  return {
    ...next,
    assetBuildId: next.assetBuildId ?? prev?.assetBuildId,
  };
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
  const [pendingIconStoragePath, setPendingIconStoragePath] = React.useState<
    string | null
  >(null);
  const [pendingIconPreviewUri, setPendingIconPreviewUri] = React.useState<
    string | null
  >(null);
  const [iconAttachBusy, setIconAttachBusy] = React.useState(false);
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
  const [buildLoaderVisible, setBuildLoaderVisible] = React.useState(false);
  const buildLoaderOpacity = React.useRef(new Animated.Value(0)).current;
  const apiBase = getApiBase();

  const showBuildLoader = React.useCallback(() => {
    setBuildLoaderVisible(true);
    buildLoaderOpacity.setValue(0);
    Animated.timing(buildLoaderOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [buildLoaderOpacity]);

  const hideBuildLoader = React.useCallback(() => {
    return new Promise<void>((resolve) => {
      Animated.timing(buildLoaderOpacity, {
        toValue: 0,
        duration: 550,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setBuildLoaderVisible(false);
        resolve();
      });
    });
  }, [buildLoaderOpacity]);

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

  /** Render 재시작·로컬↔배포 URL 변경 시 서버 메모리 세션과 불일치 → 새 세션 필요 */
  React.useEffect(() => {
    setSessionId(null);
    setChatMessages([]);
    setReadyToBuild(false);
    setPlanningSummary('');
    setChatBusy(false);
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

  const runGenerateGame = React.useCallback(async () => {
    if (!sessionId) return;
    setBusy('generate');
    showBuildLoader();
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
      const localPlan =
        planningSummary || getPlanningSummary(chatMessages);
      let preview: GamePreview;
      try {
        preview = await generateGamePreview(undefined, sessionId);
      } catch (e) {
        if (isChatSessionNotFoundError(e) && localPlan.trim()) {
          preview = await generateGamePreview(localPlan, undefined);
        } else {
          throw e;
        }
      }
      applyServerPipeline(preview.pipeline, '생성');
      setDraft(preview);
      setPreviewKey((k) => k + 1);
      setShowRevision(false);
      setRevisionPrompt('');
      await hideBuildLoader();
    } catch (e) {
      await hideBuildLoader();
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
  }, [
    sessionId,
    chatMessages,
    showBuildLoader,
    hideBuildLoader,
    setPipeline,
    resetPreviewPipeline,
    applyServerPipeline,
    failPipeline,
  ]);

  const isBusy = busy !== null || chatBusy;
  const iconUploadPending =
    !!pendingIconPreviewUri &&
    (iconAttachBusy || !pendingIconStoragePath);
  const previewLoading = busy === 'revise';
  const canSendChat = chatInput.trim().length > 0 && !chatBusy && !!sessionId;
  const planningComplete =
    readyToBuild || isPlanningComplete(chatMessages);
  const canBuild = !!sessionId && planningComplete && !isBusy;

  const resetChatForNewGame = React.useCallback(async () => {
    const oldSessionId = sessionId;
    if (oldSessionId) {
      try {
        await deleteChatSession(oldSessionId);
      } catch (e) {
        Alert.alert(
          '오류',
          e instanceof Error ? e.message : '대화 삭제에 실패했습니다.',
        );
        return;
      }
    }
    setDraft(null);
    setShowRevision(false);
    setRevisionPrompt('');
    setPreviewKey((k) => k + 1);
    setChatInput('');
    setChatBusy(false);
    setReadyToBuild(false);
    setPlanningSummary('');
    setSessionId(null);
    setChatMessages([]);
    setPendingIconStoragePath(null);
    setPendingIconPreviewUri(null);
    setIconAttachBusy(false);
    setPipelineSteps(initCreatePipeline(apiOk));
  }, [apiOk, sessionId]);

  const handlePickGameIcon = React.useCallback(async () => {
    const userId = authSession?.user?.id;
    if (!userId || iconAttachBusy || isBusy) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '갤러리에서 썸네일을 선택하려면 사진 접근 권한이 필요합니다.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;

    const uri = picked.assets[0].uri;
    setPendingIconPreviewUri(uri);
    setIconAttachBusy(true);
    try {
      const path = await uploadPendingGameIcon(userId, uri);
      setPendingIconStoragePath(path);
    } catch (e) {
      setPendingIconPreviewUri(null);
      setPendingIconStoragePath(null);
      Alert.alert(
        '업로드 실패',
        e instanceof Error ? e.message : '썸네일 업로드에 실패했습니다.',
      );
    } finally {
      setIconAttachBusy(false);
    }
  }, [authSession?.user?.id, iconAttachBusy, isBusy]);

  const handleResetChat = React.useCallback(() => {
    if (isBusy) return;
    Alert.alert(
      '대화 초기화',
      '지금까지의 대화를 삭제하고 새로 시작할까요? 이전 기록은 저장되지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => void resetChatForNewGame(),
        },
      ],
    );
  }, [isBusy, resetChatForNewGame]);

  const handleDeleteDraft = React.useCallback(() => {
    if (!draft || isBusy) return;
    Alert.alert(
      '게임 삭제',
      '이 미리보기를 삭제하고 새 기획 채팅을 시작할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => void resetChatForNewGame(),
        },
      ],
    );
  }, [draft, isBusy, resetChatForNewGame]);

  const handlePublish = React.useCallback(async () => {
    if (!draft) return;
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
        iconStoragePath: pendingIconStoragePath ?? undefined,
        assetBuildId: draft.assetBuildId,
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
      setPendingIconStoragePath(null);
      setPendingIconPreviewUri(null);
      onGameCreated?.();
      Alert.alert('완료', `저장됨 (id ${result.id}). Games 탭에서 확인하세요.`);
    } catch (e) {
      const err = e instanceof ApiPipelineError ? e : null;
      failPipeline(
        '완성',
        e instanceof Error ? e.message : '저장 실패',
        err?.pipeline,
      );
      Alert.alert('오류', e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(null);
    }
  }, [
    authSession?.access_token,
    draft,
    failPipeline,
    onGameCreated,
    pendingIconStoragePath,
    setPipeline,
  ]);

  const handleSendChat = React.useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !sessionId || chatBusy) return;

    setChatInput('');
    setChatBusy(true);
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const result = await sendChatMessageResilient(sessionId, text, {
        hasGameThumbnail: !!pendingIconStoragePath,
      });
      if (result.sessionId !== sessionId) {
        setSessionId(result.sessionId);
      }
      setChatMessages(result.messages);
      setReadyToBuild(result.readyToBuild);
      if (result.readyToBuild) {
        setPlanningSummary(getPlanningSummary(result.messages));
      }
      if (result.sessionRecreated) {
        Alert.alert(
          '새 대화로 이어갑니다',
          '서버가 재시작되었거나 이전 대화가 만료되어 새 세션을 열었습니다. 방금 보낸 메시지부터 다시 기획해요.',
        );
      }
    } catch (e) {
      setChatMessages((prev) => prev.slice(0, -1));
      setChatInput(text);
      Alert.alert('오류', e instanceof Error ? e.message : '메시지 전송 실패');
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, sessionId, chatBusy, pendingIconStoragePath]);

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
            {planningComplete ? (
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
            {pendingIconPreviewUri ? (
              <View style={styles.chatIconPreviewRow}>
                <Image
                  source={{ uri: pendingIconPreviewUri }}
                  style={styles.chatIconPreview}
                />
                <Text style={styles.chatIconPreviewLabel} numberOfLines={1}>
                  {iconAttachBusy
                    ? '썸네일 업로드 중…'
                    : '완성 시 게임 썸네일로 저장됩니다'}
                </Text>
                <Pressable
                  style={styles.chatIconRemove}
                  disabled={isBusy || iconAttachBusy}
                  onPress={() => {
                    setPendingIconPreviewUri(null);
                    setPendingIconStoragePath(null);
                  }}
                  accessibilityLabel="썸네일 제거"
                >
                  <Text style={styles.chatIconRemoveText}>×</Text>
                </Pressable>
              </View>
            ) : null}
            <ChatPromptComposer
              value={chatInput}
              onChangeText={setChatInput}
              onSend={() => void handleSendChat()}
              onAttachImage={() => void handlePickGameIcon()}
              attachDisabled={!authSession?.user?.id || isBusy}
              attaching={iconAttachBusy}
              placeholder="기획 AI에게 메시지 보내기…"
              maxLength={MAX_CHAT_LENGTH}
              editable={!!sessionId}
              canSend={canSendChat}
              sending={chatBusy}
            />

            <View style={styles.chatActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.chatResetBtn,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
                disabled={isBusy || !sessionId}
                onPress={handleResetChat}
              >
                <Text style={styles.chatResetBtnText}>대화 초기화</Text>
              </Pressable>

              {planningComplete ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.chatBuildBtn,
                    !canBuild && styles.btnDisabled,
                    pressed && canBuild && styles.btnPressed,
                  ]}
                  disabled={!canBuild}
                  onPress={() => void runGenerateGame()}
                >
                  <Text style={styles.primaryBtnText}>게임 만들기</Text>
                </Pressable>
              ) : null}
            </View>

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
          <ScrollView
            style={styles.previewOuterScroll}
            contentContainerStyle={styles.previewOuterScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
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

            <Text style={styles.previewGameName} numberOfLines={1}>
              {draft.name}
            </Text>

            <View style={styles.previewActions}>
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
                    styles.previewPrimaryBtn,
                    (isBusy || iconUploadPending) && styles.btnDisabled,
                    pressed && !isBusy && !iconUploadPending && styles.btnPressed,
                  ]}
                  disabled={isBusy || iconUploadPending}
                  onPress={() => void handlePublish()}
                >
                  {busy === 'publish' ? (
                    <ActivityIndicator color="#0E0E0E" />
                  ) : (
                    <Text style={styles.primaryBtnText}>완성</Text>
                  )}
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.deleteBtn,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
                disabled={isBusy}
                onPress={handleDeleteDraft}
              >
                <Text style={styles.deleteBtnText}>삭제</Text>
              </Pressable>

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
                          originalPrompt:
                            planningSummary || draft.metadata?.tagline,
                          sessionId: sessionId ?? undefined,
                          chatHistory: chatMessages,
                        });
                        applyServerPipeline(preview.pipeline, '수정');
                        setDraft((prev) => mergePreviewDraft(prev, preview));
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

            <Text style={styles.previewScrollHint}>
              아래로 스크롤하면 버튼·파이프라인 진단을 볼 수 있습니다
            </Text>
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

      {buildLoaderVisible ? (
        <Animated.View
          style={[styles.buildLoaderOverlay, { opacity: buildLoaderOpacity }]}
          pointerEvents="auto"
        >
          <GameBuildLoader />
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E0E' },
  buildLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  chatIconPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  chatIconPreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chatIconPreviewLabel: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  chatIconRemove: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIconRemoveText: {
    fontSize: 22,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.5)',
  },
  chatActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatResetBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatResetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  chatBuildBtn: {
    flex: 1,
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
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#0E0E0E' },
  btnDisabled: { backgroundColor: 'rgba(255,255,255,0.22)' },
  btnPressed: { opacity: 0.9 },

  previewMode: {
    flex: 1,
  },
  previewGameName: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  previewActions: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  previewPrimaryBtn: {
    flex: 1,
    marginTop: 0,
  },
  previewScrollHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  deleteBtn: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,100,100,0.9)',
  },
  previewViewport: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#141414',
  },
  previewOuterScroll: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  previewOuterScrollContent: {
    paddingBottom: 32,
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
  revisionBlock: { marginTop: 4, gap: 8 },
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
