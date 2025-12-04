import { useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { useJobProgress } from '../../hooks/useWebSocket.jsx';
import { batchVectorize } from '../../services/api';

function BatchProcessor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [method, setMethod] = useState('ai');
  const [optimize, setOptimize] = useState(true);
  const [outputFormat, setOutputFormat] = useState('svg');

  const progress = useJobProgress(jobId);

  const handleFilesDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer?.files || e.target.files || []);
    const imageFiles = droppedFiles.filter((f) =>
      ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type)
    );
    setFiles((prev) => [...prev, ...imageFiles].slice(0, 20));
  }, []);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setJobId(null);
  };

  const startBatch = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    try {
      const result = await batchVectorize(files, {
        method,
        optimize: optimize ? 'true' : 'false',
        outputFormat
      });
      if (result.jobId) {
        setJobId(result.jobId);
      }
    } catch (error) {
      console.error('Batch processing failed:', error);
    }
    setProcessing(false);
  };

  const isComplete = progress.status === 'completed';

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Icon icon="mdi:image-multiple" className="w-16 h-16 mx-auto mb-4 text-idegy-blue" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Batch Vectorization</h2>
          <p className="text-gray-600">
            Upload multiple images and vectorize them all at once with real-time progress tracking.
          </p>
        </div>

        {/* Options */}
        <div className="panel p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-idegy-blue focus:border-transparent"
                disabled={processing}
              >
                <option value="ai">AI (Replicate)</option>
                <option value="potrace">Potrace (Local)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Output Format</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-idegy-blue focus:border-transparent"
                disabled={processing}
              >
                <option value="svg">SVG (Vector)</option>
                <option value="png">PNG (Raster)</option>
                <option value="pdf">PDF (Document)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="optimize"
                checked={optimize}
                onChange={(e) => setOptimize(e.target.checked)}
                className="w-4 h-4 text-idegy-blue"
                disabled={processing}
              />
              <label htmlFor="optimize" className="text-sm font-medium text-gray-700">
                Optimize SVGs
              </label>
            </div>
          </div>
        </div>

        {/* Drop Zone */}
        {files.length === 0 && (
          <div
            onDrop={handleFilesDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-idegy-blue transition-colors cursor-pointer"
          >
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleFilesDrop}
              className="hidden"
              id="batch-file-input"
            />
            <label htmlFor="batch-file-input" className="cursor-pointer">
              <Icon icon="mdi:cloud-upload" className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop images here or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports PNG, JPG, WEBP (up to 20 images)
              </p>
            </label>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="panel p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">
                {files.length} image{files.length !== 1 ? 's' : ''} selected
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={clearFiles}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  disabled={processing}
                >
                  Clear All
                </button>
                <label className="px-3 py-1 text-sm text-idegy-blue hover:text-idegy-darkblue cursor-pointer">
                  Add More
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFilesDrop}
                    className="hidden"
                    disabled={processing}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
              {files.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {!processing && (
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Icon icon="mdi:close" className="w-4 h-4" />
                    </button>
                  )}
                  <p className="text-xs text-gray-500 truncate mt-1">{file.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {jobId && (
          <div className="panel p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">Processing Progress</span>
              <span className="text-sm text-gray-600">
                {progress.completedItems} / {progress.totalItems}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-idegy-teal to-idegy-blue h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            {progress.currentFile && (
              <p className="text-sm text-gray-600">
                Processing: {progress.currentFile}
              </p>
            )}
            {isComplete && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <Icon icon="mdi:check-circle" className="w-5 h-5" />
                  <span className="font-medium">
                    Completed! {progress.results?.length || 0} files processed
                    {progress.errors?.length > 0 && `, ${progress.errors.length} failed`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {isComplete && progress.results?.length > 0 && (
          <div className="panel p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Results</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {outputFormat.toUpperCase()} format
              </span>
            </div>
            <div className="space-y-2">
              {progress.results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      icon={result.success ? 'mdi:check-circle' : 'mdi:alert-circle'}
                      className={`w-5 h-5 ${result.success ? 'text-green-500' : 'text-red-500'}`}
                    />
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={
                          outputFormat === 'svg' ? 'mdi:svg' :
                          outputFormat === 'png' ? 'mdi:file-png-box' :
                          outputFormat === 'pdf' ? 'mdi:file-pdf-box' : 'mdi:file'
                        }
                        className="w-4 h-4 text-gray-500"
                      />
                      <span className="text-sm font-medium">{result.originalFilename}</span>
                    </div>
                  </div>
                  {result.success && (
                    <a
                      href={result.downloadUrl}
                      download
                      className="px-3 py-1 text-sm bg-idegy-blue text-white rounded hover:bg-idegy-darkblue transition-colors flex items-center gap-1"
                    >
                      <Icon icon="mdi:download" className="w-4 h-4" />
                      {outputFormat.toUpperCase()}
                    </a>
                  )}
                  {!result.success && (
                    <span className="text-sm text-red-500">{result.error}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Download All Button */}
            {progress.results.filter(r => r.success).length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  Click each file to download individually
                </p>
              </div>
            )}
          </div>
        )}

        {/* Start Button */}
        {files.length > 0 && !jobId && (
          <button
            onClick={startBatch}
            disabled={processing}
            className="w-full py-4 bg-gradient-to-r from-idegy-teal to-idegy-blue text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <Icon icon="mdi:loading" className="w-5 h-5 animate-spin" />
                Starting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Icon icon="mdi:rocket-launch" className="w-5 h-5" />
                Vectorize {files.length} Image{files.length !== 1 ? 's' : ''}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default BatchProcessor;
