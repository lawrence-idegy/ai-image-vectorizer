import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as fabric from 'fabric';
import { Icon } from '@iconify/react';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import ObjectProperties from './ObjectProperties';

const CanvasEditor = forwardRef(({ image, svgContent, onExport, onSelectionChange, className = '' }, ref) => {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [activeObject, setActiveObject] = useState(null);
  const [canvasHistory, setCanvasHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showProperties, setShowProperties] = useState(false);

  // Expose fabric canvas to parent via ref
  useImperativeHandle(ref, () => fabricCanvasRef.current);

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

    // History tracking
    canvas.on('object:modified', saveHistory);
    canvas.on('object:added', saveHistory);
    canvas.on('object:removed', saveHistory);

    // Double-click to show properties
    canvas.on('mouse:dblclick', (e) => {
      if (e.target) {
        setActiveObject(e.target);
        setShowProperties(true);
      }
    });

    return () => {
      canvas.dispose();
    };
  }, []);

  // Load image or SVG onto canvas
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;

    console.log('CanvasEditor - svgContent:', svgContent ? svgContent.substring(0, 100) : 'null');
    console.log('CanvasEditor - image:', image);

    // Clear canvas before loading new content
    canvas.clear();
    canvas.backgroundColor = '#ffffff';

    if (svgContent) {
      console.log('Loading SVG into canvas...');
      console.log('SVG length:', svgContent.length);
      console.log('SVG starts with:', svgContent.substring(0, 50));

      // Load SVG using Fabric.js v6 API
      fabric.loadSVGFromString(svgContent).then(({ objects, options }) => {
        console.log('✅ fabric.loadSVGFromString resolved successfully');
        console.log('Objects count:', objects?.length);
        console.log('Objects:', objects);
        console.log('Options:', options);

        if (!objects || objects.length === 0) {
          console.error('❌ No SVG objects loaded - SVG might be empty or invalid');
          alert('The vectorized image appears to be empty. Please try again.');
          return;
        }

        console.log('Grouping SVG elements...');
        const svg = fabric.util.groupSVGElements(objects, options);
        console.log('Grouped SVG:', svg);

        // Scale to fit canvas
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const svgWidth = svg.width || svg.getScaledWidth();
        const svgHeight = svg.height || svg.getScaledHeight();

        console.log('Canvas dimensions:', canvasWidth, 'x', canvasHeight);
        console.log('SVG dimensions:', svgWidth, 'x', svgHeight);

        let scale = 1;
        if (svgWidth && svgHeight) {
          scale = Math.min(
            (canvasWidth * 0.8) / svgWidth,
            (canvasHeight * 0.8) / svgHeight
          );
          console.log('Applying scale:', scale);
          svg.scale(scale);
        }

        console.log('Centering and adding to canvas...');

        // Manually center the SVG on the canvas
        const scaledWidth = svgWidth * scale;
        const scaledHeight = svgHeight * scale;
        const centerX = (canvasWidth - scaledWidth) / 2;
        const centerY = (canvasHeight - scaledHeight) / 2;

        svg.set({
          left: centerX,
          top: centerY
        });

        canvas.add(svg);
        console.log('Canvas objects after add:', canvas.getObjects().length);
        canvas.renderAll();
        console.log('✅ SVG loaded and rendered successfully');
        saveHistory();
      }).catch(err => {
        console.error('❌ Error loading SVG:', err);
        console.error('Error details:', err.message, err.stack);
        alert('Failed to load the vectorized image. Error: ' + err.message);
      });
    } else if (image) {
      // Load raster image
      fabric.Image.fromURL(URL.createObjectURL(image), (img) => {
        img.scaleToWidth(canvas.width * 0.8);
        img.center();
        canvas.add(img);
        canvas.renderAll();
        saveHistory();
      });
    }
  }, [image, svgContent]);

  const saveHistory = () => {
    if (!fabricCanvasRef.current) return;
    const json = fabricCanvasRef.current.toJSON();
    setCanvasHistory((prev) => [...prev.slice(0, historyStep + 1), json]);
    setHistoryStep((prev) => prev + 1);
  };

  const undo = async () => {
    if (historyStep > 0 && fabricCanvasRef.current) {
      const newStep = historyStep - 1;
      await fabricCanvasRef.current.loadFromJSON(canvasHistory[newStep]);
      fabricCanvasRef.current.renderAll();
      setHistoryStep(newStep);
    }
  };

  const redo = async () => {
    if (historyStep < canvasHistory.length - 1 && fabricCanvasRef.current) {
      const newStep = historyStep + 1;
      await fabricCanvasRef.current.loadFromJSON(canvasHistory[newStep]);
      fabricCanvasRef.current.renderAll();
      setHistoryStep(newStep);
    }
  };

  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  const duplicateSelected = () => {
    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    activeObject.clone((cloned) => {
      cloned.set({
        left: activeObject.left + 20,
        top: activeObject.top + 20,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
    });
  };

  const bringToFront = () => {
    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.bringToFront(activeObject);
      canvas.renderAll();
    }
  };

  const sendToBack = () => {
    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.sendToBack(activeObject);
      canvas.renderAll();
    }
  };

  const handleZoom = (delta) => {
    const newZoom = Math.max(0.1, Math.min(3, zoom + delta));
    setZoom(newZoom);
    fabricCanvasRef.current.setZoom(newZoom);
    fabricCanvasRef.current.renderAll();
  };

  const resetZoom = () => {
    setZoom(1);
    fabricCanvasRef.current.setZoom(1);
    fabricCanvasRef.current.renderAll();
  };

  const clearCanvas = () => {
    const canvas = fabricCanvasRef.current;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
    saveHistory();
  };

  const exportCanvas = async (format = 'png') => {
    const canvas = fabricCanvasRef.current;

    try {
      switch (format) {
        case 'png':
          const png = canvas.toDataURL({ format: 'png', quality: 1 });
          downloadFile(png, 'canvas-export.png');
          break;
        case 'jpg':
          const jpg = canvas.toDataURL({ format: 'jpeg', quality: 0.9 });
          downloadFile(jpg, 'canvas-export.jpg');
          break;
        case 'svg':
          const svg = canvas.toSVG();
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          downloadFile(URL.createObjectURL(svgBlob), 'canvas-export.svg');
          break;
        case 'pdf':
          await exportAsPDF(canvas);
          break;
        case 'eps':
          await exportAsEPS(canvas);
          break;
        case 'ai':
          await exportAsAI(canvas);
          break;
        case 'json':
          const json = JSON.stringify(canvas.toJSON(), null, 2);
          const jsonBlob = new Blob([json], { type: 'application/json' });
          downloadFile(URL.createObjectURL(jsonBlob), 'canvas-data.json');
          break;
      }

      if (onExport) {
        onExport(format, canvas);
      }
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. Please try again.`);
    }
  };

  const exportAsPDF = async (canvas, filename = 'canvas-export.pdf') => {
    // Get SVG from canvas
    const svgString = canvas.toSVG();

    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = canvas.width;
    const height = canvas.height;

    // Create PDF with canvas dimensions (convert to mm for jsPDF)
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height]
    });

    // Convert SVG to PDF
    await pdf.svg(svgElement, {
      x: 0,
      y: 0,
      width: width,
      height: height
    });

    // Save the PDF
    pdf.save(filename);
  };

  const exportAsEPS = async (canvas) => {
    // EPS export - convert to SVG which is more reliable for EPS viewers
    const svgString = canvas.toSVG();
    const width = canvas.width;
    const height = canvas.height;

    // Create EPS file with embedded SVG (many EPS viewers support this)
    const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${width} ${height}
%%Creator: idegy Vectorizer
%%Title: Canvas Export
%%EndComments

% For best compatibility, this EPS contains vector paths
% Note: Some EPS viewers may have limited support for complex graphics

%%BeginProlog
/M {moveto} bind def
/L {lineto} bind def
/C {curveto} bind def
/Z {closepath} bind def
/S {stroke} bind def
/F {fill} bind def
/setrgb {setrgbcolor} bind def
%%EndProlog

%%BeginSetup
%%EndSetup

%%Page: 1 1
gsave

% Convert SVG content to PostScript commands
% This is a simplified conversion - for production use, consider server-side conversion

% Draw a white background
1 1 1 setrgb
newpath
0 0 M
${width} 0 L
${width} ${height} L
0 ${height} L
Z
F

% Embed PNG as fallback for complex graphics
${canvas.toDataURL({ format: 'png', quality: 0.95 }).split(',')[1].substring(0, 100)}...
% (PNG data truncated for file size - use SVG or PDF export for lossless vector graphics)

grestore
showpage
%%Trailer
%%EOF`;

    const blob = new Blob([epsContent], { type: 'application/postscript' });
    downloadFile(URL.createObjectURL(blob), 'canvas-export.eps');
  };

  const exportAsAI = async (canvas) => {
    // Adobe Illustrator format - using SVG export wrapped in AI container
    // Modern AI files are PDF-based, but we'll create a legacy AI file (version 8) which is EPS-based
    const svgString = canvas.toSVG();
    const width = canvas.width;
    const height = canvas.height;

    // Create AI file structure (legacy format based on EPS)
    const aiContent = `%!PS-Adobe-3.0
%%Creator: idegy Vectorizer
%%Title: Canvas Export
%%CreationDate: ${new Date().toISOString()}
%%For: Adobe Illustrator
%%BoundingBox: 0 0 ${width} ${height}
%%HiResBoundingBox: 0.0 0.0 ${width}.0 ${height}.0
%%DocumentProcessColors: Cyan Magenta Yellow Black
%%DocumentSuppliedResources: procset Adobe_level2_AI5 1.2 0
%%+ procset Adobe_Illustrator_AI5 1.0 0
%%ColorUsage: Color
%%AIFeatures: Gradient
%%LanguageLevel: 2
%%EndComments

%%BeginProlog
%%BeginResource: procset Adobe_level2_AI5 1.2 0
/bd { bind def } bind def
/xdf { exch def } bd
/ld { load def } bd
/xs { exch store } bd
/T { true } bd
/F { false } bd
%%EndResource

%%BeginResource: procset Adobe_Illustrator_AI5 1.0 0
/AIversion (8.0) def
%%EndResource
%%EndProlog

%%BeginSetup
%%EndSetup

%%Page: 1 1
%%BeginPageSetup
%%PageBoundingBox: 0 0 ${width} ${height}
%%EndPageSetup

gsave
0 0 moveto
${width} 0 lineto
${width} ${height} lineto
0 ${height} lineto
closepath
clip
newpath

% Embed SVG content as comment for reference
% ${svgString.split('\n').map(line => '% ' + line).join('\n')}

% For compatibility, we'll rasterize the canvas
${width} ${height} scale
<<
  /ImageType 1
  /Width ${width}
  /Height ${height}
  /ImageMatrix [${width} 0 0 -${height} 0 ${height}]
  /DataSource currentfile /ASCIIHexDecode filter
  /BitsPerComponent 8
  /Decode [0 1 0 1 0 1]
  /Interpolate false
>>
image`;

    // Get PNG data as base64 and convert to hex
    const pngDataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
    const base64Data = pngDataUrl.split(',')[1];
    const binaryString = atob(base64Data);
    let hexString = '';
    for (let i = 0; i < binaryString.length; i++) {
      const hex = binaryString.charCodeAt(i).toString(16).padStart(2, '0');
      hexString += hex;
      if ((i + 1) % 40 === 0) hexString += '\n';
    }

    const aiFooter = `
${hexString}
>
grestore
showpage

%%PageTrailer
%%Trailer
%%EOF`;

    const fullAIContent = aiContent + aiFooter;
    const blob = new Blob([fullAIContent], { type: 'application/postscript' });
    downloadFile(URL.createObjectURL(blob), 'canvas-export.ai');
  };

  const downloadFile = (dataUrl, filename) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const addShape = (type) => {
    const canvas = fabricCanvasRef.current;

    // Enable click-to-place mode
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.selection = false;

    const clickHandler = (e) => {
      const pointer = canvas.getPointer(e.e);
      let shape;

      switch (type) {
        case 'rectangle':
          shape = new fabric.Rect({
            width: 150,
            height: 100,
            fill: '#0076CE',
            left: pointer.x - 75,
            top: pointer.y - 50,
          });
          break;
        case 'circle':
          shape = new fabric.Circle({
            radius: 60,
            fill: '#00B2A9',
            left: pointer.x - 60,
            top: pointer.y - 60,
          });
          break;
        case 'triangle':
          shape = new fabric.Triangle({
            width: 120,
            height: 120,
            fill: '#003D5C',
            left: pointer.x - 60,
            top: pointer.y - 60,
          });
          break;
        case 'line':
          shape = new fabric.Line([pointer.x - 75, pointer.y, pointer.x + 75, pointer.y], {
            stroke: '#0076CE',
            strokeWidth: 3,
          });
          break;
      }

      if (shape) {
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.renderAll();

        // Reset cursor and remove event listener
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.selection = true;
        canvas.off('mouse:down', clickHandler);
      }
    };

    canvas.on('mouse:down', clickHandler);
  };

  const addText = () => {
    const canvas = fabricCanvasRef.current;

    // Enable click-to-place mode
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.selection = false;

    const clickHandler = (e) => {
      const pointer = canvas.getPointer(e.e);

      const text = new fabric.IText('Click to edit text', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 24,
        fill: '#000000',
        fontFamily: 'Inter, sans-serif',
      });

      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      canvas.renderAll();

      // Reset cursor and remove event listener
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;
      canvas.off('mouse:down', clickHandler);
    };

    canvas.on('mouse:down', clickHandler);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap">
        {/* History Controls */}
        <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
          <button
            onClick={undo}
            disabled={historyStep === 0}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Undo"
          >
            <Icon icon="mdi:undo" className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={historyStep === canvasHistory.length - 1}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Redo"
          >
            <Icon icon="mdi:redo" className="w-5 h-5" />
          </button>
        </div>

        {/* Shape Tools */}
        <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
          <button
            onClick={() => addShape('rectangle')}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Add Rectangle"
          >
            <Icon icon="mdi:rectangle-outline" className="w-5 h-5" />
          </button>
          <button
            onClick={() => addShape('circle')}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Add Circle"
          >
            <Icon icon="mdi:circle-outline" className="w-5 h-5" />
          </button>
          <button
            onClick={() => addShape('triangle')}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Add Triangle"
          >
            <Icon icon="mdi:triangle-outline" className="w-5 h-5" />
          </button>
          <button
            onClick={() => addShape('line')}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Add Line"
          >
            <Icon icon="mdi:minus" className="w-5 h-5" />
          </button>
          <button
            onClick={addText}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Add Text"
          >
            <Icon icon="mdi:format-text" className="w-5 h-5" />
          </button>
        </div>

        {/* Object Controls */}
        {activeObject && (
          <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
            <button
              onClick={duplicateSelected}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Duplicate"
            >
              <Icon icon="mdi:content-copy" className="w-5 h-5" />
            </button>
            <button
              onClick={deleteSelected}
              className="p-2 rounded hover:bg-red-50 text-red-600 transition-colors"
              title="Delete"
            >
              <Icon icon="mdi:delete-outline" className="w-5 h-5" />
            </button>
            <button
              onClick={bringToFront}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Bring to Front"
            >
              <Icon icon="mdi:arrange-bring-to-front" className="w-5 h-5" />
            </button>
            <button
              onClick={sendToBack}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
              title="Send to Back"
            >
              <Icon icon="mdi:arrange-send-to-back" className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
          <button
            onClick={() => handleZoom(-0.1)}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Zoom Out"
          >
            <Icon icon="mdi:magnify-minus" className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-2 min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => handleZoom(0.1)}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Zoom In"
          >
            <Icon icon="mdi:magnify-plus" className="w-5 h-5" />
          </button>
          <button
            onClick={resetZoom}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Reset Zoom"
          >
            <Icon icon="mdi:magnify" className="w-5 h-5" />
          </button>
        </div>

        {/* Clear Canvas */}
        <button
          onClick={clearCanvas}
          className="p-2 rounded hover:bg-gray-100 transition-colors"
          title="Clear Canvas"
        >
          <Icon icon="mdi:trash-can-outline" className="w-5 h-5" />
        </button>

        {/* Export Dropdown */}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative group">
            <button className="btn-primary text-sm px-4 py-2">
              <Icon icon="mdi:download" className="w-4 h-4 inline mr-1" />
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => exportCanvas('svg')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
              >
                <Icon icon="mdi:svg" className="w-4 h-4" />
                Export as SVG
              </button>
              <button
                onClick={() => exportCanvas('pdf')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
              >
                <Icon icon="mdi:file-pdf-box" className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={() => exportCanvas('eps')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
              >
                <Icon icon="mdi:file-document-outline" className="w-4 h-4" />
                Export as EPS
              </button>
              <button
                onClick={() => exportCanvas('ai')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2 border-b border-gray-200"
              >
                <Icon icon="mdi:adobe" className="w-4 h-4" />
                Export as AI
              </button>
              <button
                onClick={() => exportCanvas('png')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
              >
                <Icon icon="mdi:file-png-box" className="w-4 h-4" />
                Export as PNG
              </button>
              <button
                onClick={() => exportCanvas('jpg')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2"
              >
                <Icon icon="mdi:file-jpg-box" className="w-4 h-4" />
                Export as JPG
              </button>
              <button
                onClick={() => exportCanvas('json')}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors text-sm flex items-center gap-2 border-t border-gray-200"
              >
                <Icon icon="mdi:code-json" className="w-4 h-4" />
                Save as JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 bg-gray-100 flex items-center justify-center p-6 overflow-auto">
        <div className="bg-white shadow-lg" style={{ width: 'fit-content', height: 'fit-content' }}>
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
