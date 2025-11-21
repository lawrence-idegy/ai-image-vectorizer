import { useState } from 'react';
import { Icon } from '@iconify/react';
import * as fabric from 'fabric';

const AdvancedTools = ({ fabricCanvas, activeObject }) => {
  const [activeTab, setActiveTab] = useState('filters');
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState('#000000');
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  // Filter presets
  const filters = [
    { name: 'Grayscale', icon: 'mdi:invert-colors', apply: () => applyFilter('grayscale') },
    { name: 'Sepia', icon: 'mdi:image-filter-vintage', apply: () => applyFilter('sepia') },
    { name: 'Blur', icon: 'mdi:blur', apply: () => applyFilter('blur') },
    { name: 'Sharpen', icon: 'mdi:image-filter-center-focus', apply: () => applyFilter('sharpen') },
    { name: 'Brightness+', icon: 'mdi:brightness-6', apply: () => applyBrightness(0.2) },
    { name: 'Brightness-', icon: 'mdi:brightness-4', apply: () => applyBrightness(-0.2) },
    { name: 'Contrast+', icon: 'mdi:contrast-circle', apply: () => applyContrast(0.2) },
    { name: 'Invert', icon: 'mdi:invert-colors', apply: () => applyFilter('invert') },
  ];

  const applyFilter = (filterType) => {
    if (!fabricCanvas) {
      alert('Canvas not available');
      return;
    }

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj) {
      alert('Please select an object to apply filters');
      return;
    }

    // Filters only work on Image objects, not groups or shapes
    if (obj.type !== 'image') {
      alert('Filters can only be applied to raster image objects. For vector graphics, use the color palette or effects instead.');
      return;
    }

    // Remove existing filters of the same type
    obj.filters = obj.filters || [];

    switch (filterType) {
      case 'grayscale':
        obj.filters.push(new fabric.Image.filters.Grayscale());
        break;
      case 'sepia':
        obj.filters.push(new fabric.Image.filters.Sepia());
        break;
      case 'blur':
        obj.filters.push(new fabric.Image.filters.Blur({ blur: 0.2 }));
        break;
      case 'sharpen':
        obj.filters.push(new fabric.Image.filters.Convolute({
          matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
        }));
        break;
      case 'invert':
        obj.filters.push(new fabric.Image.filters.Invert());
        break;
    }

    obj.applyFilters();
    canvas.renderAll();
  };

  const applyBrightness = (value) => {
    if (!fabricCanvas) {
      alert('Canvas not available');
      return;
    }

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj || obj.type !== 'image') {
      alert('Please select an image object');
      return;
    }

    obj.filters = obj.filters || [];
    obj.filters.push(new fabric.Image.filters.Brightness({ brightness: value }));
    obj.applyFilters();
    canvas.renderAll();
  };

  const applyContrast = (value) => {
    if (!fabricCanvas) {
      alert('Canvas not available');
      return;
    }

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj || obj.type !== 'image') {
      alert('Please select an image object');
      return;
    }

    obj.filters = obj.filters || [];
    obj.filters.push(new fabric.Image.filters.Contrast({ contrast: value }));
    obj.applyFilters();
    canvas.renderAll();
  };

  const clearFilters = () => {
    if (!fabricCanvas) return;

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj) return;

    if (obj.filters) {
      obj.filters = [];
      obj.applyFilters();
      canvas.renderAll();
    }
  };

  const enableDrawingMode = () => {
    if (!fabricCanvas) {
      alert('Canvas not available');
      return;
    }

    const canvas = fabricCanvas.current || fabricCanvas;
    const newDrawingMode = !isDrawingMode;

    canvas.isDrawingMode = newDrawingMode;
    setIsDrawingMode(newDrawingMode);

    if (newDrawingMode) {
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = brushSize;
      canvas.freeDrawingBrush.color = brushColor;
    }
  };

  const updateBrushSize = (size) => {
    setBrushSize(size);
    if (fabricCanvas) {
      const canvas = fabricCanvas.current || fabricCanvas;
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = size;
      }
    }
  };

  const updateBrushColor = (color) => {
    setBrushColor(color);
    if (fabricCanvas) {
      const canvas = fabricCanvas.current || fabricCanvas;
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = color;
      }
    }
  };

  const applyEffect = (effect) => {
    if (!fabricCanvas) return;

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj) {
      alert('Please select an object first');
      return;
    }

    switch (effect) {
      case 'shadow':
        obj.set({
          shadow: {
            color: 'rgba(0,0,0,0.3)',
            blur: 10,
            offsetX: 5,
            offsetY: 5,
          },
        });
        break;
      case 'glow':
        obj.set({
          shadow: {
            color: '#0076CE',
            blur: 20,
            offsetX: 0,
            offsetY: 0,
          },
        });
        break;
      case 'opacity':
        obj.set({ opacity: obj.opacity === 1 ? 0.5 : 1 });
        break;
      case 'rounded':
        if (obj.type === 'rect') {
          obj.set({ rx: 20, ry: 20 });
        }
        break;
    }

    canvas.renderAll();
  };

  const addGradient = () => {
    if (!fabricCanvas) return;

    const canvas = fabricCanvas.current || fabricCanvas;
    const obj = activeObject || canvas.getActiveObject();

    if (!obj) {
      alert('Please select an object first');
      return;
    }

    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: obj.width, y2: obj.height },
      colorStops: [
        { offset: 0, color: '#0076CE' },
        { offset: 1, color: '#00B2A9' },
      ],
    });

    obj.set('fill', gradient);
    canvas.renderAll();
  };

  return (
    <div className="panel p-4">
      <h3 className="text-lg font-semibold mb-4">Advanced Tools</h3>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {['filters', 'effects', 'draw'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize transition-all relative ${
              activeTab === tab ? 'text-idegy-blue' : 'text-gray-600'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-idegy-blue" />
            )}
          </button>
        ))}
      </div>

      {/* Filters Tab */}
      {activeTab === 'filters' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {filters.map((filter) => (
              <button
                key={filter.name}
                onClick={filter.apply}
                className="p-3 bg-gray-50 hover:bg-idegy-lightblue rounded-lg transition-all text-left flex items-center gap-2 overflow-hidden"
              >
                <Icon icon={filter.icon} className="w-5 h-5 flex-shrink-0 text-gray-600" />
                <span className="text-sm font-medium text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">{filter.name}</span>
              </button>
            ))}
          </div>

          <button
            onClick={clearFilters}
            className="btn-secondary w-full text-sm overflow-hidden"
          >
            <Icon icon="mdi:close-circle" className="w-4 h-4 inline mr-1 flex-shrink-0" />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">Clear All Filters</span>
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <Icon icon="mdi:information" className="w-4 h-4 inline mr-1" />
            Select an image object to apply filters
          </div>
        </div>
      )}

      {/* Effects Tab */}
      {activeTab === 'effects' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyEffect('shadow')}
              className="p-3 bg-gray-50 hover:bg-idegy-lightblue rounded-lg transition-all overflow-hidden"
            >
              <Icon icon="mdi:box-shadow" className="w-6 h-6 mx-auto mb-1 text-gray-600" />
              <p className="text-xs font-medium text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">Drop Shadow</p>
            </button>

            <button
              onClick={() => applyEffect('glow')}
              className="p-3 bg-gray-50 hover:bg-idegy-lightblue rounded-lg transition-all overflow-hidden"
            >
              <Icon icon="mdi:lightbulb-on" className="w-6 h-6 mx-auto mb-1 text-gray-600" />
              <p className="text-xs font-medium text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">Glow</p>
            </button>

            <button
              onClick={() => applyEffect('opacity')}
              className="p-3 bg-gray-50 hover:bg-idegy-lightblue rounded-lg transition-all overflow-hidden"
            >
              <Icon icon="mdi:opacity" className="w-6 h-6 mx-auto mb-1 text-gray-600" />
              <p className="text-xs font-medium text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">Transparency</p>
            </button>

            <button
              onClick={() => applyEffect('rounded')}
              className="p-3 bg-gray-50 hover:bg-idegy-lightblue rounded-lg transition-all overflow-hidden"
            >
              <Icon icon="mdi:rounded-corner" className="w-6 h-6 mx-auto mb-1 text-gray-600" />
              <p className="text-xs font-medium text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">Round Corners</p>
            </button>
          </div>

          <button
            onClick={addGradient}
            className="btn-primary w-full text-sm overflow-hidden"
          >
            <Icon icon="mdi:gradient-horizontal" className="w-4 h-4 inline mr-1 flex-shrink-0" />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">Apply Gradient</span>
          </button>
        </div>
      )}

      {/* Draw Tab */}
      {activeTab === 'draw' && (
        <div className="space-y-4">
          <button
            onClick={enableDrawingMode}
            className={`w-full py-3 rounded-lg font-medium transition-all ${
              isDrawingMode
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-idegy-blue hover:bg-idegy-darkblue text-white'
            }`}
          >
            <Icon
              icon={isDrawingMode ? 'mdi:close' : 'mdi:pencil'}
              className="w-5 h-5 inline mr-2"
            />
            {isDrawingMode ? 'Stop Drawing' : 'Start Drawing'}
          </button>

          {isDrawingMode && (
            <>
              {/* Brush Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Brush Size: {brushSize}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={brushSize}
                  onChange={(e) => updateBrushSize(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Brush Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Brush Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => updateBrushColor(e.target.value)}
                    className="w-16 h-10 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={brushColor}
                    onChange={(e) => updateBrushColor(e.target.value)}
                    className="flex-1 input-field text-sm"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {/* Quick Colors */}
              <div className="grid grid-cols-6 gap-2">
                {['#000000', '#ffffff', '#0076CE', '#00B2A9', '#FF6B6B', '#FFD93D'].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateBrushColor(color)}
                    className={`w-full aspect-square rounded-lg border-2 transition-all ${
                      brushColor === color ? 'border-gray-900 scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <Icon icon="mdi:information" className="w-4 h-4 inline mr-1" />
            Draw directly on the canvas when drawing mode is active
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedTools;
