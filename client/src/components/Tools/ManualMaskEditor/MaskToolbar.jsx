import { Icon } from '@iconify/react';

/**
 * MaskToolbar - Tool selection and settings for manual mask editing
 */
const MaskToolbar = ({
  activeTool,
  onToolChange,
  toolSettings,
  onSettingsChange,
  onClear,
  onInvert,
  onFeather,
  onGrow,
  onShrink
}) => {
  const tools = [
    { id: 'magicWand', icon: 'mdi:magic-staff', label: 'Magic Wand', tooltip: 'Click to select similar colors' },
    { id: 'brush', icon: 'mdi:brush', label: 'Brush', tooltip: 'Paint areas to remove' },
    { id: 'eraser', icon: 'mdi:eraser', label: 'Eraser', tooltip: 'Erase from selection' },
    { id: 'lasso', icon: 'mdi:lasso', label: 'Lasso', tooltip: 'Draw freehand selection' }
  ];

  return (
    <div className="bg-gray-100 rounded-xl p-4 space-y-4">
      {/* Tool Selection */}
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
          Selection Tools
        </label>
        <div className="flex gap-2">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`flex flex-col items-center justify-center p-3 rounded-lg transition-all ${
                activeTool === tool.id
                  ? 'bg-idegy-blue text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
              title={tool.tooltip}
            >
              <Icon icon={tool.icon} className="w-5 h-5" />
              <span className="text-xs mt-1">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tool-specific Settings */}
      {(activeTool === 'magicWand') && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
              Tolerance: {toolSettings.tolerance}
            </label>
            <input
              type="range"
              min="0"
              max="255"
              value={toolSettings.tolerance}
              onChange={(e) => onSettingsChange({ ...toolSettings, tolerance: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Exact</span>
              <span>Similar</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="contiguous"
              checked={toolSettings.contiguous !== false}
              onChange={(e) => onSettingsChange({ ...toolSettings, contiguous: e.target.checked })}
              className="w-4 h-4 text-idegy-blue rounded"
            />
            <label htmlFor="contiguous" className="text-sm text-gray-700">
              Contiguous (connected areas only)
            </label>
          </div>

          <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200">
            <p><strong>Shift+Click:</strong> Add to selection</p>
            <p><strong>Alt+Click:</strong> Subtract from selection</p>
          </div>
        </div>
      )}

      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
              Brush Size: {toolSettings.brushSize}px
            </label>
            <input
              type="range"
              min="1"
              max="200"
              value={toolSettings.brushSize}
              onChange={(e) => onSettingsChange({ ...toolSettings, brushSize: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
              Hardness: {toolSettings.hardness}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={toolSettings.hardness}
              onChange={(e) => onSettingsChange({ ...toolSettings, hardness: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Soft</span>
              <span>Hard</span>
            </div>
          </div>
        </div>
      )}

      {activeTool === 'lasso' && (
        <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200">
          <p>Click and drag to draw a freehand selection.</p>
          <p>Release to close and fill the selection.</p>
        </div>
      )}

      {/* Mask Operations */}
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
          Selection Operations
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onInvert}
            className="flex flex-col items-center p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Invert selection"
          >
            <Icon icon="mdi:invert-colors" className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 mt-1">Invert</span>
          </button>
          <button
            onClick={onFeather}
            className="flex flex-col items-center p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Feather edges"
          >
            <Icon icon="mdi:blur" className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 mt-1">Feather</span>
          </button>
          <button
            onClick={onClear}
            className="flex flex-col items-center p-2 bg-white rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors"
            title="Clear selection"
          >
            <Icon icon="mdi:close-circle" className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 mt-1">Clear</span>
          </button>
          <button
            onClick={onGrow}
            className="flex flex-col items-center p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Expand selection"
          >
            <Icon icon="mdi:arrow-expand-all" className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 mt-1">Grow</span>
          </button>
          <button
            onClick={onShrink}
            className="flex flex-col items-center p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Contract selection"
          >
            <Icon icon="mdi:arrow-collapse-all" className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-600 mt-1">Shrink</span>
          </button>
        </div>
      </div>

      {/* Overlay Opacity */}
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
          Overlay Opacity: {Math.round(toolSettings.overlayOpacity * 100)}%
        </label>
        <input
          type="range"
          min="10"
          max="90"
          value={toolSettings.overlayOpacity * 100}
          onChange={(e) => onSettingsChange({ ...toolSettings, overlayOpacity: parseInt(e.target.value) / 100 })}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
};

export default MaskToolbar;
