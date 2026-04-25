/**
 * SVKK Express API: shared Axios in `@/lib/api/svkk-client` (httpOnly cookies + withCredentials).
 * `NEXT_PUBLIC_API_URL` = API root including `/api/v1`.
 */
export {
  refreshSvkkAccessToken,
  svkkFetch,
  svkkJson,
  backendApi,
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
} from "./api";
export { getSvkkApiBase } from "./config";
export type { SvkkUser } from "./types";
