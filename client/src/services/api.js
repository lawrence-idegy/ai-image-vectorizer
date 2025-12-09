import axios from 'axios';

// API URL configuration - v2.0.1
// In production, use relative URL (same domain). In dev, use localhost:3000
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const API_URL = import.meta.env.VITE_API_URL || (isProduction ? '/api' : 'http://localhost:3000/api');

console.log('API URL:', API_URL, 'Production:', isProduction);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

  const response = await api.post('/vectorize', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const batchVectorize = async (files, options = {}) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('images', file);
  });

  if (options.method) formData.append('method', options.method);
  if (options.detailLevel) formData.append('detailLevel', options.detailLevel);
  if (options.optimize) formData.append('optimize', options.optimize);
  if (options.outputFormat) formData.append('outputFormat', options.outputFormat);

  const response = await api.post('/vectorize/batch', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// Format conversion
export const convertFormat = async (filename, format) => {
  const response = await api.post(`/convert/${filename}`, { format });
  return response.data;
};

// File operations
export const downloadFile = async (filename) => {
  const response = await api.get(`/download/${filename}`, {
    responseType: 'blob',
  });
  return response.data;
};

export const getSVGPreview = async (filename) => {
  const response = await api.get(`/preview/${filename}`);
  return response.data;
};

// Background removal
export const removeBackground = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  const response = await api.post('/remove-background', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// Background removal with mask
export const removeBackgroundWithMask = async (file, maskDataURL, options = {}) => {
  const formData = new FormData();
  formData.append('image', file);

  // Convert mask data URL to blob
  const maskBlob = await dataURLtoBlob(maskDataURL);
  formData.append('mask', maskBlob, 'mask.png');

  if (options.mode) formData.append('mode', options.mode); // 'refine' or 'within'
  if (options.feather) formData.append('feather', options.feather.toString());

  const response = await api.post('/remove-background-with-mask', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

// Helper function to convert data URL to Blob
const dataURLtoBlob = async (dataURL) => {
  const parts = dataURL.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64Data = parts[1];

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
};

// SVG operations
export const optimizeSVG = async (svgContent, options = {}) => {
  const response = await api.post('/optimize', {
    svgContent,
    level: options.level || 'default',
    preserveColors: options.preserveColors !== false,
  });
  return response.data;
};

export const analyzeSVG = async (svgContent) => {
  const response = await api.post('/analyze', { svgContent });
  return response.data;
};

// Job status
export const getJobStatus = async (jobId) => {
  const response = await api.get(`/job/${jobId}`);
  return response.data;
};

// Methods and info
export const getMethods = async () => {
  const response = await api.get('/methods');
  return response.data;
};

export const getFormats = async () => {
  const response = await api.get('/formats');
  return response.data;
};

// Health check
export const getHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

// Stats (admin)
export const getStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

export default api;
