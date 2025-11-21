import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const vectorizeImage = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('image', file);

  if (options.method) formData.append('method', options.method);
  if (options.detailLevel) formData.append('detailLevel', options.detailLevel);
  if (options.removeBackground) formData.append('removeBackground', options.removeBackground);

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

  const response = await api.post('/vectorize/batch', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const convertFormat = async (filename, format) => {
  const response = await api.post(`/convert/${filename}`, { format });
  return response.data;
};

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

export default api;
