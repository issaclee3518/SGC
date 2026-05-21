/**
우리 앱(React Native)과 Supabase 서버를 연결해 주는 '전화기'를 딱 대기시켜 두는 파일입니다.
이 파일에서 단 한 번만 Supabase와의 연결 통로를 선언해 두고, 다른 파일들에서는 이 통로(supabase)를 가져다 쓰기만 하면 됩니다.
 */
export { supabase } from './supabase';