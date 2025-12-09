import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Icon } from '@iconify/react';
import { ColorExtractor } from '../../services/colorExtractor';

const ColorPalette = ({ svgContent, onColorChange, canvasEditorRef }) => {
  const [colors, setColors] = useState([]);
  const [selectedColor, setSelectedColor] = useState(null);
  const [newColor, setNewColor] = useState('#000000');
  const [showPicker, setShowPicker] = useState(false);
  const [paletteTheme, setPaletteTheme] = useState('complementary');
  const [hasSelection, setHasSelection] = useState(false);

  // Check for canvas selection changes
  useEffect(() => {
    const checkSelection = () => {
      if (canvasEditorRef?.current?.getSelectedObjects) {
        const selected = canvasEditorRef.current.getSelectedObjects();
        setHasSelection(selected.length > 0);
      }
    };

    // Check initially and set up an interval
    checkSelection();
    const interval = setInterval(checkSelection, 500);
    return () => clearInterval(interval);
  }, [canvasEditorRef]);

  useEffect(() => {
    if (svgContent) {
      const extractedColors = ColorExtractor.extractColors(svgContent);
      setColors(extractedColors);
    }
  }, [svgContent]);

  const handleColorSelect = (color) => {
    setSelectedColor(color);
    setNewColor(color.hex);
    setShowPicker(true);
  };

  const handleColorReplace = () => {
    if (!selectedColor) return;

    const updatedSvg = ColorExtractor.replaceColor(
      svgContent,
      selectedColor.hex,
      newColor
    );

    onColorChange(updatedSvg, selectedColor.hex, newColor);

    // Update local state
    const updatedColors = colors.map((c) =>
      c.hex === selectedColor.hex ? { ...c, hex: newColor } : c
    );
    setColors(updatedColors);
    setSelectedColor(null);
    setShowPicker(false);
  };

  // Remove color from ALL objects (global)
  const handleMakeTransparentGlobal = () => {
    if (!selectedColor) return;

    const updatedSvg = ColorExtractor.replaceColor(
      svgContent,
      selectedColor.hex,
      'none'
    );

    onColorChange(updatedSvg, selectedColor.hex, 'none');

    // Remove from local state
    const updatedColors = colors.filter((c) => c.hex !== selectedColor.hex);
    setColors(updatedColors);
    setSelectedColor(null);
    setShowPicker(false);
  };

  // Remove color from SELECTED objects only
  const handleMakeTransparentSelected = () => {
    if (!selectedColor || !canvasEditorRef?.current?.removeColorFromSelected) return;

    const success = canvasEditorRef.current.removeColorFromSelected(selectedColor.hex);
    if (success) {
      setSelectedColor(null);
      setShowPicker(false);
    } else {
      alert('Please select objects on the canvas first');
    }
  };

  const generateSuggestions = () => {
    if (colors.length === 0) return;

    const suggestions = ColorExtractor.generatePaletteSuggestions(colors, paletteTheme);
    return suggestions;
  };

  const applyPaletteTheme = () => {
    const suggestions = generateSuggestions();
    if (!suggestions || suggestions.length === 0) return;

    const colorMap = {};
    colors.forEach((color, index) => {
      if (suggestions[index]) {
        colorMap[color.hex] = suggestions[index];
      }
    });

    const updatedSvg = ColorExtractor.replaceMultipleColors(svgContent, colorMap);
    onColorChange(updatedSvg, null, null, colorMap);

    // Update local state
    const updatedColors = colors.map((color, index) => ({
      ...color,
      hex: suggestions[index] || color.hex,
    }));
    setColors(updatedColors);
  };

  if (!svgContent || colors.length === 0) {
    return (
      <div className="panel p-6">
        <h3 className="text-lg font-semibold mb-4">Color Palette</h3>
        <div className="text-center py-8 text-gray-500">
          <Icon icon="mdi:palette-outline" className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Vectorize an image to extract colors</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Color Palette</h3>
        <span className="text-sm text-gray-500">{colors.length} colors</span>
      </div>

      {/* Color Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {colors.map((color, index) => (
          <div key={index} className="group">
            <button
              onClick={() => handleColorSelect(color)}
              className="w-full aspect-square rounded-lg border-2 border-gray-200 hover:border-idegy-blue transition-all duration-200 cursor-pointer relative overflow-hidden shadow-sm hover:shadow-md"
              style={{ backgroundColor: color.hex }}
              title={`Click to edit - ${color.percentage}% of image`}
            >
              {selectedColor?.hex === color.hex && (
                <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
                  <Icon icon="mdi:check" className="w-6 h-6 text-white" />
                </div>
              )}
            </button>
            <div className="mt-1.5 text-center">
              <p className="text-xs font-mono text-gray-700">{color.hex}</p>
              <p className="text-xs text-gray-500">{color.percentage}%</p>
            </div>
          </div>
        ))}
      </div>

      {/* Color Editor */}
      {showPicker && selectedColor && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Replace Color
          </label>

          {/* Preview Row */}
          <div className="flex items-center justify-center gap-3 p-3 bg-gray-50 rounded-lg mb-3">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Original</p>
              <div
                className="w-12 h-12 rounded-lg border-2 border-gray-300 mx-auto"
                style={{ backgroundColor: selectedColor.hex }}
              />
              <p className="text-xs font-mono text-gray-600 mt-1">{selectedColor.hex}</p>
            </div>
            <Icon icon="mdi:arrow-right" className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">New</p>
              <div
                className="w-12 h-12 rounded-lg border-2 border-gray-300 mx-auto"
                style={{ backgroundColor: newColor }}
              />
              <p className="text-xs font-mono text-gray-600 mt-1">{newColor}</p>
            </div>
          </div>

          {/* Color Picker */}
          <div className="color-picker-wrapper mb-3">
            <HexColorPicker color={newColor} onChange={setNewColor} style={{ width: '100%', height: '140px' }} />
          </div>

          {/* Hex Input */}
          <input
            type="text"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono mb-3 focus:ring-2 focus:ring-idegy-blue focus:border-transparent"
            placeholder="#000000"
          />

          {/* Action Buttons */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleColorReplace}
                className="btn-primary flex-1 text-sm py-2"
              >
                <Icon icon="mdi:check" className="w-4 h-4 inline mr-1" />
                Apply
              </button>
              <button
                onClick={() => {
                  setShowPicker(false);
                  setSelectedColor(null);
                }}
                className="btn-secondary text-sm py-2 px-4"
              >
                Cancel
              </button>
            </div>

            {/* Remove Color Options */}
            <div className="border-t border-gray-200 pt-2">
              <p className="text-xs text-gray-500 mb-2">Make Transparent:</p>
              <div className="flex gap-2">
                {hasSelection && (
                  <button
                    onClick={handleMakeTransparentSelected}
                    className="flex-1 text-sm py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg border border-orange-200 hover:border-orange-300 transition-colors"
                    title="Remove this color from selected objects only"
                  >
                    <Icon icon="mdi:selection" className="w-4 h-4 inline mr-1" />
                    Selected Only
                  </button>
                )}
                <button
                  onClick={handleMakeTransparentGlobal}
                  className="flex-1 text-sm py-2 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-lg border border-gray-300 hover:border-red-300 transition-colors"
                  title="Remove this color from ALL objects"
                >
                  <Icon icon="mdi:eraser" className="w-4 h-4 inline mr-1" />
                  {hasSelection ? 'All Objects' : 'Remove All'}
                </button>
              </div>
              {!hasSelection && (
                <p className="text-xs text-gray-400 mt-2 italic">
                  <Icon icon="mdi:information-outline" className="w-3 h-3 inline mr-1" />
                  Tip: Select shapes on canvas to remove color from specific areas only
                </p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Color Info */}
      {selectedColor && !showPicker && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Color Details</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-medium">Hex:</span> {selectedColor.hex}
              </p>
              <p>
                <span className="font-medium">Usage:</span> {selectedColor.percentage}%
              </p>
              <p>
                <span className="font-medium">Occurrences:</span> {selectedColor.count}
              </p>
              <p>
                <span className="font-medium">Types:</span> {selectedColor.types.join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPalette;
