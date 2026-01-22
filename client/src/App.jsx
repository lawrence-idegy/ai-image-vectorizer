import { useState, useRef } from 'react';
import { Icon } from '@iconify/react';
import * as fabric from 'fabric';

// Layout Components
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import RightPanel from './components/Layout/RightPanel';

// Feature Components
import CanvasEditor from './components/Canvas/CanvasEditor';
import BatchProcessor from './components/Batch/BatchProcessor';
import IconLibrary from './components/Tools/IconLibrary';
import BackgroundRemovalTool from './components/Tools/BackgroundRemovalTool';
import AuthModal from './components/Auth/AuthModal';
import HelpModal from './components/Help/HelpModal';

// Hooks
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

// API
import { vectorizeImage } from './services/api';

// Utilities
import { downloadFile, downloadSVGFile } from './utils/exportUtils';

function AppContent() {
  // State
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [currentSVG, setCurrentSVG] = useState(null);
  const [qualityMetrics, setQualityMetrics] = useState(null);
  const [optimization, setOptimization] = useState(null);

  // UI State
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [showBackgroundRemoval, setShowBackgroundRemoval] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Canvas State
  const [activeCanvasObject, setActiveCanvasObject] = useState(null);
  const [canvasBackground, setCanvasBackground] = useState('#ffffff');
  const canvasEditorRef = useRef(null);

  // Auth
  const { user, logout } = useAuth();

  // Handlers
  const handleFileSelect = (file) => {
    setCurrentImage(file);
  };

  const handleVectorize = async (file, options) => {
    if (options.removeBackground) {
      setShowBackgroundRemoval(true);
      return;
    }
    await processVectorization(file, options);
  };

  const processVectorization = async (file, options) => {
    setLoading(true);
    try {
      const result = await vectorizeImage(file, {
        ...options,
        optimize: true,
      });

      if (result.success) {
        setCurrentSVG(result.svgContent);
        setQualityMetrics(result.quality);
        setOptimization(result.optimization);
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

  const handleBackgroundRemovalComplete = async (processedFile) => {
    setShowBackgroundRemoval(false);
    setCurrentImage(processedFile);
    await processVectorization(processedFile, { method: 'ai', detailLevel: 'high' });
  };

  const handleColorChange = (updatedSVG, oldColor, newColor, colorMap) => {
    // Apply color changes directly to the canvas objects
    // Do NOT update currentSVG state - that would trigger a full canvas reload
    // and lose any user modifications (deletions, transforms, etc.)
    if (canvasEditorRef.current) {
      if (colorMap) {
        // Multiple color replacement (palette theme)
        canvasEditorRef.current.replaceMultipleColorsOnCanvas(colorMap);
      } else if (oldColor && newColor) {
        // Single color replacement
        canvasEditorRef.current.replaceColorOnCanvas(oldColor, newColor);
      }
    }
  };

  const handleBackgroundChange = (color) => {
    setCanvasBackground(color);
    if (canvasEditorRef.current?.changeBackground) {
      canvasEditorRef.current.changeBackground(color);
    }
  };

  const handleQuickExport = async (format) => {
    if (!canvasEditorRef.current) {
      alert('No canvas available to export');
      return;
    }

    const canvasEditor = canvasEditorRef.current;
    const fabricCanvas = canvasEditor.getCanvas?.();

    try {
      switch (format.toLowerCase()) {
        case 'png': {
          // Higher resolution PNG export
          const png = canvasEditor.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
          downloadFile(png, 'canvas-export.png');
          break;
        }
        case 'svg':
          downloadSVGFile(canvasEditor.toSVG(), 'canvas-export.svg');
          break;
        case 'pdf':
          await exportAsPDF(canvasEditor, fabricCanvas);
          break;
        case 'eps':
          await exportAsEPS(canvasEditor, fabricCanvas);
          break;
        case 'ai':
          await exportAsAI(canvasEditor, fabricCanvas);
          break;
      }
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      alert(`Failed to export as ${format.toUpperCase()}. Please try again.`);
    }
  };

  const exportAsPDF = async (canvasEditor, fabricCanvas, filename = 'canvas-export.pdf') => {
    const { jsPDF } = await import('jspdf');
    await import('svg2pdf.js');

    const svgString = canvasEditor.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = fabricCanvas?.width || 800;
    const height = fabricCanvas?.height || 600;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width, height });
    pdf.save(filename);
  };

  const exportAsEPS = async (canvasEditor, fabricCanvas) => {
    // EPS format is PostScript-based, but modern design apps can open PDF files
    // We create a PDF that these apps can import and convert to EPS
    const { jsPDF } = await import('jspdf');
    await import('svg2pdf.js');

    const svgString = canvasEditor.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = fabricCanvas?.width || 800;
    const height = fabricCanvas?.height || 600;

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

  const exportAsAI = async (canvasEditor, fabricCanvas) => {
    // Adobe Illustrator .ai format is proprietary PDF-based
    // We create a PDF with AI-compatible metadata that Illustrator opens natively
    const { jsPDF } = await import('jspdf');
    await import('svg2pdf.js');

    const svgString = canvasEditor.toSVG();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const width = fabricCanvas?.width || 800;
    const height = fabricCanvas?.height || 600;

    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    pdf.setProperties({
      title: 'Canvas Export',
      creator: 'idegy Vectorizer',
      subject: 'Vector Graphics',
    });

    await pdf.svg(svgElement, { x: 0, y: 0, width, height });
    pdf.save('canvas-export.ai');
  };

  const handleIconSelect = (iconName) => {
    if (!canvasEditorRef.current) return;

    const canvas = canvasEditorRef.current;
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentSVG={currentSVG}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        showRightPanel={showRightPanel}
        setShowRightPanel={setShowRightPanel}
        setShowIconLibrary={setShowIconLibrary}
        setShowHelp={setShowHelp}
        setShowAuth={setShowAuth}
        user={user}
        onLogout={logout}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {showSidebar && (
          <Sidebar
            activeTab={activeTab}
            currentSVG={currentSVG}
            qualityMetrics={qualityMetrics}
            onFileSelect={handleFileSelect}
            onVectorize={handleVectorize}
            loading={loading}
            setShowIconLibrary={setShowIconLibrary}
            canvasEditorRef={canvasEditorRef}
            activeCanvasObject={activeCanvasObject}
          />
        )}

        {/* Main Canvas Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Welcome Screen */}
          {activeTab === 'upload' && !currentImage && (
            <WelcomeScreen />
          )}

          {/* Canvas Editor */}
          {activeTab === 'editor' && currentSVG && (
            <CanvasEditor
              ref={canvasEditorRef}
              svgContent={currentSVG}
              image={currentImage}
              onExport={() => {}}
              onSelectionChange={setActiveCanvasObject}
              className="flex-1"
            />
          )}

          {/* Batch Processor */}
          {activeTab === 'batch' && (
            <BatchProcessor />
          )}
        </main>

        {/* Right Panel */}
        {showRightPanel && activeTab !== 'batch' && (
          <RightPanel
            currentSVG={currentSVG}
            onColorChange={handleColorChange}
            onQuickExport={handleQuickExport}
            optimization={optimization}
            canvasEditorRef={canvasEditorRef}
            canvasBackground={canvasBackground}
            onBackgroundChange={handleBackgroundChange}
          />
        )}
      </div>

      {/* Modals */}
      <IconLibrary
        isOpen={showIconLibrary}
        onClose={() => setShowIconLibrary(false)}
        onIconSelect={handleIconSelect}
      />

      {showBackgroundRemoval && currentImage && (
        <BackgroundRemovalTool
          image={currentImage}
          onComplete={handleBackgroundRemovalComplete}
          onCancel={() => setShowBackgroundRemoval(false)}
        />
      )}

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
      />

      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}

function WelcomeScreen() {
  return (
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
          <FeatureCard
            icon="mdi:palette"
            title="Color Editing"
            description="Extract and edit color palettes"
            color="text-idegy-blue"
          />
          <FeatureCard
            icon="mdi:layers"
            title="Canvas Editor"
            description="Add shapes, text & icons"
            color="text-idegy-teal"
          />
          <FeatureCard
            icon="mdi:download"
            title="Multi-format Export"
            description="SVG, PDF, EPS, AI formats"
            color="text-idegy-darkblue"
          />
        </div>

      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }) {
  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <Icon icon={icon} className={`w-8 h-8 ${color} mb-2`} />
      <h3 className="font-semibold mb-1 text-sm">{title}</h3>
      <p className="text-xs text-gray-600">{description}</p>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
