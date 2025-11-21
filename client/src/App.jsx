import { useState, useRef } from 'react';
import { Icon } from '@iconify/react';
import CanvasEditor from './components/Canvas/CanvasEditor';
import AdvancedTools from './components/Canvas/AdvancedTools';
import ColorPalette from './components/Tools/ColorPalette';
import IconLibrary from './components/Tools/IconLibrary';
import BackgroundRemovalTool from './components/Tools/BackgroundRemovalTool';
import UploadZone from './components/Vectorizer/UploadZone';
import { vectorizeImage, removeBackground as removeBackgroundAPI } from './services/api';
import * as fabric from 'fabric';

function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'editor'
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [currentSVG, setCurrentSVG] = useState(null);
  const [qualityMetrics, setQualityMetrics] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [showBackgroundRemoval, setShowBackgroundRemoval] = useState(false);
  const [activeCanvasObject, setActiveCanvasObject] = useState(null);
  const canvasEditorRef = useRef(null);

  const handleFileSelect = (file) => {
    setCurrentImage(file);
  };

  const handleVectorize = async (file, options) => {
    // Check if background removal is requested
    if (options.removeBackground) {
      setShowBackgroundRemoval(true);
      return;
    }

    await processVectorization(file, options);
  };

  const processVectorization = async (file, options) => {
    setLoading(true);
    try {
      // Vectorize the image
      const result = await vectorizeImage(file, options);

      if (result.success) {
        console.log('Vectorization result:', result);
        console.log('SVG Content length:', result.svgContent?.length);
        console.log('SVG Content preview:', result.svgContent?.substring(0, 200));
        setCurrentSVG(result.svgContent);
        setQualityMetrics(result.quality);
        setActiveTab('editor');
      } else {
        alert('Vectorization failed: ' + result.message);
      }
    } catch (error) {
      console.error('Error during vectorization:', error);
      alert('An error occurred during vectorization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const exportInFormat = async (canvas, format) => {
    try {
      switch (format.toLowerCase()) {
        case 'png':
          const png = canvas.toDataURL({ format: 'png', quality: 1 });
          downloadFile(png, 'vectorized-export.png');
          break;
        case 'jpg':
          const jpg = canvas.toDataURL({ format: 'jpeg', quality: 0.9 });
          downloadFile(jpg, 'vectorized-export.jpg');
          break;
        case 'svg':
          const svg = canvas.toSVG();
          const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
          downloadFile(URL.createObjectURL(svgBlob), 'vectorized-export.svg');
          break;
        case 'pdf':
          await exportAsPDF(canvas);
          break;
        case 'eps':
          await exportAsEPS(canvas);
          break;
        case 'ai':
          await exportAsPDF(canvas, 'vectorized-export.ai');
          break;
      }
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. You can try exporting manually from the editor.`);
    }
  };

  const handleBackgroundRemovalComplete = async (processedFile) => {
    setShowBackgroundRemoval(false);
    setCurrentImage(processedFile);

    // Now vectorize the processed image
    await processVectorization(processedFile, { method: 'ai', detailLevel: 'high' });
  };

  const handleColorChange = (updatedSVG, oldColor, newColor, colorMap) => {
    setCurrentSVG(updatedSVG);
    console.log('Color changed:', { oldColor, newColor, colorMap });

    // Force canvas to reload with the updated SVG
    if (canvasEditorRef.current) {
      // The canvas will automatically reload when currentSVG changes via the useEffect
    }
  };

  const handleExport = (format, canvas) => {
    console.log('Exporting as:', format);
  };

  const handleQuickExport = async (format) => {
    if (!canvasEditorRef.current) {
      alert('No canvas available to export');
      return;
    }

    const canvas = canvasEditorRef.current;

    try {
      switch (format.toLowerCase()) {
        case 'png':
          const png = canvas.toDataURL({ format: 'png', quality: 1 });
          downloadFile(png, 'canvas-export.png');
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
      }
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. Please try again.`);
    }
  };

  const exportAsPDF = async (canvas, filename = 'canvas-export.pdf') => {
    const { jsPDF } = await import('jspdf');
    await import('svg2pdf.js');

    const svgString = canvas.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = canvas.width;
    const height = canvas.height;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height]
    });

    await pdf.svg(svgElement, {
      x: 0,
      y: 0,
      width: width,
      height: height
    });

    pdf.save(filename);
  };

  const exportAsEPS = async (canvas) => {
    const svg = canvas.toSVG();
    const width = canvas.width;
    const height = canvas.height;

    const epsContent = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${width} ${height}
%%HiResBoundingBox: 0.0 0.0 ${width}.0 ${height}.0
%%Creator: idegy Vectorizer
%%Title: Canvas Export
%%CreationDate: ${new Date().toISOString()}
%%DocumentData: Clean7Bit
%%Origin: 0 0
%%LanguageLevel: 2
%%Pages: 1
%%Page: 1 1

% SVG to PostScript conversion
gsave
${width} ${height} scale
grestore
showpage
%%EOF`;

    const blob = new Blob([epsContent], { type: 'application/postscript' });
    downloadFile(URL.createObjectURL(blob), 'canvas-export.eps');
  };

  const downloadFile = (dataUrl, filename) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const handleIconSelect = (iconName) => {
    if (!canvasEditorRef.current) return;

    const canvas = canvasEditorRef.current;

    // Create a text object with the icon
    // In a real implementation, you'd load the actual SVG icon
    const text = new fabric.Text(iconName, {
      left: canvas.width / 2 - 50,
      top: canvas.height / 2 - 20,
      fontSize: 14,
      fill: '#666666',
      fontFamily: 'Arial',
    });

    canvas.add(text);
    canvas.renderAll();
    setShowIconLibrary(false);
  };

  const handleTemplateSelect = (template) => {
    // Load template into canvas
    if (!canvasEditorRef.current) return;

    const canvas = canvasEditorRef.current;
    canvas.clear();
    canvas.setWidth(template.width);
    canvas.setHeight(template.height);

    // Add template objects
    template.objects.forEach((objData) => {
      let obj;
      switch (objData.type) {
        case 'rect':
          obj = new fabric.Rect(objData);
          break;
        case 'circle':
          obj = new fabric.Circle(objData);
          break;
        case 'text':
          obj = new fabric.Text(objData.text, objData);
          break;
      }
      if (obj) {
        canvas.add(obj);
      }
    });

    canvas.renderAll();
    setActiveTab('editor');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="gradient-header shadow-md z-20">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Icon icon="mdi:vector-square" className="w-8 h-8" />
              <div>
                <h1 className="text-xl font-bold">idegy Vectorizer</h1>
                <p className="text-xs text-white/80">Professional Vector Design Tool</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIconLibrary(true)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium"
            >
              <Icon icon="mdi:shape" className="w-4 h-4 inline mr-1.5" />
              Icons
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Toggle Sidebar"
            >
              <Icon icon="mdi:dock-left" className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Toggle Right Panel"
            >
              <Icon icon="mdi:dock-right" className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-white/20" />
            <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium">
              <Icon icon="mdi:help-circle-outline" className="w-4 h-4 inline mr-1.5" />
              Help
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-t border-white/20 px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 font-medium transition-all relative ${
                activeTab === 'upload'
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              <Icon icon="mdi:upload" className="w-4 h-4 inline mr-2" />
              Upload
              {activeTab === 'upload' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              disabled={!currentSVG}
              className={`px-6 py-3 font-medium transition-all relative disabled:opacity-40 disabled:cursor-not-allowed ${
                activeTab === 'editor'
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              <Icon icon="mdi:draw" className="w-4 h-4 inline mr-2" />
              Editor
              {activeTab === 'editor' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {showSidebar && (
          <aside className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
            <div className="p-4 space-y-4">
              {activeTab === 'upload' && (
                <UploadZone
                  onFileSelect={handleFileSelect}
                  onVectorize={handleVectorize}
                  loading={loading}
                />
              )}

              {activeTab === 'editor' && (
                <>
                  {/* Quick Tools */}
                  <div className="panel p-4">
                    <h3 className="text-lg font-semibold mb-4">Quick Tools</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowIconLibrary(true)}
                        className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <Icon icon="mdi:shape-plus" className="w-5 h-5 mb-1 text-gray-700" />
                        <p className="text-xs font-medium text-gray-700">Add Icons</p>
                      </button>
                      <button className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                        <Icon icon="mdi:format-text" className="w-5 h-5 mb-1 text-gray-700" />
                        <p className="text-xs font-medium text-gray-700">Add Text</p>
                      </button>
                      <button className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                        <Icon icon="mdi:image-plus" className="w-5 h-5 mb-1 text-gray-700" />
                        <p className="text-xs font-medium text-gray-700">Add Image</p>
                      </button>
                      <button className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                        <Icon icon="mdi:shape" className="w-5 h-5 mb-1 text-gray-700" />
                        <p className="text-xs font-medium text-gray-700">Shapes</p>
                      </button>
                    </div>
                  </div>

                  {/* Advanced Tools */}
                  <AdvancedTools
                    fabricCanvas={canvasEditorRef}
                    activeObject={activeCanvasObject}
                  />

                  {/* Quality Metrics */}
                  {qualityMetrics && (
                    <div className="panel p-4">
                      <h3 className="text-lg font-semibold mb-3">Quality</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-medium text-gray-700">Overall Score</span>
                            <span className="text-lg font-bold text-idegy-blue">
                              {qualityMetrics.score}/100
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-gradient-to-r from-idegy-teal to-idegy-blue h-2.5 rounded-full transition-all"
                              style={{ width: `${qualityMetrics.score}%` }}
                            />
                          </div>
                        </div>

                        {qualityMetrics.isTrueVector && (
                          <div className="flex items-center gap-2 text-green-600 text-sm">
                            <Icon icon="mdi:check-circle" className="w-5 h-5" />
                            <span className="font-medium">True Vector ✓</span>
                          </div>
                        )}

                        {qualityMetrics.warnings?.length > 0 && (
                          <div className="text-xs space-y-1">
                            {qualityMetrics.warnings.map((warning, i) => (
                              <div key={i} className="flex items-start gap-2 text-amber-600">
                                <Icon icon="mdi:alert" className="w-4 h-4 mt-0.5" />
                                <span>{warning}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {/* Main Canvas Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'upload' && !currentImage && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-lg">
                <Icon icon="mdi:vector-triangle" className="w-24 h-24 mx-auto mb-6 text-gray-300" />
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Welcome to idegy Vectorizer
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  Transform your raster images into crisp, scalable vectors with AI-powered precision.
                  Edit colors, add creative elements, and export to any format.
                </p>
                <div className="grid grid-cols-3 gap-4 text-left">
                  <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                    <Icon icon="mdi:palette" className="w-8 h-8 text-idegy-blue mb-2" />
                    <h3 className="font-semibold mb-1 text-sm">Color Editing</h3>
                    <p className="text-xs text-gray-600">Extract and edit color palettes</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                    <Icon icon="mdi:layers" className="w-8 h-8 text-idegy-teal mb-2" />
                    <h3 className="font-semibold mb-1 text-sm">Canvas Editor</h3>
                    <p className="text-xs text-gray-600">Add shapes, text & icons</p>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                    <Icon icon="mdi:download" className="w-8 h-8 text-idegy-darkblue mb-2" />
                    <h3 className="font-semibold mb-1 text-sm">Multi-format Export</h3>
                    <p className="text-xs text-gray-600">SVG, PDF, EPS, AI formats</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'editor' && currentSVG && (
            <CanvasEditor
              ref={canvasEditorRef}
              svgContent={currentSVG}
              image={currentImage}
              onExport={handleExport}
              onSelectionChange={setActiveCanvasObject}
              className="flex-1"
            />
          )}

        </main>

        {/* Right Panel */}
        {showRightPanel && (
          <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Color Palette */}
              {currentSVG && (
                <ColorPalette svgContent={currentSVG} onColorChange={handleColorChange} />
              )}

              {/* Layers Panel */}
              <div className="panel p-4">
                <h3 className="text-lg font-semibold mb-3">Layers</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:eye" className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">Background</span>
                    </div>
                    <Icon icon="mdi:lock" className="w-4 h-4 text-gray-400" />
                  </div>
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
                      { format: 'SVG', icon: 'mdi:svg', color: 'text-orange-600' },
                      { format: 'PNG', icon: 'mdi:file-png-box', color: 'text-blue-600' },
                      { format: 'PDF', icon: 'mdi:file-pdf-box', color: 'text-red-600' },
                      { format: 'EPS', icon: 'mdi:file-document-outline', color: 'text-purple-600' },
                    ].map((item) => (
                      <button
                        key={item.format}
                        onClick={() => handleQuickExport(item.format)}
                        className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Icon icon={item.icon} className={`w-5 h-5 ${item.color}`} />
                          <span className="text-sm font-medium text-gray-700">{item.format}</span>
                        </div>
                        <Icon icon="mdi:download" className="w-4 h-4 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Modals */}
      {showIconLibrary && (
        <IconLibrary
          isOpen={showIconLibrary}
          onClose={() => setShowIconLibrary(false)}
          onIconSelect={handleIconSelect}
        />
      )}

      {showBackgroundRemoval && currentImage && (
        <BackgroundRemovalTool
          image={currentImage}
          onComplete={handleBackgroundRemovalComplete}
          onCancel={() => setShowBackgroundRemoval(false)}
        />
      )}
    </div>
  );
}

export default App;
