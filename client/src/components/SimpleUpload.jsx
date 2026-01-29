import { useState, useCallback } from 'react';
import { Icon } from '@iconify/react';

function SimpleUpload({ onUpload, disabled }) {
  const [dragActive, setDragActive] = useState(false);
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [mode, setMode] = useState('vectorize'); // 'vectorize' | 'cleanup'

  const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/svg+xml'];
  const acceptedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.svg'];

  const validateFile = (file) => {
    if (!file) return 'No file selected';

    const isValidType = acceptedTypes.includes(file.type) ||
      acceptedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      return 'Please upload a JPG, PNG, WEBP, PDF, or SVG file';
    }

    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      return 'File size must be under 50MB';
    }

    return null;
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);

    const file = e.dataTransfer?.files?.[0];
    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    // Create preview URL
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const handleFileInput = (e) => {
    setError(null);
    const file = e.target.files?.[0];
    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    // Create preview URL
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    onUpload({
      file: selectedFile,
      clientName: clientName.trim(),
      projectName: projectName.trim(),
      removeBackground: mode === 'vectorize' ? removeBackground : false,
      mode,
    });
  };

  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-xl">
        {/* Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer upload-zone-hover
            ${dragActive
              ? 'border-idegy-navy dark:border-idegy-blue bg-idegy-navy/10 dark:bg-idegy-blue/20'
              : selectedFile
                ? 'border-idegy-teal bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-idegy-navy dark:hover:border-idegy-blue hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            shadow-sm hover:shadow-md dark:shadow-black/20
          `}
          onClick={() => !disabled && document.getElementById('file-input').click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.svg"
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />

          {selectedFile ? (
            <div className="space-y-4">
              {/* Image Preview */}
              {previewUrl ? (
                <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-800 rounded-full flex items-center justify-center">
                  <Icon icon="mdi:file-pdf-box" className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
              <div>
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline"
                disabled={disabled}
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <Icon
                  icon={dragActive ? "mdi:cloud-download" : "mdi:cloud-upload"}
                  className={`w-8 h-8 ${dragActive ? 'text-idegy-navy' : 'text-gray-400 dark:text-gray-500'}`}
                />
              </div>
              <div>
                <p className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  {dragActive ? 'Drop it!' : 'Drop your logo here'}
                </p>
                <p className="text-gray-500 dark:text-gray-400 mt-1">or click to browse</p>
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                JPG, PNG, WEBP, PDF, or SVG
              </p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
            <Icon icon="mdi:alert-circle" className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Options */}
        <div className="mt-6 space-y-4">
          {/* Processing Mode Toggle */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Processing mode</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setMode('vectorize')}
                disabled={disabled}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                  mode === 'vectorize'
                    ? 'border-idegy-navy dark:border-idegy-blue bg-idegy-navy/5 dark:bg-idegy-blue/10'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Vectorize</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">AI-powered trace &amp; optimize</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('cleanup')}
                disabled={disabled}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                  mode === 'cleanup'
                    ? 'border-idegy-navy dark:border-idegy-blue bg-idegy-navy/5 dark:bg-idegy-blue/10'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Clean up only</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Faithful trace, then manually edit</div>
              </button>
            </div>
          </div>

          {/* Background handling - only show in vectorize mode */}
          {mode === 'vectorize' && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Background handling</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setRemoveBackground(true)}
                disabled={disabled}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                  removeBackground
                    ? 'border-idegy-navy dark:border-idegy-blue bg-idegy-navy/5 dark:bg-idegy-blue/10'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Remove background</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Photo, product shot, complex scene</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveBackground(false)}
                disabled={disabled}
                className={`flex-1 p-3 rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98] ${
                  !removeBackground
                    ? 'border-idegy-navy dark:border-idegy-blue bg-idegy-navy/5 dark:bg-idegy-blue/10'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">Keep as-is</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Already transparent, or solid color bg</div>
              </button>
            </div>
          </div>
          )}

          {/* Client/Project Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="client-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="input-field"
                disabled={disabled}
              />
            </div>
            <div>
              <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Homepage Logo"
                className="input-field"
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!selectedFile || disabled}
          className={`
            mt-6 w-full py-4 px-6 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all
            ${selectedFile && !disabled
              ? 'btn-primary hover:-translate-y-0.5 active:scale-[0.98]'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <Icon icon={mode === 'cleanup' ? 'mdi:pencil-ruler' : 'mdi:vector-triangle'} className="w-6 h-6" />
          {mode === 'cleanup' ? 'Upload & Clean Up' : 'Upload & Vectorize'}
        </button>
      </div>
    </div>
  );
}

export default SimpleUpload;
