import { authRouter } from './routers/auth';
import { catalogRouter } from './routers/catalog';
import { dashboardRouter } from './routers/dashboard';
import { procureRouter } from './routers/procure';
import { suggestionsRouter } from './routers/suggestions';
import { uploadsRouter } from './routers/uploads';
import { workspaceRouter } from './routers/workspace';
import { router } from './init';

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  catalog: catalogRouter,
  uploads: uploadsRouter,
  procure: procureRouter,
  suggestions: suggestionsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
