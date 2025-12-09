import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { removeBackground as removeBackgroundAPI } from '../../services/api';

const BackgroundRemovalTool = ({ image, onComplete, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [processedImage, setProcessedImage] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (image) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalImage(e.target.result);
      };
      reader.readAsDataURL(image);
    }
  }, [image]);

  const handleRemoveBackground = async () => {
    setLoading(true);
    try {
      const result = await removeBackgroundAPI(image);

      // Assuming the API returns a base64 or blob URL
      if (result.image) {
        setProcessedImage(result.image);
        setShowComparison(true);
      } else {
        alert('Background removal failed. Please try again.');
      }
    } catch (error) {
      console.error('Error removing background:', error);
      alert('An error occurred during background removal.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (processedImage && onComplete) {
      try {
        setLoading(true);

        // Convert data URL to File without using fetch (more reliable)
        // Data URL format: data:image/png;base64,<base64data>
        const dataUrlParts = processedImage.split(',');
        const mimeMatch = dataUrlParts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = dataUrlParts[1];

        // Decode base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: mimeType });
        const file = new File([blob], 'removed-bg.png', { type: mimeType });

        await onComplete(file);
      } catch (error) {
        console.error('Error accepting processed image:', error);
        alert('Failed to process the image: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSliderChange = (e) => {
    setSliderPosition(e.target.value);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="gradient-header p-6 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Background Remover</h2>
            <p className="text-white/80 text-sm">AI-powered background removal</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Icon icon="mdi:close" className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!processedImage ? (
            /* Before Processing */
            <div className="space-y-6">
              {/* Preview */}
              <div className="relative bg-gray-100 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
                {originalImage ? (
                  <img
                    src={originalImage}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <Icon icon="mdi:image-outline" className="w-24 h-24 text-gray-300" />
                )}
              </div>

              {/* Info */}
              <div className="bg-idegy-lightblue border-2 border-idegy-blue/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Icon icon="mdi:information" className="w-6 h-6 text-idegy-blue flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-gray-900 mb-1">How it works:</p>
                    <ul className="space-y-1 text-gray-700">
                      <li>• AI will detect and remove the background automatically</li>
                      <li>• Works best with clear subject-background separation</li>
                      <li>• Result will have transparent background (PNG)</li>
                      <li>• You can then vectorize the cleaned image</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleRemoveBackground}
                disabled={loading}
                className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Icon icon="mdi:loading" className="w-6 h-6 inline mr-2 animate-spin" />
                    Removing Background...
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:scissors-cutting" className="w-6 h-6 inline mr-2" />
                    Remove Background
                  </>
                )}
              </button>
            </div>
          ) : (
            /* After Processing - Comparison View */
            <div className="space-y-6">
              {/* Comparison Slider */}
              <div
                ref={containerRef}
                className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video"
              >
                {/* Original Image (Background) */}
                <img
                  src={originalImage}
                  alt="Original"
                  className="absolute inset-0 w-full h-full object-contain"
                />

                {/* Processed Image (Foreground with clip) */}
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
                  }}
                >
                  {/* Checkerboard pattern for transparency */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `
                        linear-gradient(45deg, #ccc 25%, transparent 25%),
                        linear-gradient(-45deg, #ccc 25%, transparent 25%),
                        linear-gradient(45deg, transparent 75%, #ccc 75%),
                        linear-gradient(-45deg, transparent 75%, #ccc 75%)
                      `,
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                    }}
                  />
                  <img
                    src={processedImage}
                    alt="Processed"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>

                {/* Slider Line */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center">
                    <Icon icon="mdi:drag-vertical" className="w-6 h-6 text-gray-700" />
                  </div>
                </div>

                {/* Labels */}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white text-sm font-medium">
                  Original
                </div>
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white text-sm font-medium">
                  Removed
                </div>
              </div>

              {/* Slider Control */}
              <div className="px-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #0076CE ${sliderPosition}%, #e5e7eb ${sliderPosition}%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>Drag to compare</span>
                  <span>{sliderPosition}%</span>
                </div>
              </div>

              {/* Quality Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="mdi:check-circle" className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-gray-900">Background Removed</span>
                  </div>
                  <p className="text-sm text-gray-600">Transparent PNG generated</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="mdi:sparkles" className="w-5 h-5 text-idegy-blue" />
                    <span className="font-semibold text-gray-900">AI-Powered</span>
                  </div>
                  <p className="text-sm text-gray-600">High-quality edge detection</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  disabled={loading}
                  className="btn-primary flex-1 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Icon icon="mdi:loading" className="w-5 h-5 inline mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:check-bold" className="w-5 h-5 inline mr-2" />
                      Accept & Continue
                    </>
                  )}
                </button>
                <button
                  onClick={() => setProcessedImage(null)}
                  disabled={loading}
                  className="btn-secondary px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon icon="mdi:refresh" className="w-5 h-5 inline mr-2" />
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Slider Styles */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0076CE;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0076CE;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
};

export default BackgroundRemovalTool;
