const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;

/**
 * Serve features from local fixtures instead of the backend. Defaults to on, so
 * a checkout with no `.env.local` still runs; set `NEXT_PUBLIC_USE_MOCK=false`
 * to call the real FastAPI service.
 */
export const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK !== 'false';

const apiConfig = { API_BASE_URL, getApiUrl, USE_MOCK };

export default apiConfig;
