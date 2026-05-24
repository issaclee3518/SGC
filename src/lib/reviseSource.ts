import type { GamePreview } from './aiService';

const REQUIRED_PATHS = [
  'game/main.ts',
  'game/state.ts',
  'game/init.ts',
  'game/update.ts',
  'game/draw.ts',
] as const;

/**
 * 수정 API에 보낼 멀티파일 게임 소스 (JSON `{ version, files }`).
 */
export function getReviseSource(draft: GamePreview): string {
  const js = draft.js?.trim() ?? '';
  if (!js) {
    throw new Error(
      '수정할 게임 소스가 없습니다. 게임을 다시 생성해 주세요.',
    );
  }
  if (js.length > 200_000) {
    throw new Error('게임 소스가 너무 큽니다. 다시 생성해 주세요.');
  }

  if (js.includes('Phaser')) {
    throw new Error(
      '예전 Phaser 게임입니다. 새로 생성한 뒤 수정해 주세요.',
    );
  }

  if (!js.startsWith('{') || !js.includes('"files"')) {
    throw new Error(
      '멀티파일 게임 형식이 아닙니다. 게임을 다시 생성해 주세요.',
    );
  }

  let files: Record<string, string>;
  try {
    const parsed = JSON.parse(js) as { files?: Record<string, string> };
    if (!parsed.files || typeof parsed.files !== 'object') {
      throw new Error('invalid files');
    }
    files = parsed.files;
  } catch {
    throw new Error(
      '게임 소스 JSON을 읽을 수 없습니다. 다시 생성해 주세요.',
    );
  }

  for (const path of REQUIRED_PATHS) {
    if (!files[path]?.trim()) {
      throw new Error(
        `게임 소스에 ${path}가 없습니다. 다시 생성해 주세요.`,
      );
    }
  }

  if (!files['game/main.ts'].includes('createGame')) {
    throw new Error(
      'game/main.ts에 createGame()이 없습니다. 다시 생성해 주세요.',
    );
  }

  return js;
}
