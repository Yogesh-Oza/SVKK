import { loadEnv } from "../../config/env.js";
import { createRootLogger } from "../../utils/logger.js";
import type { Env } from "../../config/env.js";
import type { AppLogger } from "../../utils/logger.js";
import {
  notifyPolicyCreated,
  notifyPolicyNumberOrDocumentUpdated,
} from "./notification.service.js";

let cachedEnv: Env | null = null;
let cachedLog: AppLogger | null = null;

function ctx(): { env: Env; log: AppLogger } {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
    cachedLog = createRootLogger(cachedEnv);
  }
  return { env: cachedEnv, log: cachedLog! };
}

export function dispatchPolicyCreated(policyId: string, actorUserId: string): void {
  const { env, log } = ctx();
  void notifyPolicyCreated(env, log, { policyId, actorUserId }).catch((err) => {
    log.error({ err, policyId }, "notifyPolicyCreated failed");
  });
}

export function dispatchPolicyNumberOrDocumentUpdated(
  policyId: string,
  actorUserId: string,
  before: {
    policyNo: string | null;
    policyUrl: string | null;
    policyUrl2: string | null;
  },
  after: {
    policyNo: string | null;
    policyUrl: string | null;
    policyUrl2: string | null;
  },
): void {
  const policyNoChanged = (before.policyNo ?? "") !== (after.policyNo ?? "");
  const documentUrlChanged =
    (before.policyUrl ?? "") !== (after.policyUrl ?? "") ||
    (before.policyUrl2 ?? "") !== (after.policyUrl2 ?? "");
  if (!policyNoChanged && !documentUrlChanged) return;

  const { env, log } = ctx();
  void notifyPolicyNumberOrDocumentUpdated(env, log, {
    policyId,
    actorUserId,
    policyNoChanged,
    documentUrlChanged,
  }).catch((err) => {
    log.error({ err, policyId }, "notifyPolicyNumberOrDocumentUpdated failed");
  });
}
