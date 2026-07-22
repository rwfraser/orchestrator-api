import { createOrchestratorApp } from './orchestrator-app';
import { videoBackgroundOrchestrationService } from './video-background-orchestration-service';

const app = createOrchestratorApp(videoBackgroundOrchestrationService);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sample orchestrator server listening on :${port}`);
});

