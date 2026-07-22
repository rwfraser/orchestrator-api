import type { CreateSessionRequest, RealtimeConnection, RealtimeProvider } from './orchestrator-api.types';

export interface ProvisionRtcConnectionInput {
  session_id: string;
  expires_at: string;
  request: CreateSessionRequest;
}

export interface ReleaseRtcConnectionInput {
  session_id: string;
  realtime: RealtimeConnection;
}

export interface RtcAdapter {
  provisionConnection(input: ProvisionRtcConnectionInput): RealtimeConnection;
  releaseConnection?(input: ReleaseRtcConnectionInput): void;
}
export type SupportedRtcProvider = RealtimeProvider;

export class LiveKitRtcAdapter implements RtcAdapter {
  provisionConnection(input: ProvisionRtcConnectionInput): RealtimeConnection {
    return {
      transport: 'webrtc',
      provider: 'livekit',
      room_name: `sales_${input.session_id}`,
      join_token: 'replace-with-ephemeral-rtc-token',
    };
  }
}

export class DailyRtcAdapter implements RtcAdapter {
  provisionConnection(input: ProvisionRtcConnectionInput): RealtimeConnection {
    return {
      transport: 'webrtc',
      provider: 'daily',
      room_name: `daily_${input.session_id}`,
      join_token: 'replace-with-ephemeral-daily-meeting-token',
    };
  }
}

export class AgoraRtcAdapter implements RtcAdapter {
  provisionConnection(input: ProvisionRtcConnectionInput): RealtimeConnection {
    return {
      transport: 'webrtc',
      provider: 'agora',
      room_name: `agora_${input.session_id}`,
      join_token: 'replace-with-ephemeral-agora-rtc-token',
    };
  }
}

export class TencentRtcAdapter implements RtcAdapter {
  provisionConnection(input: ProvisionRtcConnectionInput): RealtimeConnection {
    return {
      transport: 'webrtc',
      provider: 'tencent_rtc',
      room_name: `trtc_${input.session_id}`,
      join_token: 'replace-with-ephemeral-tencent-usersig',
    };
  }
}

export const createRtcAdapter = (provider: SupportedRtcProvider): RtcAdapter => {
  switch (provider) {
    case 'livekit':
      return new LiveKitRtcAdapter();
    case 'daily':
      return new DailyRtcAdapter();
    case 'agora':
      return new AgoraRtcAdapter();
    case 'tencent_rtc':
      return new TencentRtcAdapter();
    default: {
      const neverProvider: never = provider;
      throw new Error(`Unsupported RTC provider: ${String(neverProvider)}`);
    }
  }
};
