import { useState, useRef } from 'react';
import { Icon } from '@iconify/react';

const UploadZone = ({ onFileSelect, onVectorize, loading = false }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [method, setMethod] = useState('ai');
  const [detailLevel, setDetailLevel] = useState('high');
  const [removeBackground, setRemoveBackground] = useState(false);
  const [outputFormat, setOutputFormat] = useState('svg');
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files[0]);
    }
  };

  const handleFiles = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, or WEBP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleVectorize = () => {
    if (!selectedFile) return;

    const options = {
      method,
      detailLevel,
      removeBackground,
      outputFormat,
    };

    onVectorize(selectedFile, options);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="panel p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Upload & Vectorize</h2>

      {/* Upload Area */}
      {!selectedFile && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-idegy-blue bg-idegy-lightblue'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon
            icon="mdi:cloud-upload-outline"
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
          />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Drop your image here, or click to browse
          </h3>
          <p className="text-sm text-gray-500">
            Supports PNG, JPG, WEBP • Max 10MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleChange}
          />
        </div>
      )}

      {/* Preview & Options */}
      {selectedFile && (
        <div className="space-y-6">
          {/* Image Preview */}
          <div className="relative">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-64 object-contain bg-gray-100 rounded-lg border-2 border-gray-200"
            />
            <button
              onClick={clearFile}
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
              title="Remove file"
            >
              <Icon icon="mdi:close" className="w-5 h-5 text-gray-700" />
            </button>
            <div className="absolute bottom-2 left-2 right-2 bg-white px-3 py-1.5 rounded-lg shadow-md text-sm overflow-hidden">
              <div className="flex items-center gap-1.5">
                <Icon icon="mdi:file-image" className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{selectedFile.name}</span>
              </div>
            </div>
          </div>

          {/* Vectorization Method */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Vectorization Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMethod('ai')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  method === 'ai'
                    ? 'border-idegy-blue bg-idegy-lightblue'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon
                  icon="mdi:robot"
                  className={`w-6 h-6 mx-auto mb-2 ${
                    method === 'ai' ? 'text-idegy-blue' : 'text-gray-600'
                  }`}
                />
                <h4 className="font-semibold text-sm mb-1">AI Vectorizer</h4>
                <p className="text-xs text-gray-600">
                  Best for colored images & photos
                </p>
              </button>

              <button
                onClick={() => setMethod('potrace')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  method === 'potrace'
                    ? 'border-idegy-blue bg-idegy-lightblue'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon
                  icon="mdi:vector-triangle"
                  className={`w-6 h-6 mx-auto mb-2 ${
                    method === 'potrace' ? 'text-idegy-blue' : 'text-gray-600'
                  }`}
                />
                <h4 className="font-semibold text-sm mb-1">Potrace</h4>
                <p className="text-xs text-gray-600">
                  Best for simple B&W graphics
                </p>
              </button>
            </div>
          </div>

          {/* Detail Level */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Detail Level
            </label>
            <div className="flex gap-2">
              {['low', 'medium', 'high'].map((level) => (
                <button
                  key={level}
                  onClick={() => setDetailLevel(level)}
                  className={`flex-1 py-2.5 rounded-lg border-2 transition-all font-medium text-sm capitalize ${
                    detailLevel === level
                      ? 'border-idegy-blue bg-idegy-blue text-white'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Higher detail preserves more features but increases file size
            </p>
          </div>

          {/* Output Format */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Output Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'svg', label: 'SVG', icon: 'mdi:svg', desc: 'Vector' },
                { value: 'pdf', label: 'PDF', icon: 'mdi:file-pdf-box', desc: 'Document' },
                { value: 'eps', label: 'EPS', icon: 'mdi:file-document-outline', desc: 'Print' },
                { value: 'ai', label: 'AI', icon: 'mdi:adobe', desc: 'Illustrator' },
                { value: 'png', label: 'PNG', icon: 'mdi:file-png-box', desc: 'Raster' },
                { value: 'jpg', label: 'JPG', icon: 'mdi:file-jpg-box', desc: 'Photo' },
              ].map((format) => (
                <button
                  key={format.value}
                  onClick={() => setOutputFormat(format.value)}
                  className={`p-2 rounded-lg border-2 transition-all ${
                    outputFormat === format.value
                      ? 'border-idegy-blue bg-idegy-lightblue'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon
                    icon={format.icon}
                    className={`w-4 h-4 mx-auto mb-0.5 ${
                      outputFormat === format.value ? 'text-idegy-blue' : 'text-gray-600'
                    }`}
                  />
                  <div className="text-xs font-semibold text-gray-700 truncate">{format.label}</div>
                  <div className="text-xs text-gray-500 truncate">{format.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Choose your preferred format for the vectorized output
            </p>
          </div>

          {/* Advanced Options */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Advanced Options
            </h4>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(e) => setRemoveBackground(e.target.checked)}
                className="w-5 h-5 text-idegy-blue border-gray-300 rounded focus:ring-idegy-blue cursor-pointer"
              />
              <div className="ml-3">
                <span className="text-sm font-medium text-gray-700">
                  Remove Background First
                </span>
                <p className="text-xs text-gray-500">
                  Use AI to remove background before vectorization
                </p>
              </div>
            </label>
          </div>

          {/* Vectorize Button */}
          <button
            onClick={handleVectorize}
            disabled={loading}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Icon icon="mdi:loading" className="w-5 h-5 inline mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Icon icon="mdi:vector-square" className="w-5 h-5 inline mr-2" />
                Vectorize Image
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadZone;
