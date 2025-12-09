import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { HexColorPicker } from 'react-colorful';

const ObjectProperties = ({ activeObject, fabricCanvas, onClose }) => {
  const [fillColor, setFillColor] = useState('#000000');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [angle, setAngle] = useState(0);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);

  useEffect(() => {
    if (!activeObject) return;

    setFillColor(activeObject.fill || '#000000');
    setStrokeColor(activeObject.stroke || '#000000');
    setStrokeWidth(activeObject.strokeWidth || 0);
    setOpacity(activeObject.opacity || 1);
    setWidth(Math.round(activeObject.width * (activeObject.scaleX || 1)));
    setHeight(Math.round(activeObject.height * (activeObject.scaleY || 1)));
    setAngle(Math.round(activeObject.angle || 0));
  }, [activeObject]);

  const updateProperty = (property, value) => {
    if (!activeObject || !fabricCanvas) return;

    const canvas = fabricCanvas.current || fabricCanvas;

    switch (property) {
      case 'fill':
        activeObject.set('fill', value);
        setFillColor(value);
        break;
      case 'stroke':
        activeObject.set('stroke', value);
        setStrokeColor(value);
        break;
      case 'strokeWidth':
        activeObject.set('strokeWidth', parseFloat(value));
        setStrokeWidth(parseFloat(value));
        break;
      case 'opacity':
        activeObject.set('opacity', parseFloat(value));
        setOpacity(parseFloat(value));
        break;
      case 'width':
        const newScaleX = parseFloat(value) / activeObject.width;
        activeObject.set('scaleX', newScaleX);
        setWidth(parseFloat(value));
        break;
      case 'height':
        const newScaleY = parseFloat(value) / activeObject.height;
        activeObject.set('scaleY', newScaleY);
        setHeight(parseFloat(value));
        break;
      case 'angle':
        activeObject.set('angle', parseFloat(value));
        setAngle(parseFloat(value));
        break;
    }

    canvas.renderAll();
    // Trigger object:modified event to save to history (debounced in CanvasEditor)
    canvas.fire('object:modified', { target: activeObject });
  };

  if (!activeObject) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Object Properties</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <Icon icon="mdi:close" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Object Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <input
              type="text"
              value={activeObject.type}
              readOnly
              className="input-field bg-gray-100 capitalize"
            />
          </div>

          {/* Fill Color */}
          {activeObject.type !== 'line' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fill Color</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFillPicker(!showFillPicker)}
                  className="w-12 h-10 rounded border-2 border-gray-300"
                  style={{ backgroundColor: fillColor }}
                />
                <input
                  type="text"
                  value={fillColor}
                  onChange={(e) => updateProperty('fill', e.target.value)}
                  className="flex-1 input-field"
                  placeholder="#000000"
                />
              </div>
              {showFillPicker && (
                <div className="mt-2">
                  <HexColorPicker
                    color={fillColor}
                    onChange={(color) => updateProperty('fill', color)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Stroke Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Stroke Color</label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowStrokePicker(!showStrokePicker)}
                className="w-12 h-10 rounded border-2 border-gray-300"
                style={{ backgroundColor: strokeColor }}
              />
              <input
                type="text"
                value={strokeColor}
                onChange={(e) => updateProperty('stroke', e.target.value)}
                className="flex-1 input-field"
                placeholder="#000000"
              />
            </div>
            {showStrokePicker && (
              <div className="mt-2">
                <HexColorPicker
                  color={strokeColor}
                  onChange={(color) => updateProperty('stroke', color)}
                />
              </div>
            )}
          </div>

          {/* Stroke Width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stroke Width: {strokeWidth}px
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={strokeWidth}
              onChange={(e) => updateProperty('strokeWidth', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Opacity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Opacity: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(e) => updateProperty('opacity', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Dimensions */}
          {activeObject.type !== 'line' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => updateProperty('width', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => updateProperty('height', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          )}

          {/* Rotation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rotation: {angle}°
            </label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={angle}
              onChange={(e) => updateProperty('angle', e.target.value)}
              className="w-full"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t border-gray-200">
            <button onClick={onClose} className="btn-primary flex-1">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObjectProperties;
