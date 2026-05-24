import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PipelineStep } from '../lib/pipeline';

type PipelinePanelProps = {
  title: string;
  steps: PipelineStep[];
  defaultExpanded?: boolean;
};

const STATUS_ICON: Record<PipelineStep['status'], string> = {
  pending: '○',
  running: '…',
  ok: '✓',
  error: '✕',
  skip: '−',
};

const STATUS_COLOR: Record<PipelineStep['status'], string> = {
  pending: 'rgba(255,255,255,0.35)',
  running: 'rgba(255,220,120,0.95)',
  ok: 'rgba(120,220,160,0.95)',
  error: 'rgba(255,120,120,0.95)',
  skip: 'rgba(255,255,255,0.25)',
};

export function PipelinePanel({
  title,
  steps,
  defaultExpanded = true,
}: PipelinePanelProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  if (!steps.length) return null;

  const failed = steps.find((s) => s.status === 'error');

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {failed ? (
        <Text style={styles.failHint}>
          실패 단계: {failed.label}
          {failed.detail ? ` — ${failed.detail}` : ''}
        </Text>
      ) : null}
      {expanded ? (
        <View style={styles.list}>
          {steps.map((step) => (
            <View key={step.id} style={styles.row}>
              <Text
                style={[
                  styles.icon,
                  { color: STATUS_COLOR[step.status] },
                ]}
              >
                {STATUS_ICON[step.status]}
              </Text>
              <View style={styles.body}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{step.label}</Text>
                  <Text style={styles.layer}>
                    {step.layer === 'server' ? 'SGS' : '앱'}
                  </Text>
                </View>
                {step.detail ? (
                  <Text style={styles.detail} numberOfLines={4}>
                    {step.detail}
                  </Text>
                ) : null}
                {step.ms != null && step.status !== 'pending' ? (
                  <Text style={styles.ms}>{step.ms}ms</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  chevron: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  failHint: {
    fontSize: 12,
    color: 'rgba(255,120,120,0.95)',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  icon: {
    fontSize: 14,
    fontWeight: '800',
    width: 16,
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  layer: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  detail: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 15,
  },
  ms: {
    marginTop: 2,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
});
