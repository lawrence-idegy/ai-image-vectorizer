import { useState } from 'react';
import { Icon } from '@iconify/react';
import ColorPalette from '../Tools/ColorPalette';

function RightPanel({
  currentSVG,
  onColorChange,
  onQuickExport,
  optimization,
  canvasEditorRef,
  canvasBackground,
  onBackgroundChange,
}) {
  const [showBgColors, setShowBgColors] = useState(false);
  return (
    <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Color Palette */}
        {currentSVG && (
          <ColorPalette svgContent={currentSVG} onColorChange={onColorChange} />
        )}

        {/* Optimization Stats */}
        {optimization && (
          <div className="panel p-4">
            <h3 className="text-lg font-semibold mb-3">Optimization</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Original</span>
                <span className="font-medium">{optimization.originalSizeKB} KB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Optimized</span>
                <span className="font-medium text-green-600">{optimization.optimizedSizeKB} KB</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-600">Saved</span>
                <span className="font-bold text-green-600">{optimization.savingsPercent}</span>
              </div>
            </div>
          </div>
        )}

        {/* Layers Panel */}
        <div className="panel p-4">
          <h3 className="text-lg font-semibold mb-3">Layers</h3>
          <div className="space-y-2">
            {/* Background Layer - Interactive */}
            <div className="relative">
              <button
                onClick={() => setShowBgColors(!showBgColors)}
                className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{
                      backgroundColor: canvasBackground === 'transparent' ? 'transparent' : (canvasBackground || '#ffffff'),
                      backgroundImage: canvasBackground === 'transparent'
                        ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                        : 'none',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px'
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700">Background</span>
                </div>
                <Icon icon={showBgColors ? "mdi:chevron-up" : "mdi:chevron-down"} className="w-4 h-4 text-gray-400" />
              </button>

              {/* Background Color Options */}
              {showBgColors && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-2">Click to change background</p>
                  <div className="grid grid-cols-6 gap-1 mb-2">
                    {['#ffffff', '#f3f4f6', '#e5e7eb', '#000000', '#0076CE', '#00B2A9'].map((color) => (
                      <button
                        key={color}
                        onClick={() => { onBackgroundChange?.(color); setShowBgColors(false); }}
                        className={`w-8 h-8 rounded border-2 transition-all ${canvasBackground === color ? 'border-idegy-blue scale-105' : 'border-gray-200 hover:border-gray-400'}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => { onBackgroundChange?.('transparent'); setShowBgColors(false); }}
                    className={`w-full p-2 rounded border-2 transition-all text-xs font-medium ${canvasBackground === 'transparent' ? 'border-idegy-blue bg-white' : 'border-gray-200 hover:border-gray-400 bg-white'}`}
                  >
                    Transparent
                  </button>
                </div>
              )}
            </div>

            {/* Vector Layer */}
            {currentSVG && (
              <div className="p-3 bg-idegy-lightblue border-2 border-idegy-blue rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:eye" className="w-4 h-4 text-idegy-blue" />
                  <span className="text-sm font-medium text-gray-700">Vector Layer</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Export Panel */}
        {currentSVG && (
          <div className="panel p-4">
            <h3 className="text-lg font-semibold mb-3">Export</h3>
            <div className="space-y-2">
              {[
                { format: 'SVG', icon: 'mdi:svg', color: 'text-orange-600', desc: 'Scalable Vector' },
                { format: 'PNG', icon: 'mdi:file-png-box', color: 'text-blue-600', desc: 'High Quality' },
                { format: 'PDF', icon: 'mdi:file-pdf-box', color: 'text-red-600', desc: 'Print Ready' },
                { format: 'EPS', icon: 'mdi:file-document-outline', color: 'text-purple-600', desc: 'Adobe Compatible' },
                { format: 'AI', icon: 'mdi:adobe', color: 'text-amber-600', desc: 'Adobe Illustrator' },
              ].map((item) => (
                <button
                  key={item.format}
                  onClick={() => onQuickExport(item.format)}
                  className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <Icon icon={item.icon} className={`w-5 h-5 ${item.color}`} />
                    <div className="text-left">
                      <span className="text-sm font-medium text-gray-700 block">{item.format}</span>
                      <span className="text-xs text-gray-500">{item.desc}</span>
                    </div>
                  </div>
                  <Icon icon="mdi:download" className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default RightPanel;
