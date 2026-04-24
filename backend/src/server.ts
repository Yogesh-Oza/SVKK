import { loadEnv } from "./config/env.js";
import { createRootLogger } from "./utils/logger.js";
import { createApp } from "./app.js";

const env = loadEnv();
const log = createRootLogger(env);
const app = createApp(env, log);

app.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "SVKK API listening");
});
