import { useState, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import MaskCanvas from './MaskCanvas';
import MaskToolbar from './MaskToolbar';
import { applyMaskToImage, hasSelection } from './utils/maskUtils';

const ManualMaskEditor = ({ imageSrc, onApplyMask, onApplyWithAI, onCancel }) => {
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

  const handleClear = useCallback(() => {
    maskCanvasRef.current?.clearMask();
    setPreviewMode(false);
    setPreviewImage(null);
  }, []);

  const handleInvert = useCallback(() => {
    maskCanvasRef.current?.invertMask();
  }, []);

  const handlePreview = useCallback(() => {
    if (!maskCanvasRef.current) return;
    const maskData = maskCanvasRef.current.getMaskData();
    const imageData = maskCanvasRef.current.getImageData();
    if (!maskData || !imageData || !hasSelection(maskData)) {
      alert('Please make a selection first');
      return;
    }
    const resultData = applyMaskToImage(imageData, maskData);
    const dims = maskCanvasRef.current.getDimensions();
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    canvas.getContext('2d').putImageData(resultData, 0, 0);
    setPreviewImage(canvas.toDataURL('image/png'));
    setPreviewMode(true);
  }, []);

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
      const resultData = applyMaskToImage(imageData, maskData);
      const dims = maskCanvasRef.current.getDimensions();
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      canvas.getContext('2d').putImageData(resultData, 0, 0);
      onApplyMask?.(canvas.toDataURL('image/png'));
    } catch (error) {
      alert('Failed to apply mask: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }, [onApplyMask]);

  const handleApplyWithAI = useCallback(async (mode) => {
    if (!maskCanvasRef.current) return;
    const maskDataURL = maskCanvasRef.current.getMaskDataURL();
    if (!maskDataURL) {
      alert('Please make a selection first');
      return;
    }
    setProcessing(true);
    try {
      await onApplyWithAI?.(maskDataURL, mode);
    } catch (error) {
      alert('Failed to apply with AI: ' + error.message);
    } finally {
      setProcessing(false);
    }
  }, [onApplyWithAI]);

  return (
    <div className="flex flex-col h-full">
      {/* Canvas + Toolbar */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Canvas */}
        <div className="flex-1 relative rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          {previewMode && previewImage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(45deg, #4a4a4a 25%, transparent 25%), linear-gradient(-45deg, #4a4a4a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #4a4a4a 75%), linear-gradient(-45deg, transparent 75%, #4a4a4a 75%)`,
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                }}
              />
              <img src={previewImage} alt="Preview" className="relative max-w-full max-h-full object-contain" />
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

        {/* Toolbar */}
        <div className="w-56 flex-shrink-0">
          <MaskToolbar
            activeTool={activeTool}
            onToolChange={(t) => { setActiveTool(t); setPreviewMode(false); }}
            toolSettings={toolSettings}
            onSettingsChange={setToolSettings}
            onClear={handleClear}
            onInvert={handleInvert}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200">
        <div>
          {previewMode ? (
            <button onClick={() => setPreviewMode(false)} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
              <Icon icon="mdi:arrow-left" className="w-4 h-4" /> Back to Edit
            </button>
          ) : (
            <button onClick={handlePreview} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
              <Icon icon="mdi:eye" className="w-4 h-4" /> Preview
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={processing}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleApplyLocal}
            disabled={processing}
            className="px-4 py-1.5 bg-idegy-blue text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {processing ? <Icon icon="mdi:loading" className="w-4 h-4 animate-spin" /> : <Icon icon="mdi:check" className="w-4 h-4" />}
            Apply
          </button>

          {onApplyWithAI && (
            <>
              <button
                onClick={() => handleApplyWithAI('refine')}
                disabled={processing}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
                title="AI refines the edges of your selection"
              >
                <Icon icon="mdi:auto-fix" className="w-4 h-4" />
                AI Edges
              </button>
              <button
                onClick={() => handleApplyWithAI('within')}
                disabled={processing}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                title="AI removes background within your selection"
              >
                <Icon icon="mdi:selection" className="w-4 h-4" />
                AI Within
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualMaskEditor;
