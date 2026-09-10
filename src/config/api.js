const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;

/**
 * Serve features from local fixtures only when explicitly requested. Production
 * and ordinary development use the canonical FastAPI service by default.
 */
export const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK === 'true';

const apiConfig = { API_BASE_URL, getApiUrl, USE_MOCK };

export default apiConfig;
