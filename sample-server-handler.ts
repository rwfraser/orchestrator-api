import { createOrchestratorApp } from './orchestrator-app';
import { SessionManagementService } from './session-management-service';
import { createRtcAdapter, type SupportedRtcProvider } from './rtc-adapter';
import { VideoBackgroundOrchestrationService } from './video-background-orchestration-service';

const configuredProvider = (process.env.RTC_PROVIDER ?? 'livekit') as SupportedRtcProvider;
const rtcAdapter = createRtcAdapter(configuredProvider);
const sessionManagementService = new SessionManagementService(30 * 60_000, 2_500, 2, rtcAdapter);
const orchestrationService = new VideoBackgroundOrchestrationService(sessionManagementService);
const app = createOrchestratorApp(orchestrationService);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sample orchestrator server listening on :${port} (rtc_provider=${configuredProvider})`);
});

