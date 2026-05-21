import { getApiBase } from './apiBase';

export type GamePreview = {
  html: string;
  js: string;
  name: string;
};

export type PublishGameResult = {
  id: number;
  name: string;
  storage_path: string;
  playUrl: string;
};

type ApiErrorBody = { error?: string };

async function parseJsonResponse<T>(
  res: Response,
  apiBase: string,
): Promise<T & ApiErrorBody> {
  const text = await res.text();

  if (!text.trim()) {
    if (res.status === 0) {
      throw new Error(
        `서버에 연결할 수 없습니다 (${apiBase}). SGS에서 npm run dev 실행 여부와 포트(5001)를 확인하세요.`,
      );
    }
    throw new Error(
      `서버 응답이 비어 있습니다 (HTTP ${res.status}, ${apiBase}).`,
    );
  }

  try {
    return JSON.parse(text) as T & ApiErrorBody;
  } catch {
    throw new Error(`서버 응답 형식 오류: ${text.slice(0, 200)}`);
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const apiBase = getApiBase();
  const url = `${apiBase}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`서버 요청 실패 (${url})`);
  }

  const json = await parseJsonResponse<T>(res, apiBase);
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed: HTTP ${res.status}`);
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

/** 생성 → HTML 미리보기 (저장 없음) */
export async function generateGamePreview(
  prompt: string,
): Promise<GamePreview> {
  return postJson<GamePreview>('/api/games/generate', { prompt });
}

/** 수정 프롬프트 → 새 미리보기 */
export async function reviseGamePreview(params: {
  js: string;
  revisionPrompt: string;
  originalPrompt?: string;
}): Promise<GamePreview> {
  return postJson<GamePreview>('/api/games/revise', params);
}

/** 완성 → Supabase 저장 */
export async function publishGame(params: {
  html: string;
  name: string;
}): Promise<PublishGameResult> {
  return postJson<PublishGameResult>('/api/games/publish', params);
}

export { getApiBase };
