import { useRef } from 'react';
import { Icon } from '@iconify/react';
import UploadZone from '../Vectorizer/UploadZone';
import AdvancedTools from '../Canvas/AdvancedTools';

function Sidebar({
  activeTab,
  currentSVG,
  qualityMetrics,
  onFileSelect,
  onVectorize,
  loading,
  setShowIconLibrary,
  canvasEditorRef,
  activeCanvasObject,
}) {
  const imageInputRef = useRef(null);

  const handleAddText = () => {
    if (canvasEditorRef.current?.addText) {
      canvasEditorRef.current.addText();
    }
  };

  const handleAddShape = (type) => {
    if (canvasEditorRef.current?.addShape) {
      canvasEditorRef.current.addShape(type);
    }
  };

  const handleAddImage = () => {
    imageInputRef.current?.click();
  };

  const handleImageSelected = (e) => {
    const file = e.target.files?.[0];
    if (file && canvasEditorRef.current?.addImage) {
      canvasEditorRef.current.addImage(file);
    }
    e.target.value = '';
  };

  const handleRestoreSVG = () => {
    if (canvasEditorRef.current?.restoreSVG) {
      canvasEditorRef.current.restoreSVG();
    }
  };

  return (
    <aside className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
      <div className="p-4 space-y-4">
        {activeTab === 'upload' && (
          <UploadZone
            onFileSelect={onFileSelect}
            onVectorize={onVectorize}
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
                  className="p-3 rounded-lg bg-gray-50 hover:bg-idegy-lightblue transition-colors text-left"
                >
                  <Icon icon="mdi:shape-plus" className="w-5 h-5 mb-1 text-gray-700" />
                  <p className="text-xs font-medium text-gray-700">Add Icons</p>
                </button>
                <button
                  onClick={handleAddText}
                  className="p-3 rounded-lg bg-gray-50 hover:bg-idegy-lightblue transition-colors text-left"
                >
                  <Icon icon="mdi:format-text" className="w-5 h-5 mb-1 text-gray-700" />
                  <p className="text-xs font-medium text-gray-700">Add Text</p>
                </button>
                <button
                  onClick={handleAddImage}
                  className="p-3 rounded-lg bg-gray-50 hover:bg-idegy-lightblue transition-colors text-left"
                >
                  <Icon icon="mdi:image-plus" className="w-5 h-5 mb-1 text-gray-700" />
                  <p className="text-xs font-medium text-gray-700">Add Image</p>
                </button>
                <div className="relative group">
                  <button className="w-full p-3 rounded-lg bg-gray-50 hover:bg-idegy-lightblue transition-colors text-left">
                    <Icon icon="mdi:shape" className="w-5 h-5 mb-1 text-gray-700" />
                    <p className="text-xs font-medium text-gray-700">Shapes</p>
                  </button>
                  {/* Shape submenu */}
                  <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                    <button
                      onClick={() => handleAddShape('rectangle')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                    >
                      <Icon icon="mdi:rectangle-outline" className="w-4 h-4" />
                      Rectangle
                    </button>
                    <button
                      onClick={() => handleAddShape('circle')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                    >
                      <Icon icon="mdi:circle-outline" className="w-4 h-4" />
                      Circle
                    </button>
                    <button
                      onClick={() => handleAddShape('triangle')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                    >
                      <Icon icon="mdi:triangle-outline" className="w-4 h-4" />
                      Triangle
                    </button>
                    <button
                      onClick={() => handleAddShape('line')}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                    >
                      <Icon icon="mdi:minus" className="w-4 h-4" />
                      Line
                    </button>
                  </div>
                </div>
              </div>

              {/* Hidden file input for image upload */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelected}
                className="hidden"
              />

              {/* Restore SVG button */}
              {currentSVG && (
                <button
                  onClick={handleRestoreSVG}
                  className="w-full mt-3 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm text-gray-600"
                >
                  <Icon icon="mdi:restore" className="w-4 h-4" />
                  Restore Original Vector
                </button>
              )}
            </div>

            {/* Advanced Tools */}
            <AdvancedTools
              fabricCanvas={canvasEditorRef}
              activeObject={activeCanvasObject}
            />

            {/* Quality Metrics */}
            {qualityMetrics && <QualityMetricsPanel metrics={qualityMetrics} />}
          </>
        )}

        {activeTab === 'batch' && (
          <BatchUploadPanel />
        )}
      </div>
    </aside>
  );
}

function QualityMetricsPanel({ metrics }) {
  return (
    <div className="panel p-4">
      <h3 className="text-lg font-semibold mb-3">Quality</h3>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-sm font-medium text-gray-700">Overall Score</span>
            <span className="text-lg font-bold text-idegy-blue">
              {metrics.score}/100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-idegy-teal to-idegy-blue h-2.5 rounded-full transition-all"
              style={{ width: `${metrics.score}%` }}
            />
          </div>
        </div>

        {metrics.isTrueVector && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Icon icon="mdi:check-circle" className="w-5 h-5" />
            <span className="font-medium">True Vector</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Paths</span>
            <p className="font-semibold">{metrics.pathCount}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Colors</span>
            <p className="font-semibold">{metrics.colorCount}</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Size</span>
            <p className="font-semibold">{metrics.fileSizeKB} KB</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <span className="text-gray-500">Complexity</span>
            <p className="font-semibold capitalize">{metrics.complexity}</p>
          </div>
        </div>

        {metrics.warnings?.length > 0 && (
          <div className="text-xs space-y-1">
            {metrics.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-amber-600">
                <Icon icon="mdi:alert" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchUploadPanel() {
  return (
    <div className="panel p-4">
      <h3 className="text-lg font-semibold mb-4">Batch Processing</h3>
      <p className="text-sm text-gray-600 mb-4">
        Upload multiple images to vectorize them all at once.
        Real-time progress tracking via WebSocket.
      </p>
      <div className="space-y-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:check" className="w-4 h-4 text-green-500" />
          <span>Up to 20 images per batch</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon icon="mdi:check" className="w-4 h-4 text-green-500" />
          <span>Real-time progress updates</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon icon="mdi:check" className="w-4 h-4 text-green-500" />
          <span>Automatic SVG optimization</span>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
