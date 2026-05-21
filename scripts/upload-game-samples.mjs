/**
 * Supabase Storage(games 버킷)에 샘플 HTML 업로드
 * 실행: node scripts/upload-game-samples.mjs
 * 필요: SG/.env.local (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    console.warn('No .env.local found');
  }
}

loadEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const samplesDir = join(root, 'supabase', 'game-samples');

for (const file of ['1.html', '2.html', '3.html']) {
  const body = readFileSync(join(samplesDir, file));
  const { error } = await supabase.storage.from('games').upload(file, body, {
    contentType: 'text/html',
    upsert: true,
  });
  if (error) {
    console.error(`Failed ${file}:`, error.message);
    process.exit(1);
  }
  console.log(`Uploaded ${file}`);
}

console.log('Done.');
