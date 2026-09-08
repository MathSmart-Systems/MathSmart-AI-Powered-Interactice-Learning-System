const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;

export const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK !== 'false';

export default { API_BASE_URL, getApiUrl, USE_MOCK };