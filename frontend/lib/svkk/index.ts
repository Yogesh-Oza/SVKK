/**
 * SVKK Express API client (axios + auth helpers).
 * Set `NEXT_PUBLIC_API_URL` to the API root including `/api/v1`.
 */
export {
  getSvkkAccessToken,
  setSvkkAccessToken,
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
