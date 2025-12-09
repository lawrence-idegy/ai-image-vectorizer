import { useState, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import MaskCanvas from './MaskCanvas';
import MaskToolbar from './MaskToolbar';
import { featherMask, growMask, shrinkMask, applyMaskToImage, maskToDataURL, hasSelection } from './utils/maskUtils';

/**
 * ManualMaskEditor - Container for manual background removal tools
 * Manages tool state and coordinates between canvas and toolbar
 */
const ManualMaskEditor = ({
  imageSrc,
  onApplyMask,
  onApplyWithAI,
  onCancel
}) => {
  const maskCanvasRef = useRef(null);

  const [activeTool, setActiveTool] = useState('magicWand');
  const [toolSettings, setToolSettings] = useState({
    tolerance: 32,
    contiguous: true,
    brushSize: 20,
    hardness: 100,
    overlayOpacity: 0.5
  });

  const [previewMode, setPreviewMode] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Handle tool change
  const handleToolChange = useCallback((tool) => {
    setActiveTool(tool);
    setPreviewMode(false);
  }, []);

  // Handle settings change
  const handleSettingsChange = useCallback((newSettings) => {
    setToolSettings(newSettings);
  }, []);

  // Clear mask
  const handleClear = useCallback(() => {
    if (maskCanvasRef.current) {
      maskCanvasRef.current.clearMask();
    }
    setPreviewMode(false);
    setPreviewImage(null);
  }, []);

  // Invert mask
  const handleInvert = useCallback(() => {
    if (maskCanvasRef.current) {
      maskCanvasRef.current.invertMask();
    }
  }, []);

  // Feather mask edges
  const handleFeather = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const maskData = maskCanvasRef.current.getMaskData();
    const dims = maskCanvasRef.current.getDimensions();

    if (!maskData || !hasSelection(maskData)) {
      alert('No selection to feather');
      return;
    }

    const feathered = featherMask(maskData, dims.width, dims.height, 5);

    // Update the mask canvas with feathered result
    // Note: We'd need to add a setMaskData method to MaskCanvas for this
    // For now, this shows the feathering concept
    console.log('Feathered mask:', feathered);
  }, []);

  // Grow selection
  const handleGrow = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const maskData = maskCanvasRef.current.getMaskData();
    const dims = maskCanvasRef.current.getDimensions();

    if (!maskData || !hasSelection(maskData)) {
      alert('No selection to grow');
      return;
    }

    const grown = growMask(maskData, dims.width, dims.height, 3);
    console.log('Grown mask:', grown);
  }, []);

  // Shrink selection
  const handleShrink = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const maskData = maskCanvasRef.current.getMaskData();
    const dims = maskCanvasRef.current.getDimensions();

    if (!maskData || !hasSelection(maskData)) {
      alert('No selection to shrink');
      return;
    }

    const shrunk = shrinkMask(maskData, dims.width, dims.height, 3);
    console.log('Shrunk mask:', shrunk);
  }, []);

  // Preview the result
  const handlePreview = useCallback(() => {
    if (!maskCanvasRef.current) return;

    const maskData = maskCanvasRef.current.getMaskData();
    const imageData = maskCanvasRef.current.getImageData();

    if (!maskData || !imageData || !hasSelection(maskData)) {
      alert('Please make a selection first');
      return;
    }

    // Apply mask to create preview
    const resultData = applyMaskToImage(imageData, maskData);

    // Convert to data URL for preview
    const dims = maskCanvasRef.current.getDimensions();
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(resultData, 0, 0);

    setPreviewImage(canvas.toDataURL('image/png'));
    setPreviewMode(true);
  }, []);

  // Apply mask locally (without AI)
  const handleApplyLocal = useCallback(async () => {
    if (!maskCanvasRef.current) return;

    const maskData = maskCanvasRef.current.getMaskData();
    const imageData = maskCanvasRef.current.getImageData();

    if (!maskData || !imageData || !hasSelection(maskData)) {
      alert('Please make a selection first');
      return;
    }

    setProcessing(true);

    try {
      // Apply mask and get result
      const resultData = applyMaskToImage(imageData, maskData);

      // Convert to data URL
      const dims = maskCanvasRef.current.getDimensions();
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(resultData, 0, 0);

      const resultDataURL = canvas.toDataURL('image/png');

      if (onApplyMask) {
        onApplyMask(resultDataURL);
      }
    } catch (error) {
      console.error('Error applying mask:', error);
      alert('Failed to apply mask: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }, [onApplyMask]);

  // Apply with AI refinement
  const handleApplyWithAI = useCallback(async (mode) => {
    if (!maskCanvasRef.current) return;

    const maskDataURL = maskCanvasRef.current.getMaskDataURL();

    if (!maskDataURL) {
      alert('Please make a selection first');
      return;
    }

    setProcessing(true);

    try {
      if (onApplyWithAI) {
        await onApplyWithAI(maskDataURL, mode);
      }
    } catch (error) {
      console.error('Error applying with AI:', error);
      alert('Failed to apply with AI: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }, [onApplyWithAI]);

  return (
    <div className="flex flex-col h-full">
      {/* Canvas Area */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Main Canvas */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200">
          {previewMode && previewImage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              {/* Checkerboard background */}
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
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                }}
              />
              <img
                src={previewImage}
                alt="Preview"
                className="relative max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <MaskCanvas
              ref={maskCanvasRef}
              imageSrc={imageSrc}
              activeTool={activeTool}
              toolSettings={toolSettings}
              maskOverlayOpacity={toolSettings.overlayOpacity}
            />
          )}
        </div>

        {/* Toolbar Sidebar */}
        <div className="w-64 flex-shrink-0">
          <MaskToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            toolSettings={toolSettings}
            onSettingsChange={handleSettingsChange}
            onClear={handleClear}
            onInvert={handleInvert}
            onFeather={handleFeather}
            onGrow={handleGrow}
            onShrink={handleShrink}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {previewMode ? (
              <button
                onClick={() => setPreviewMode(false)}
                className="btn-secondary px-4 py-2"
              >
                <Icon icon="mdi:pencil" className="w-4 h-4 inline mr-2" />
                Back to Edit
              </button>
            ) : (
              <button
                onClick={handlePreview}
                className="btn-secondary px-4 py-2"
              >
                <Icon icon="mdi:eye" className="w-4 h-4 inline mr-2" />
                Preview Result
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="btn-secondary px-4 py-2"
              disabled={processing}
            >
              Cancel
            </button>

            {/* Apply Options Dropdown */}
            <div className="relative group">
              <button
                onClick={handleApplyLocal}
                disabled={processing}
                className="btn-primary px-4 py-2 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <Icon icon="mdi:loading" className="w-4 h-4 inline mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:check" className="w-4 h-4 inline mr-2" />
                    Apply Selection
                  </>
                )}
              </button>
            </div>

            {/* AI Options */}
            <div className="relative">
              <button
                onClick={() => handleApplyWithAI('refine')}
                disabled={processing}
                className="btn-primary px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                title="Use AI to refine the edges of your selection"
              >
                <Icon icon="mdi:auto-fix" className="w-4 h-4 inline mr-2" />
                AI Refine Edges
              </button>
            </div>

            <button
              onClick={() => handleApplyWithAI('within')}
              disabled={processing}
              className="btn-primary px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              title="Use AI to remove background only within your selection"
            >
              <Icon icon="mdi:selection" className="w-4 h-4 inline mr-2" />
              AI Within Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualMaskEditor;
