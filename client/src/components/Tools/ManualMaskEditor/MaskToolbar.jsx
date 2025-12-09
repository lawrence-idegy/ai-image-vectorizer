import { Icon } from '@iconify/react';

const MaskToolbar = ({
  activeTool,
  onToolChange,
  toolSettings,
  onSettingsChange,
  onClear,
  onInvert
}) => {
  const tools = [
    { id: 'magicWand', icon: 'mdi:magic-staff', label: 'Wand' },
    { id: 'brush', icon: 'mdi:brush', label: 'Brush' },
    { id: 'eraser', icon: 'mdi:eraser', label: 'Eraser' },
    { id: 'lasso', icon: 'mdi:lasso', label: 'Lasso' }
  ];

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-3 h-full overflow-y-auto">
      {/* Tools */}
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase mb-2">Tools</div>
        <div className="grid grid-cols-4 gap-1">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`flex flex-col items-center py-2 px-1 rounded transition-all ${
                activeTool === tool.id
                  ? 'bg-idegy-blue text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              title={tool.label}
            >
              <Icon icon={tool.icon} className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tool Settings */}
      {activeTool === 'magicWand' && (
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Tolerance</span>
              <span>{toolSettings.tolerance}</span>
            </div>
            <input
              type="range"
              min="0"
              max="255"
              value={toolSettings.tolerance}
              onChange={(e) => onSettingsChange({ ...toolSettings, tolerance: parseInt(e.target.value) })}
              className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-idegy-blue"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={toolSettings.contiguous !== false}
              onChange={(e) => onSettingsChange({ ...toolSettings, contiguous: e.target.checked })}
              className="w-3.5 h-3.5 text-idegy-blue rounded"
            />
            Contiguous
          </label>
          <div className="text-[10px] text-gray-400 bg-white rounded p-1.5 border border-gray-100">
            Shift+Click: Add | Alt+Click: Remove
          </div>
        </div>
      )}

      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Size</span>
              <span>{toolSettings.brushSize}px</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={toolSettings.brushSize}
              onChange={(e) => onSettingsChange({ ...toolSettings, brushSize: parseInt(e.target.value) })}
              className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-idegy-blue"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Hardness</span>
              <span>{toolSettings.hardness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={toolSettings.hardness}
              onChange={(e) => onSettingsChange({ ...toolSettings, hardness: parseInt(e.target.value) })}
              className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-idegy-blue"
            />
          </div>
        </div>
      )}

      {activeTool === 'lasso' && (
        <div className="text-[10px] text-gray-400 bg-white rounded p-1.5 border border-gray-100">
          Click and drag to draw selection. Release to close.
        </div>
      )}

      {/* Actions */}
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase mb-2">Selection</div>
        <div className="flex gap-1">
          <button
            onClick={onInvert}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white text-gray-600 text-xs rounded border border-gray-200 hover:bg-gray-50"
          >
            <Icon icon="mdi:invert-colors" className="w-3.5 h-3.5" />
            Invert
          </button>
          <button
            onClick={onClear}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white text-gray-600 text-xs rounded border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >
            <Icon icon="mdi:close" className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Overlay */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Overlay</span>
          <span>{Math.round(toolSettings.overlayOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="10"
          max="90"
          value={toolSettings.overlayOpacity * 100}
          onChange={(e) => onSettingsChange({ ...toolSettings, overlayOpacity: parseInt(e.target.value) / 100 })}
          className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-idegy-blue"
        />
      </div>
    </div>
  );
};

export default MaskToolbar;
