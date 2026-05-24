import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signInWithGoogle } from '../lib/authService';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { setSession } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const onGooglePress = async () => {
    setBusy(true);
    try {
      const session = await signInWithGoogle();
      setSession(session);
    } catch (e) {
      Alert.alert(
        '로그인 실패',
        e instanceof Error ? e.message : 'Google 로그인에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Scroll Game</Text>
      <Text style={styles.subtitle}>
        게임을 만들고 피드에서 즐기려면{'\n'}Google 계정으로 로그인해 주세요.
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.googleBtn,
          pressed && !busy && styles.pressed,
          busy && styles.disabled,
        ]}
        disabled={busy}
        onPress={() => void onGooglePress()}
      >
        {busy ? (
          <ActivityIndicator color="#757575" />
        ) : (
          <>
            <Image
              source={{
                uri: 'https://developers.google.com/identity/images/g-logo.png',
              }}
              style={styles.googleIcon}
            />
            <Text style={styles.googleBtnText}>Google로 계속하기</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.hint}>
        Supabase 대시보드에서 Google Provider와 Redirect URL{'\n'}
        (scrollgame://google-auth) 설정이 필요합니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginBottom: 36,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 260,
    gap: 10,
  },
  googleIcon: { width: 22, height: 22 },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.7 },
  hint: {
    marginTop: 28,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.38)',
    textAlign: 'center',
  },
});
