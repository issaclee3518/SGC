import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const GAMES_BUCKET = 'games';
const MIN_ICON_BYTES = 200;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mimeFromUri(uri: string): string | undefined {
  const match = uri.match(/\.([a-z0-9]+)(?:\?|$)/i);
  if (!match) return undefined;
  return EXT_TO_MIME[match[1].toLowerCase()];
}

function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime.toLowerCase()] ?? 'jpg';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** RN에서 file:// URI → 바이트 (fetch+blob은 0바이트가 되는 경우가 많음) */
async function readImageBytes(localUri: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const guessedMime = mimeFromUri(localUri) ?? 'image/jpeg';

  try {
    const file = new File(localUri);
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength >= MIN_ICON_BYTES) {
      return { bytes: new Uint8Array(buffer), contentType: guessedMime };
    }
  } catch {
    /* legacy fallback */
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });
  const bytes = base64ToUint8Array(base64);
  if (bytes.byteLength < MIN_ICON_BYTES) {
    throw new Error('이미지 데이터가 비어 있습니다. 다시 선택해 주세요.');
  }
  return { bytes, contentType: guessedMime };
}

/** Client upload on attach — not sent through the game build pipeline. */
export async function uploadPendingGameIcon(
  userId: string,
  localUri: string,
): Promise<string> {
  const { bytes, contentType } = await readImageBytes(localUri);
  const ext = extFromMime(contentType);
  const path = `icons/pending/${userId}/${randomId()}.${ext}`;
  const { error } = await supabase.storage
    .from(GAMES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
