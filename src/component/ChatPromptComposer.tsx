import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type ChatPromptComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachImage?: () => void;
  attachDisabled?: boolean;
  attaching?: boolean;
  placeholder?: string;
  maxLength?: number;
  editable?: boolean;
  canSend?: boolean;
  sending?: boolean;
};

/**
 * 채팅 프롬프트 입력 (ModeSelector 제외 — 입력 + 전송만).
 * 웹 컴포저 스타일: 둥근 테두리 박스 + 우측 전송 버튼.
 */
export function ChatPromptComposer({
  value,
  onChangeText,
  onSend,
  onAttachImage,
  attachDisabled = false,
  attaching = false,
  placeholder = '메시지 입력…',
  maxLength,
  editable = true,
  canSend = false,
  sending = false,
}: ChatPromptComposerProps) {
  const sendEnabled = canSend && !sending;
  const attachEnabled =
    !!onAttachImage && !attachDisabled && !sending && !attaching;

  return (
    <View style={styles.shell}>
      {onAttachImage ? (
        <Pressable
          style={({ pressed }) => [
            styles.attachBtn,
            !attachEnabled && styles.attachBtnDisabled,
            pressed && attachEnabled && styles.attachBtnPressed,
          ]}
          disabled={!attachEnabled}
          onPress={onAttachImage}
          accessibilityRole="button"
          accessibilityLabel="이미지 첨부"
        >
          {attaching ? (
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
          ) : (
            <Ionicons
              name="image-outline"
              size={22}
              color={
                attachEnabled
                  ? 'rgba(255,255,255,0.85)'
                  : 'rgba(255,255,255,0.28)'
              }
            />
          )}
        </Pressable>
      ) : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.38)"
        multiline
        maxLength={maxLength}
        editable={editable && !sending}
        textAlignVertical="center"
        returnKeyType="default"
        blurOnSubmit={false}
      />
      <Pressable
        style={({ pressed }) => [
          styles.sendBtn,
          !sendEnabled && styles.sendBtnDisabled,
          pressed && sendEnabled && styles.sendBtnPressed,
        ]}
        disabled={!sendEnabled}
        onPress={onSend}
        accessibilityRole="button"
        accessibilityLabel="전송"
      >
        {sending ? (
          <ActivityIndicator color="#0E0E0E" size="small" />
        ) : (
          <Ionicons
            name="arrow-up"
            size={18}
            color={sendEnabled ? '#0E0E0E' : 'rgba(14,14,14,0.35)'}
          />
        )}
      </Pressable>
      {maxLength != null ? (
        <Text style={styles.counter}>
          {value.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}

const SEND_SIZE = 36;

const styles = StyleSheet.create({
  attachBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  attachBtnDisabled: {
    opacity: 0.5,
  },
  attachBtnPressed: {
    opacity: 0.75,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 52,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 120,
    paddingTop: Platform.select({ ios: 7, default: 5 }),
    paddingBottom: Platform.select({ ios: 7, default: 5 }),
    paddingHorizontal: 0,
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: SEND_SIZE,
    height: SEND_SIZE,
    borderRadius: SEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 1,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sendBtnPressed: {
    opacity: 0.88,
  },
  counter: {
    position: 'absolute',
    right: SEND_SIZE + 18,
    bottom: 8,
    fontSize: 10,
    color: 'rgba(255,255,255,0.32)',
  },
});
