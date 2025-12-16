import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { removeBackground as removeBackgroundAPI, removeBackgroundWithMask } from '../../services/api';
import { ManualMaskEditor } from './ManualMaskEditor';

// Quality presets for background removal
const QUALITY_PRESETS = [
  {
    id: 'fast',
    name: 'Fast',
    icon: 'mdi:lightning-bolt',
    description: 'Quick processing (~2s)',
    detail: 'Best for simple backgrounds',
    color: 'emerald'
  },
  {
    id: 'balanced',
    name: 'Balanced',
    icon: 'mdi:scale-balance',
    description: 'Good balance (~3s)',
    detail: 'Works for most images',
    color: 'blue',
    recommended: true
  },
  {
    id: 'quality',
    name: 'High Quality',
    icon: 'mdi:diamond-stone',
    description: 'Best edges (~40s)',
    detail: 'Fine details, hair, spikes',
    color: 'purple'
  }
];

const BackgroundRemovalTool = ({ image, onComplete, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [processedImage, setProcessedImage] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [activeMode, setActiveMode] = useState('ai');
  const [selectedQuality, setSelectedQuality] = useState('balanced');
  const containerRef = useRef(null);

  useEffect(() => {
    if (image) {
      const reader = new FileReader();
      reader.onload = (e) => setOriginalImage(e.target.result);
      reader.readAsDataURL(image);
    }
  }, [image]);

  const handleRemoveBackground = async () => {
    setLoading(true);
    try {
      const result = await removeBackgroundAPI(image, { quality: selectedQuality });
      if (result.image) {
        setProcessedImage(result.image);
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
        const dataUrlParts = processedImage.split(',');
        const mimeMatch = dataUrlParts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = dataUrlParts[1];
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

  const handleManualMaskApply = async (resultDataURL) => {
    setProcessedImage(resultDataURL);
    setActiveMode('ai');
  };

  const handleManualMaskWithAI = async (maskDataURL, mode) => {
    setLoading(true);
    try {
      const result = await removeBackgroundWithMask(image, maskDataURL, { mode });
      if (result.image) {
        setProcessedImage(result.image);
        setActiveMode('ai');
      } else {
        alert('Background removal failed. Please try again.');
      }
    } catch (error) {
      console.error('Error with AI mask processing:', error);
      alert('An error occurred: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const modes = [
    { id: 'ai', label: 'AI Auto', icon: 'mdi:auto-fix' },
    { id: 'manual', label: 'Manual', icon: 'mdi:brush' },
    { id: 'hybrid', label: 'AI + Manual', icon: 'mdi:vector-combine' }
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-idegy-blue to-blue-600 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Icon icon="mdi:image-remove" className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Background Remover</h2>
                <p className="text-white/70 text-xs">Remove backgrounds with AI or manual tools</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
            >
              <Icon icon="mdi:close" className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-1 mt-4">
            {modes.map(mode => (
              <button
                key={mode.id}
                onClick={() => {
                  setActiveMode(mode.id);
                  setProcessedImage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeMode === mode.id
                    ? 'bg-white text-idegy-blue'
                    : 'bg-white/10 text-white/90 hover:bg-white/20'
                }`}
              >
                <Icon icon={mode.icon} className="w-4 h-4" />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* AI Auto Mode */}
          {activeMode === 'ai' && (
            <div className="p-5">
              {!processedImage ? (
                <div className="space-y-4">
                  {/* Image Preview */}
                  <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: '240px' }}>
                    {originalImage ? (
                      <img
                        src={originalImage}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Icon icon="mdi:image-outline" className="w-16 h-16 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Quality Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quality Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {QUALITY_PRESETS.map((preset) => {
                        const isSelected = selectedQuality === preset.id;
                        const colorClasses = {
                          emerald: isSelected ? 'border-emerald-500 bg-emerald-50 ring-emerald-500' : 'hover:border-emerald-300',
                          blue: isSelected ? 'border-blue-500 bg-blue-50 ring-blue-500' : 'hover:border-blue-300',
                          purple: isSelected ? 'border-purple-500 bg-purple-50 ring-purple-500' : 'hover:border-purple-300',
                        };
                        const iconColorClasses = {
                          emerald: isSelected ? 'text-emerald-600' : 'text-gray-400',
                          blue: isSelected ? 'text-blue-600' : 'text-gray-400',
                          purple: isSelected ? 'text-purple-600' : 'text-gray-400',
                        };

                        return (
                          <button
                            key={preset.id}
                            onClick={() => setSelectedQuality(preset.id)}
                            className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                              isSelected ? `${colorClasses[preset.color]} ring-1` : `border-gray-200 ${colorClasses[preset.color]}`
                            }`}
                          >
                            {preset.recommended && (
                              <span className="absolute -top-2 right-2 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded">
                                Recommended
                              </span>
                            )}
                            <Icon
                              icon={preset.icon}
                              className={`w-5 h-5 mb-1 ${iconColorClasses[preset.color]}`}
                            />
                            <div className="font-medium text-sm text-gray-900">{preset.name}</div>
                            <div className="text-xs text-gray-500">{preset.description}</div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {QUALITY_PRESETS.find(p => p.id === selectedQuality)?.detail}
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex gap-2">
                      <Icon icon="mdi:information" className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      <div className="text-sm text-gray-700">
                        <p className="font-medium text-gray-900 mb-1">AI-Powered Removal</p>
                        <p>
                          {selectedQuality === 'quality'
                            ? 'High Quality mode uses BiRefNet for best edge preservation. Ideal for logos with fine details like hair, fur, or spikes.'
                            : 'Automatically detects and removes backgrounds. Best for images with clear subject separation.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={handleRemoveBackground}
                    disabled={loading}
                    className="w-full bg-idegy-blue hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Icon icon="mdi:loading" className="w-5 h-5 animate-spin" />
                        {selectedQuality === 'quality' ? 'Processing (this may take ~40s)...' : 'Removing Background...'}
                      </>
                    ) : (
                      <>
                        <Icon icon="mdi:auto-fix" className="w-5 h-5" />
                        Remove Background
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Comparison View */
                <div className="space-y-4">
                  {/* Comparison Slider */}
                  <div
                    ref={containerRef}
                    className="relative bg-gray-900 rounded-lg overflow-hidden"
                    style={{ height: '320px' }}
                  >
                    <img
                      src={originalImage}
                      alt="Original"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)`,
                          backgroundSize: '16px 16px',
                          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                        }}
                      />
                      <img
                        src={processedImage}
                        alt="Processed"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                        <Icon icon="mdi:drag-horizontal-variant" className="w-4 h-4 text-gray-600" />
                      </div>
                    </div>
                    <div className="absolute top-3 left-3 bg-black/50 px-2 py-1 rounded text-white text-xs">Original</div>
                    <div className="absolute top-3 right-3 bg-black/50 px-2 py-1 rounded text-white text-xs">Removed</div>
                  </div>

                  {/* Slider */}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderPosition}
                    onChange={(e) => setSliderPosition(e.target.value)}
                    className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-idegy-blue"
                  />

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAccept}
                      disabled={loading}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <Icon icon="mdi:loading" className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon icon="mdi:check" className="w-4 h-4" />
                      )}
                      Accept & Continue
                    </button>
                    <button
                      onClick={() => setProcessedImage(null)}
                      disabled={loading}
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Icon icon="mdi:refresh" className="w-4 h-4" />
                      Retry
                    </button>
                    <button
                      onClick={() => setActiveMode('manual')}
                      disabled={loading}
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Icon icon="mdi:brush" className="w-4 h-4" />
                      Refine
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {activeMode === 'manual' && originalImage && (
            <div className="p-4" style={{ height: '500px' }}>
              <ManualMaskEditor
                imageSrc={originalImage}
                onApplyMask={handleManualMaskApply}
                onApplyWithAI={null}
                onCancel={() => setActiveMode('ai')}
              />
            </div>
          )}

          {/* Hybrid Mode */}
          {activeMode === 'hybrid' && originalImage && (
            <div className="p-4" style={{ height: '500px' }}>
              <div className="mb-3 bg-purple-50 rounded-lg p-3">
                <div className="flex gap-2">
                  <Icon icon="mdi:lightbulb-outline" className="w-5 h-5 text-purple-600 flex-shrink-0" />
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">AI + Manual:</span> Select areas manually, then use AI to refine edges or process within selection.
                  </p>
                </div>
              </div>
              <div style={{ height: 'calc(100% - 56px)' }}>
                <ManualMaskEditor
                  imageSrc={originalImage}
                  onApplyMask={handleManualMaskApply}
                  onApplyWithAI={handleManualMaskWithAI}
                  onCancel={() => setActiveMode('ai')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackgroundRemovalTool;
