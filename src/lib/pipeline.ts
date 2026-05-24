export type PipelineStepStatus = 'pending' | 'running' | 'ok' | 'error' | 'skip';

export type PipelineStep = {
  id: string;
  label: string;
  status: PipelineStepStatus;
  detail?: string;
  ms?: number;
  layer: 'client' | 'server';
};

export type PipelineTraceRecord = {
  step: string;
  label: string;
  ok: boolean;
  ms: number;
  detail?: string;
};

export function serverTraceToSteps(
  records: PipelineTraceRecord[] | undefined,
): PipelineStep[] {
  if (!records?.length) return [];
  return records.map((r) => ({
    id: `server_${r.step}`,
    label: r.label,
    status: r.ok ? 'ok' : 'error',
    detail: r.detail,
    ms: r.ms,
    layer: 'server',
  }));
}

export function upsertStep(
  steps: PipelineStep[],
  patch: PipelineStep,
): PipelineStep[] {
  const i = steps.findIndex((s) => s.id === patch.id);
  if (i === -1) return [...steps, patch];
  const next = [...steps];
  next[i] = { ...next[i], ...patch };
  return next;
}

export function mergeServerPipeline(
  clientSteps: PipelineStep[],
  serverRecords: PipelineTraceRecord[] | undefined,
): PipelineStep[] {
  const withoutServer = clientSteps.filter((s) => s.layer !== 'server');
  return [...withoutServer, ...serverTraceToSteps(serverRecords)];
}

/** SGS generate/revise 파이프라인 (클라이언트 표시용) */
export const CREATE_PIPELINE_TEMPLATE: PipelineStep[] = [
  {
    id: 'client_health',
    label: '0. SGS 서버 연결',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'client_request',
    label: '1. API 요청 (생성/수정/완성)',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'client_preview_fetch',
    label: '3. 미리보기 WebView 로드',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'client_game_runtime',
    label: '4. 게임 JS 실행',
    status: 'pending',
    layer: 'client',
  },
];

export const FEED_PIPELINE_TEMPLATE: PipelineStep[] = [
  {
    id: 'feed_list',
    label: '1. Supabase 게임 목록',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'feed_fetch_html',
    label: '2. Storage HTML fetch',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'feed_validate_html',
    label: '3. HTML 형식 검증',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'feed_webview',
    label: '4. WebView 렌더',
    status: 'pending',
    layer: 'client',
  },
  {
    id: 'feed_game_runtime',
    label: '5. 게임 JS 실행',
    status: 'pending',
    layer: 'client',
  },
];
