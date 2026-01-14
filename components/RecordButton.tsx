'use client';

import React from 'react';
import { useIsRecording, useRoomContext } from '../custom_livekit_react';

export function RecordButton() {
  const room = useRoomContext();
  const isRecording = useIsRecording();
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const recordingEndpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT;

  React.useEffect(() => {
    if (processing) {
      setProcessing(false);
    }
  }, [isRecording]);

  const handleToggle = async () => {
    if (!recordingEndpoint) {
      setError('Recording endpoint is not configured.');
      return;
    }
    if (room.isE2EEEnabled) {
      setError('Recording of encrypted meetings is not supported.');
      return;
    }

    setError(null);
    setProcessing(true);
    const action = isRecording ? 'stop' : 'start';
    try {
      const response = await fetch(
        `${recordingEndpoint}/${action}?roomName=${encodeURIComponent(room.name)}`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to ${action} recording`);
      }
    } catch (err: any) {
      console.error('Recording toggle failed:', err);
      setError(err?.message || 'Recording toggle failed');
      setProcessing(false);
    }
  };

  return (
    <button
      type="button"
      className="lk-button"
      onClick={handleToggle}
      disabled={processing || !recordingEndpoint}
      title={error || undefined}
      style={{
        background: isRecording ? 'var(--lk-danger)' : undefined,
        color: isRecording ? 'var(--lk-text)' : undefined,
        opacity: processing || !recordingEndpoint ? 0.6 : 1,
      }}
    >
      {isRecording ? 'Stop Recording' : 'Start Recording'}
    </button>
  );
}
