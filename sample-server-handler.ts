import { sessionManagementService } from './session-management-service';
import { createOrchestratorApp } from './orchestrator-app';

const app = createOrchestratorApp(sessionManagementService);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sample orchestrator server listening on :${port}`);
});

