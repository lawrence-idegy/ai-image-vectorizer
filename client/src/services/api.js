import axios from 'axios';

// API URL configuration - v2.0.1
// In production, use relative URL (same domain). In dev, use localhost:3000
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_URL = import.meta.env.VITE_API_URL || (isProduction ? '/api' : 'http://localhost:3000/api');

const api = axios.create({
  baseURL: API_URL,
});

// Axios interceptor to set Content-Type based on data type
api.interceptors.request.use((config) => {
  // Don't set Content-Type for FormData - browser will set it with boundary
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken } = response.data;
          localStorage.setItem('accessToken', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }
    }

    return Promise.reject(error);
  }
);

// Vectorization API
export const vectorizeImage = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('image', file);

  if (options.method) formData.append('method', options.method);
  if (options.detailLevel) formData.append('detailLevel', options.detailLevel);
  if (options.removeBackground) formData.append('removeBackground', options.removeBackground);
  if (options.optimize !== undefined) formData.append('optimize', options.optimize.toString());
  if (options.optimizeLevel) formData.append('optimizeLevel', options.optimizeLevel);

  // Don't set Content-Type manually - let browser set it with correct boundary
  const response = await api.post('/vectorize', formData);

  return response.data;
};

// Background removal
export const removeBackground = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('image', file);

  // Quality preset: 'fast', 'balanced', or 'quality'
  if (options.quality) formData.append('quality', options.quality);
  if (options.threshold !== undefined) formData.append('threshold', options.threshold.toString());

  // Don't set Content-Type manually - let browser set it with correct boundary
  const response = await api.post('/remove-background', formData);

  return response.data;
};

export default api;
