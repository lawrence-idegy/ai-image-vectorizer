import { useState, useEffect } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Icon } from '@iconify/react';
import { ColorExtractor } from '../../services/colorExtractor';

const ColorPalette = ({ svgContent, onColorChange }) => {
  const [colors, setColors] = useState([]);
  const [selectedColor, setSelectedColor] = useState(null);
  const [newColor, setNewColor] = useState('#000000');
  const [showPicker, setShowPicker] = useState(false);
  const [paletteTheme, setPaletteTheme] = useState('complementary');

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
        <div className="border-t border-gray-200 pt-6 mt-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Replace Color
              </label>
              <HexColorPicker color={newColor} onChange={setNewColor} className="w-full !h-40" />
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="input-field text-sm font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview
              </label>
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Original</p>
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300"
                    style={{ backgroundColor: selectedColor.hex }}
                  />
                </div>
                <Icon icon="mdi:arrow-right" className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 mb-1">New</p>
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300"
                    style={{ backgroundColor: newColor }}
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleColorReplace}
                  className="btn-primary flex-1 text-sm"
                >
                  <Icon icon="mdi:check" className="w-4 h-4 inline mr-1" />
                  Apply
                </button>
                <button
                  onClick={() => {
                    setShowPicker(false);
                    setSelectedColor(null);
                  }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
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
