import { getApiBase } from './apiBase';
import type { PipelineTraceRecord } from './pipeline';

export type GameMetadata = {
  title: string;
  tagline: string;
  controls: string;
  hashtags: string[];
};

export type GamePreview = {
  html: string;
  js: string;
  name: string;
  metadata?: GameMetadata;
  assetBuildId?: string;
  pipeline?: PipelineTraceRecord[];
};

export type PublishGameResult = {
  id: number;
  name: string;
  storage_path: string;
  icon_storage_path?: string;
  playUrl: string;
  iconUrl?: string;
  pipeline?: PipelineTraceRecord[];
};

export class ApiPipelineError extends Error {
  pipeline: PipelineTraceRecord[];

  constructor(message: string, pipeline: PipelineTraceRecord[] = []) {
    super(message);
    this.name = 'ApiPipelineError';
    this.pipeline = pipeline;
  }
}

type ApiErrorBody = { error?: string; pipeline?: PipelineTraceRecord[] };

async function parseJsonResponse<T>(
  res: Response,
  apiBase: string,
): Promise<T & ApiErrorBody> {
  const text = await res.text();

  if (!text.trim()) {
    if (res.status === 0) {
      throw new ApiPipelineError(
        `서버에 연결할 수 없습니다 (${apiBase}). EXPO_PUBLIC_API_URL과 Render/SGS 서버 상태를 확인하세요.`,
      );
    }
    throw new ApiPipelineError(
      `서버 응답이 비어 있습니다 (HTTP ${res.status}, ${apiBase}).`,
    );
  }

  try {
    return JSON.parse(text) as T & ApiErrorBody;
  } catch {
    throw new ApiPipelineError(`서버 응답 형식 오류: ${text.slice(0, 200)}`);
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<T & { pipeline?: PipelineTraceRecord[] }> {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiPipelineError(`서버 요청 실패 (${url})`);
  }

  const json = await parseJsonResponse<T>(res, apiBase);
  if (!res.ok) {
    throw new ApiPipelineError(
      json.error ?? `Request failed: HTTP ${res.status}`,
      json.pipeline ?? [],
    );
  }
  return json;
}

export async function checkApiHealth(): Promise<boolean> {
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/games/health`);
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('"ok"');
  } catch {
    return false;
  }
}

/** 생성 → HTML 미리보기. sessionId(채팅 기획) 또는 prompt */
export async function generateGamePreview(
  prompt?: string,
  sessionId?: string,
): Promise<GamePreview> {
  const body: Record<string, string> = {};
  if (prompt?.trim()) body.prompt = prompt.trim();
  if (sessionId) body.sessionId = sessionId;
  if (!body.prompt && !body.sessionId) {
    throw new ApiPipelineError('채팅 세션 또는 프롬프트가 필요합니다.');
  }
  return postJson<GamePreview>('/api/games/generate', body);
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function createChatSession(): Promise<{
  sessionId: string;
  messages: ChatMessage[];
}> {
  const apiBase = getApiBase();
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/chat/sessions`, { method: 'POST' });
  } catch {
    throw new ApiPipelineError(`서버 요청 실패 (${apiBase}/api/chat/sessions)`);
  }
  if (!res.ok) {
    const json = await parseJsonResponse<{ error?: string }>(res, apiBase);
    throw new ApiPipelineError(json.error ?? '채팅 세션 생성 실패');
  }
  return res.json() as Promise<{ sessionId: string; messages: ChatMessage[] }>;
}

export function isChatSessionNotFoundError(e: unknown): boolean {
  return (
    e instanceof ApiPipelineError &&
    /session not found/i.test(e.message)
  );
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  options?: { hasGameThumbnail?: boolean },
): Promise<{
  reply: string;
  readyToBuild: boolean;
  messages: ChatMessage[];
}> {
  return postJson('/api/chat/sessions/' + sessionId + '/messages', {
    message,
    hasGameThumbnail: options?.hasGameThumbnail === true,
  });
}

/** 서버에 세션이 없으면(재시작·URL 변경) 새 세션 생성 후 메시지 재전송 */
export async function sendChatMessageResilient(
  sessionId: string,
  message: string,
  options?: { hasGameThumbnail?: boolean },
): Promise<{
  reply: string;
  readyToBuild: boolean;
  messages: ChatMessage[];
  sessionId: string;
  sessionRecreated: boolean;
}> {
  try {
    const result = await sendChatMessage(sessionId, message, options);
    return { ...result, sessionId, sessionRecreated: false };
  } catch (e) {
    if (!isChatSessionNotFoundError(e)) throw e;
    const fresh = await createChatSession();
    const result = await sendChatMessage(fresh.sessionId, message, options);
    return {
      ...result,
      sessionId: fresh.sessionId,
      sessionRecreated: true,
    };
  }
}

/** 서버에서 채팅 세션·대화 기록 삭제 */
export async function deleteChatSession(sessionId: string): Promise<void> {
  const apiBase = getApiBase();
  const url = `${apiBase}/api/chat/sessions/${encodeURIComponent(sessionId)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'DELETE' });
  } catch {
    throw new ApiPipelineError(`서버 요청 실패 (${url})`);
  }
  if (!res.ok && res.status !== 204) {
    const json = await parseJsonResponse<{ error?: string }>(res, apiBase);
    throw new ApiPipelineError(json.error ?? '채팅 세션 삭제 실패');
  }
}

/** 수정 프롬프트 → 새 미리보기 */
export async function reviseGamePreview(params: {
  js: string;
  revisionPrompt: string;
  originalPrompt?: string;
  sessionId?: string;
  chatHistory?: ChatMessage[];
}): Promise<GamePreview> {
  return postJson<GamePreview>('/api/games/revise', params);
}

/** 완성 → Supabase 저장 (로그인 access token 필요) */
export async function publishGame(params: {
  html: string;
  name: string;
  accessToken: string;
  iconStoragePath?: string;
  assetBuildId?: string;
}): Promise<PublishGameResult> {
  const { accessToken, ...body } = params;
  return postJson<PublishGameResult>(
    '/api/games/publish',
    body,
    accessToken,
  );
}

export { getApiBase };
