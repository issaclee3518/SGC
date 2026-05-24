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
  pipeline?: PipelineTraceRecord[];
};

export type PublishGameResult = {
  id: number;
  name: string;
  storage_path: string;
  playUrl: string;
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
        `서버에 연결할 수 없습니다 (${apiBase}). SGS에서 npm run dev 실행 여부와 포트(5001)를 확인하세요.`,
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

export async function sendChatMessage(
  sessionId: string,
  message: string,
): Promise<{
  reply: string;
  readyToBuild: boolean;
  messages: ChatMessage[];
}> {
  return postJson('/api/chat/sessions/' + sessionId + '/messages', { message });
}

/** 수정 프롬프트 → 새 미리보기 */
export async function reviseGamePreview(params: {
  js: string;
  revisionPrompt: string;
  originalPrompt?: string;
}): Promise<GamePreview> {
  return postJson<GamePreview>('/api/games/revise', params);
}

/** 완성 → Supabase 저장 (로그인 access token 필요) */
export async function publishGame(params: {
  html: string;
  name: string;
  accessToken: string;
}): Promise<PublishGameResult> {
  const { accessToken, ...body } = params;
  return postJson<PublishGameResult>(
    '/api/games/publish',
    body,
    accessToken,
  );
}

export { getApiBase };
