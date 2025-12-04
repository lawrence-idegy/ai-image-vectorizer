import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import * as fabric from 'fabric';
import { Icon } from '@iconify/react';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import ObjectProperties from './ObjectProperties';
import { normalizeColor, isWhiteColor } from '../../utils/colorUtils';
import { downloadFile, downloadSVGFile } from '../../utils/exportUtils';

const CanvasEditor = forwardRef(({ image, svgContent, onExport, onSelectionChange, className = '' }, ref) => {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [activeObject, setActiveObject] = useState(null);
  const [canvasHistory, setCanvasHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [showProperties, setShowProperties] = useState(false);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(false);
  const [canvasBackground, setCanvasBackground] = useState('#ffffff');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [hasOriginalSvg, setHasOriginalSvg] = useState(false);
  const isLoadingRef = useRef(false);
  const originalSvgRef = useRef(null);
  const initialSvgRef = useRef(null); // Stores the very first SVG loaded (never changes)
  const historyRef = useRef({ history: [], index: -1 });

  // Store original SVG for restore - only store the FIRST time an SVG is loaded
  useEffect(() => {
    if (svgContent && !initialSvgRef.current) {
      initialSvgRef.current = svgContent;
      setHasOriginalSvg(true);
    }
    if (svgContent) {
      originalSvgRef.current = svgContent;
      setHasOriginalSvg(true);
    }
  }, [svgContent]);

  // Save history function using ref to avoid dependency issues
  const saveHistory = useCallback(() => {
    if (!fabricCanvasRef.current || isLoadingRef.current) return;

    const json = JSON.stringify(fabricCanvasRef.current.toJSON());
    const currentIndex = historyRef.current.index;

    // Trim history to current index and add new state
    const newHistory = historyRef.current.history.slice(0, currentIndex + 1);
    newHistory.push(json);

    // Keep only last 50 states
    if (newHistory.length > 50) newHistory.shift();

    historyRef.current.history = newHistory;
    historyRef.current.index = newHistory.length - 1;

    setCanvasHistory([...newHistory]);
    setHistoryIndex(newHistory.length - 1);
  }, []);

  // Undo function
  const undo = useCallback(() => {
    const history = historyRef.current.history;
    const currentIndex = historyRef.current.index;

    // Don't undo if we're at index 0 (initial state) or no canvas
    if (currentIndex <= 0 || !fabricCanvasRef.current || history.length <= 1) {
      return;
    }

    const newIndex = currentIndex - 1;
    isLoadingRef.current = true;

    fabricCanvasRef.current.loadFromJSON(JSON.parse(history[newIndex])).then(() => {
      fabricCanvasRef.current.renderAll();
      historyRef.current.index = newIndex;
      setHistoryIndex(newIndex);
      setCanvasHistory([...history]);
      isLoadingRef.current = false;
    }).catch(err => {
      console.error('Undo error:', err);
      isLoadingRef.current = false;
    });
  }, []);

  // Redo function
  const redo = useCallback(() => {
    const history = historyRef.current.history;
    const currentIndex = historyRef.current.index;

    // Don't redo if we're at the latest state or no canvas
    if (currentIndex >= history.length - 1 || !fabricCanvasRef.current) {
      return;
    }

    const newIndex = currentIndex + 1;
    isLoadingRef.current = true;

    fabricCanvasRef.current.loadFromJSON(JSON.parse(history[newIndex])).then(() => {
      fabricCanvasRef.current.renderAll();
      historyRef.current.index = newIndex;
      setHistoryIndex(newIndex);
      setCanvasHistory([...history]);
      isLoadingRef.current = false;
    }).catch(err => {
      console.error('Redo error:', err);
      isLoadingRef.current = false;
    });
  }, []);

  // Delete selected objects
  const deleteSelected = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;

    activeObjects.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Duplicate selected object
  const duplicateSelected = useCallback(async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;

    try {
      const cloned = await activeObj.clone();
      cloned.set({
        left: activeObj.left + 20,
        top: activeObj.top + 20,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      saveHistory();
    } catch (err) {
      console.error('Error duplicating:', err);
    }
  }, [saveHistory]);

  // Bring to front
  const bringToFront = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const activeObj = canvas?.getActiveObject();
    if (activeObj) {
      canvas.bringObjectToFront(activeObj);
      canvas.renderAll();
      saveHistory();
    }
  }, [saveHistory]);

  // Send to back
  const sendToBack = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const activeObj = canvas?.getActiveObject();
    if (activeObj) {
      canvas.sendObjectToBack(activeObj);
      canvas.renderAll();
      saveHistory();
    }
  }, [saveHistory]);

  // Change canvas background
  const changeBackground = useCallback((color) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.backgroundColor = color === 'transparent' ? null : color;
    setCanvasBackground(color);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Remove background colors from SVG objects (make white/light fills transparent)
  const removeObjectBackgrounds = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    let changesCount = 0;

    const processObject = (obj) => {
      // Recursively process groups
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(processObject);
      }

      // Also check for nested objects in other ways (Fabric.js v6 variations)
      if (obj.getObjects && typeof obj.getObjects === 'function') {
        try {
          const nestedObjects = obj.getObjects();
          if (nestedObjects && nestedObjects.length > 0) {
            nestedObjects.forEach(processObject);
          }
        } catch (e) {
          // Ignore if getObjects fails
        }
      }

      // Check fill - handle string fills
      if (obj.fill && typeof obj.fill === 'string') {
        if (isWhiteColor(obj.fill)) {
          obj.set('fill', 'transparent');
          changesCount++;
        }
      }

      // Also check stroke
      if (obj.stroke && typeof obj.stroke === 'string') {
        if (isWhiteColor(obj.stroke)) {
          obj.set('stroke', 'transparent');
          changesCount++;
        }
      }
    };

    // Count potential changes first without modifying
    let potentialChanges = 0;
    const countChanges = (obj) => {
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(countChanges);
      }
      if (obj.getObjects && typeof obj.getObjects === 'function') {
        try {
          obj.getObjects().forEach(countChanges);
        } catch (e) {}
      }
      if (obj.fill && typeof obj.fill === 'string' && isWhiteColor(obj.fill)) {
        potentialChanges++;
      }
      if (obj.stroke && typeof obj.stroke === 'string' && isWhiteColor(obj.stroke)) {
        potentialChanges++;
      }
    };
    canvas.getObjects().forEach(countChanges);

    // Only proceed if there are changes to make
    if (potentialChanges === 0) {
      return;
    }

    // Now apply the changes
    canvas.getObjects().forEach(processObject);
    canvas.renderAll();

    // Save the new state after changes
    if (changesCount > 0) {
      saveHistory();
    }
  }, [saveHistory]);

  // Remove specific color from all objects
  const removeColorFromObjects = useCallback((colorToRemove) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const targetColor = normalizeColor(colorToRemove);

    const processObject = (obj) => {
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(processObject);
      }

      if (normalizeColor(obj.fill) === targetColor) {
        obj.set('fill', 'transparent');
      }
      if (normalizeColor(obj.stroke) === targetColor) {
        obj.set('stroke', 'transparent');
      }
    };

    canvas.getObjects().forEach(processObject);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Replace a color with another color on all canvas objects
  const replaceColorOnCanvas = useCallback((oldColor, newColor) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const targetColor = normalizeColor(oldColor);
    const replacementColor = newColor;

    const processObject = (obj) => {
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(processObject);
      }

      if (normalizeColor(obj.fill) === targetColor) {
        obj.set('fill', replacementColor);
      }
      if (normalizeColor(obj.stroke) === targetColor) {
        obj.set('stroke', replacementColor);
      }
    };

    canvas.getObjects().forEach(processObject);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Replace multiple colors at once (for palette themes)
  const replaceMultipleColorsOnCanvas = useCallback((colorMap) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !colorMap) return;

    // Normalize all keys in the color map
    const normalizedMap = {};
    Object.keys(colorMap).forEach(key => {
      normalizedMap[normalizeColor(key)] = colorMap[key];
    });

    const processObject = (obj) => {
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(processObject);
      }

      const normalizedFill = normalizeColor(obj.fill);
      const normalizedStroke = normalizeColor(obj.stroke);

      if (normalizedFill && normalizedMap[normalizedFill]) {
        obj.set('fill', normalizedMap[normalizedFill]);
      }
      if (normalizedStroke && normalizedMap[normalizedStroke]) {
        obj.set('stroke', normalizedMap[normalizedStroke]);
      }
    };

    canvas.getObjects().forEach(processObject);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Add text to canvas
  const addTextToCanvas = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const text = new fabric.IText('Double-click to edit', {
      left: canvas.width / 2 - 100,
      top: canvas.height / 2 - 15,
      fontSize: 24,
      fill: '#000000',
      fontFamily: 'Inter, sans-serif',
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Add shape to canvas
  const addShapeToCanvas = useCallback((type) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    let shape;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    switch (type) {
      case 'rectangle':
        shape = new fabric.Rect({
          width: 150,
          height: 100,
          fill: '#0076CE',
          left: centerX - 75,
          top: centerY - 50,
        });
        break;
      case 'circle':
        shape = new fabric.Circle({
          radius: 60,
          fill: '#00B2A9',
          left: centerX - 60,
          top: centerY - 60,
        });
        break;
      case 'triangle':
        shape = new fabric.Triangle({
          width: 120,
          height: 120,
          fill: '#003D5C',
          left: centerX - 60,
          top: centerY - 60,
        });
        break;
      case 'line':
        shape = new fabric.Line([centerX - 75, centerY, centerX + 75, centerY], {
          stroke: '#0076CE',
          strokeWidth: 3,
        });
        break;
      default:
        return;
    }

    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.renderAll();
    saveHistory();
  }, [saveHistory]);

  // Add image to canvas
  const addImageToCanvas = useCallback((file) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      fabric.Image.fromURL(e.target.result).then((img) => {
        const maxWidth = canvas.width * 0.6;
        const maxHeight = canvas.height * 0.6;
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

        img.scale(scale);
        img.set({
          left: (canvas.width - img.getScaledWidth()) / 2,
          top: (canvas.height - img.getScaledHeight()) / 2,
        });

        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        saveHistory();
      });
    };
    reader.readAsDataURL(file);
  }, [saveHistory]);

  // Restore original SVG (uses the initial SVG that was first loaded)
  const restoreOriginalSVG = useCallback(() => {
    // Use initialSvgRef (the very first SVG) if available, otherwise fall back to originalSvgRef
    const svgToRestore = initialSvgRef.current || originalSvgRef.current;
    if (!svgToRestore || !fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    isLoadingRef.current = true;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    setCanvasBackground('#ffffff');

    fabric.loadSVGFromString(svgToRestore).then(({ objects, options }) => {
      if (!objects || objects.length === 0) {
        isLoadingRef.current = false;
        return;
      }

      const svg = fabric.util.groupSVGElements(objects, options);
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const svgWidth = svg.width || svg.getScaledWidth();
      const svgHeight = svg.height || svg.getScaledHeight();

      let scale = 1;
      if (svgWidth && svgHeight) {
        scale = Math.min((canvasWidth * 0.8) / svgWidth, (canvasHeight * 0.8) / svgHeight);
        svg.scale(scale);
      }

      svg.set({
        left: (canvasWidth - svgWidth * scale) / 2,
        top: (canvasHeight - svgHeight * scale) / 2,
      });

      canvas.add(svg);
      canvas.renderAll();
      setIsCanvasEmpty(false);

      setTimeout(() => {
        isLoadingRef.current = false;
        saveHistory();
      }, 100);
    });
  }, [saveHistory]);

  // Expose canvas methods to parent
  useImperativeHandle(ref, () => ({
    toDataURL: (options) => fabricCanvasRef.current?.toDataURL(options),
    toSVG: () => fabricCanvasRef.current?.toSVG(),
    toJSON: () => fabricCanvasRef.current?.toJSON(),
    addText: addTextToCanvas,
    addShape: addShapeToCanvas,
    addImage: addImageToCanvas,
    restoreSVG: restoreOriginalSVG,
    changeBackground,
    removeObjectBackgrounds,
    removeColorFromObjects,
    replaceColorOnCanvas,
    replaceMultipleColorsOnCanvas,
    getCanvas: () => fabricCanvasRef.current,
  }), [addTextToCanvas, addShapeToCanvas, addImageToCanvas, restoreOriginalSVG, changeBackground, removeObjectBackgrounds, removeColorFromObjects, replaceColorOnCanvas, replaceMultipleColorsOnCanvas]);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    // Selection events
    canvas.on('selection:created', (e) => {
      setActiveObject(e.selected[0]);
      if (onSelectionChange) onSelectionChange(e.selected[0]);
    });
    canvas.on('selection:updated', (e) => {
      setActiveObject(e.selected[0]);
      if (onSelectionChange) onSelectionChange(e.selected[0]);
    });
    canvas.on('selection:cleared', () => {
      setActiveObject(null);
      if (onSelectionChange) onSelectionChange(null);
    });

    // History tracking - only on modifications
    canvas.on('object:modified', () => {
      if (!isLoadingRef.current) {
        const json = JSON.stringify(canvas.toJSON());
        const currentIndex = historyRef.current.index;
        const newHistory = historyRef.current.history.slice(0, currentIndex + 1);
        newHistory.push(json);
        if (newHistory.length > 50) newHistory.shift();
        historyRef.current.history = newHistory;
        historyRef.current.index = newHistory.length - 1;
        setCanvasHistory([...newHistory]);
        setHistoryIndex(newHistory.length - 1);
      }
    });

    // Track canvas emptiness
    canvas.on('object:added', () => {
      setIsCanvasEmpty(false);
    });
    canvas.on('object:removed', () => {
      setIsCanvasEmpty(canvas.getObjects().length === 0);
    });

    // Double-click - for text objects, let fabric handle editing; for others, show properties
    canvas.on('mouse:dblclick', (e) => {
      if (e.target) {
        // Don't show properties for IText/Textbox - let fabric handle text editing
        if (e.target.type === 'i-text' || e.target.type === 'textbox' || e.target.type === 'text') {
          return; // Fabric.js will automatically enter text editing mode
        }
        setActiveObject(e.target);
        setShowProperties(true);
      }
    });

    // Click outside to close bg picker
    const handleClickOutside = (e) => {
      if (!e.target.closest('.bg-picker-container')) {
        setShowBgPicker(false);
      }
    };
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('click', handleClickOutside);
      canvas.dispose();
    };
  }, [onSelectionChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (fabricCanvasRef.current?.getActiveObject()) {
          e.preventDefault();
          deleteSelected();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelected, duplicateSelected]);

  // Load SVG onto canvas
  useEffect(() => {
    if (!fabricCanvasRef.current || !svgContent) return;

    const canvas = fabricCanvasRef.current;
    isLoadingRef.current = true;

    // Clear canvas before loading
    canvas.clear();
    canvas.backgroundColor = '#ffffff';

    fabric.loadSVGFromString(svgContent).then(({ objects, options }) => {
      if (!objects || objects.length === 0) {
        console.error('No SVG objects loaded');
        isLoadingRef.current = false;
        return;
      }

      const svg = fabric.util.groupSVGElements(objects, options);

      // Scale to fit canvas
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const svgWidth = svg.width || svg.getScaledWidth();
      const svgHeight = svg.height || svg.getScaledHeight();

      let scale = 1;
      if (svgWidth && svgHeight) {
        scale = Math.min(
          (canvasWidth * 0.8) / svgWidth,
          (canvasHeight * 0.8) / svgHeight
        );
        svg.scale(scale);
      }

      // Center the SVG
      const scaledWidth = svgWidth * scale;
      const scaledHeight = svgHeight * scale;
      svg.set({
        left: (canvasWidth - scaledWidth) / 2,
        top: (canvasHeight - scaledHeight) / 2,
      });

      canvas.add(svg);
      canvas.renderAll();

      // Save initial state after a brief delay
      setTimeout(() => {
        isLoadingRef.current = false;
        const json = JSON.stringify(canvas.toJSON());
        historyRef.current.history = [json];
        historyRef.current.index = 0;
        setCanvasHistory([json]);
        setHistoryIndex(0);
        setIsCanvasEmpty(false);
      }, 100);
    }).catch(err => {
      console.error('Error loading SVG:', err);
      isLoadingRef.current = false;
    });
  }, [svgContent]);

  const handleZoom = (delta) => {
    const newZoom = Math.max(0.1, Math.min(3, zoom + delta));
    setZoom(newZoom);
    fabricCanvasRef.current?.setZoom(newZoom);
    fabricCanvasRef.current?.renderAll();
  };

  const resetZoom = () => {
    setZoom(1);
    fabricCanvasRef.current?.setZoom(1);
    fabricCanvasRef.current?.renderAll();
  };

  const clearCanvas = () => {
    const canvas = fabricCanvasRef.current;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
    setIsCanvasEmpty(true);
    saveHistory();
  };

  const exportCanvas = async (format = 'png') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      alert('No canvas available to export');
      return;
    }

    try {
      switch (format) {
        case 'png': {
          // For PNG, we need to handle transparent backgrounds
          const png = canvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 2 // Higher resolution export
          });
          downloadFile(png, 'canvas-export.png');
          break;
        }
        case 'jpg': {
          // JPG doesn't support transparency, so ensure white background
          const originalBg = canvas.backgroundColor;
          if (!originalBg || originalBg === 'transparent') {
            canvas.backgroundColor = '#ffffff';
            canvas.renderAll();
          }
          const jpg = canvas.toDataURL({
            format: 'jpeg',
            quality: 0.95,
            multiplier: 2
          });
          // Restore original background
          canvas.backgroundColor = originalBg;
          canvas.renderAll();
          downloadFile(jpg, 'canvas-export.jpg');
          break;
        }
        case 'svg':
          downloadSVGFile(canvas.toSVG(), 'canvas-export.svg');
          break;
        case 'pdf':
          await exportAsPDF(canvas);
          break;
        case 'ai':
          await exportAsAI(canvas);
          break;
        case 'eps':
          await exportAsEPS(canvas);
          break;
        case 'json': {
          // Use base64 data URL to avoid Blob interception
          const json = JSON.stringify(canvas.toJSON(), null, 2);
          const base64 = btoa(unescape(encodeURIComponent(json)));
          const dataUrl = `data:application/json;base64,${base64}`;
          downloadFile(dataUrl, 'canvas-data.json');
          break;
        }
      }

      if (onExport) onExport(format, canvas);
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. Please try again.`);
    }
  };

  const exportAsPDF = async (canvas) => {
    const svgString = canvas.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = canvas.width;
    const height = canvas.height;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width, height });
    pdf.save('canvas-export.pdf');
  };

  const exportAsAI = async (canvas) => {
    // Adobe Illustrator .ai format is proprietary PDF-based
    // We create a PDF with AI-compatible metadata that Illustrator opens natively
    const svgString = canvas.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = canvas.width;
    const height = canvas.height;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    // Add AI-compatible metadata
    pdf.setProperties({
      title: 'Canvas Export',
      creator: 'idegy Vectorizer',
      subject: 'Vector Graphics',
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width, height });
    pdf.save('canvas-export.ai');
  };

  const exportAsEPS = async (canvas) => {
    // EPS format is PostScript-based, but modern design apps (Illustrator, CorelDRAW)
    // can open PDF files. We create a PDF that these apps can import and convert to EPS.
    const svgString = canvas.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = canvas.width;
    const height = canvas.height;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    pdf.setProperties({
      title: 'Canvas Export',
      creator: 'idegy Vectorizer',
      subject: 'Vector Graphics - Open in Illustrator and Save As EPS',
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width, height });
    pdf.save('canvas-export.eps');
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < canvasHistory.length - 1;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Compact Toolbar */}
      <div className="bg-white border-b border-gray-200 px-2 py-1.5 flex items-center gap-1">
        {/* History */}
        <div className="flex items-center border-r border-gray-200 pr-1 mr-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Icon icon="mdi:undo" className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <Icon icon="mdi:redo" className="w-4 h-4" />
          </button>
        </div>

        {/* Add Text */}
        <div className="flex items-center border-r border-gray-200 pr-1 mr-1">
          <button onClick={addTextToCanvas} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Add Text">
            <Icon icon="mdi:format-text" className="w-4 h-4" />
          </button>
        </div>

        {/* Object Controls - Only show when object selected */}
        {activeObject && (
          <div className="flex items-center border-r border-gray-200 pr-1 mr-1">
            <button onClick={duplicateSelected} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Duplicate (Ctrl+D)">
              <Icon icon="mdi:content-copy" className="w-4 h-4" />
            </button>
            <button onClick={deleteSelected} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors" title="Delete">
              <Icon icon="mdi:delete-outline" className="w-4 h-4" />
            </button>
            <button onClick={bringToFront} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Bring Forward">
              <Icon icon="mdi:arrange-bring-to-front" className="w-4 h-4" />
            </button>
            <button onClick={sendToBack} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Send Back">
              <Icon icon="mdi:arrange-send-to-back" className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center border-r border-gray-200 pr-1 mr-1">
          <button onClick={() => handleZoom(-0.1)} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Zoom Out">
            <Icon icon="mdi:minus" className="w-4 h-4" />
          </button>
          <button onClick={resetZoom} className="px-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded min-w-[40px] text-center" title="Reset Zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => handleZoom(0.1)} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Zoom In">
            <Icon icon="mdi:plus" className="w-4 h-4" />
          </button>
        </div>

        {/* Background */}
        <div className="bg-picker-container flex items-center border-r border-gray-200 pr-1 mr-1 relative">
          <button
            onClick={() => setShowBgPicker(!showBgPicker)}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center gap-0.5"
            title="Background"
          >
            <div
              className="w-4 h-4 rounded border border-gray-300"
              style={{
                backgroundColor: canvasBackground === 'transparent' ? 'transparent' : canvasBackground,
                backgroundImage: canvasBackground === 'transparent'
                  ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                  : 'none',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px'
              }}
            />
            <Icon icon="mdi:chevron-down" className="w-3 h-3 text-gray-400" />
          </button>

          {showBgPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-20 w-44">
              <p className="text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Canvas</p>
              <div className="grid grid-cols-6 gap-0.5 mb-1.5">
                {['#ffffff', '#f3f4f6', '#e5e7eb', '#000000', '#0076CE', '#00B2A9'].map((color) => (
                  <button
                    key={color}
                    onClick={() => { changeBackground(color); setShowBgPicker(false); }}
                    className={`w-6 h-6 rounded border transition-all ${canvasBackground === color ? 'border-idegy-blue ring-1 ring-idegy-blue' : 'border-gray-200 hover:border-gray-400'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                onClick={() => { changeBackground('transparent'); setShowBgPicker(false); }}
                className={`w-full p-1.5 rounded border text-[10px] font-medium ${canvasBackground === 'transparent' ? 'border-idegy-blue bg-idegy-lightblue' : 'border-gray-200 hover:border-gray-400'}`}
                style={{
                  backgroundImage: 'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
                  backgroundSize: '8px 8px'
                }}
              >
                <span className="bg-white px-1.5 py-0.5 rounded">Transparent</span>
              </button>
              <input
                type="color"
                value={canvasBackground === 'transparent' ? '#ffffff' : canvasBackground}
                onChange={(e) => changeBackground(e.target.value)}
                className="w-full h-6 rounded cursor-pointer mt-1.5"
              />
            </div>
          )}
        </div>

        {/* Remove Background - Always visible */}
        <div className="flex items-center border-r border-gray-200 pr-1 mr-1">
          <button
            onClick={removeObjectBackgrounds}
            className="p-1.5 rounded hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
            title="Remove White Backgrounds from Vector"
          >
            <Icon icon="mdi:image-remove" className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Actions */}
        <div className="flex items-center">
          {hasOriginalSvg && (
            <button onClick={restoreOriginalSVG} className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors" title="Restore Original Vector">
              <Icon icon="mdi:restore" className="w-4 h-4" />
            </button>
          )}
          <button onClick={clearCanvas} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Clear Canvas">
            <Icon icon="mdi:trash-can-outline" className="w-4 h-4" />
          </button>
        </div>

        {/* Export */}
        <div className="ml-auto">
          <div className="relative group">
            <button className="bg-idegy-blue hover:bg-idegy-darkblue text-white text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1 transition-colors">
              <Icon icon="mdi:download" className="w-3.5 h-3.5" />
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {[
                { format: 'svg', icon: 'mdi:svg', label: 'SVG' },
                { format: 'pdf', icon: 'mdi:file-pdf-box', label: 'PDF' },
                { format: 'png', icon: 'mdi:file-png-box', label: 'PNG' },
                { format: 'jpg', icon: 'mdi:file-jpg-box', label: 'JPG' },
                { format: 'ai', icon: 'mdi:adobe', label: 'AI' },
                { format: 'eps', icon: 'mdi:file-document-outline', label: 'EPS' },
              ].map((item) => (
                <button
                  key={item.format}
                  onClick={() => exportCanvas(item.format)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 transition-colors text-xs flex items-center gap-2"
                >
                  <Icon icon={item.icon} className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 bg-gray-100 flex items-center justify-center p-6 overflow-auto relative">
        {isCanvasEmpty && originalSvgRef.current && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 z-10">
            <div className="text-center p-8 bg-white rounded-xl shadow-lg">
              <Icon icon="mdi:image-off" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Canvas is Empty</h3>
              <p className="text-gray-500 mb-4">Your vectorized image was removed.</p>
              <button
                onClick={restoreOriginalSVG}
                className="btn-primary"
              >
                <Icon icon="mdi:restore" className="w-4 h-4 inline mr-2" />
                Restore Vector Image
              </button>
            </div>
          </div>
        )}
        <div
          className="shadow-lg"
          style={{
            width: 'fit-content',
            height: 'fit-content',
            backgroundColor: canvasBackground === 'transparent' ? 'transparent' : '#ffffff',
            backgroundImage: canvasBackground === 'transparent'
              ? 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)'
              : 'none',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
          }}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Object Properties Modal */}
      {showProperties && activeObject && (
        <ObjectProperties
          activeObject={activeObject}
          fabricCanvas={fabricCanvasRef}
          onClose={() => setShowProperties(false)}
        />
      )}
    </div>
  );
});

export default CanvasEditor;
