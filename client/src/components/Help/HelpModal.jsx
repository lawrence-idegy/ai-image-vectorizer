import { useState } from 'react';
import { Icon } from '@iconify/react';

function HelpModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('getting-started');

  if (!isOpen) return null;

  const tabs = [
    { id: 'getting-started', label: 'Getting Started', icon: 'mdi:rocket-launch' },
    { id: 'features', label: 'Features', icon: 'mdi:star' },
    { id: 'formats', label: 'Export Formats', icon: 'mdi:file-export' },
    { id: 'tips', label: 'Pro Tips', icon: 'mdi:lightbulb' },
    { id: 'keyboard', label: 'Shortcuts', icon: 'mdi:keyboard' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="gradient-header p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold">Help & Documentation</h2>
              <p className="text-white/80 text-sm mt-1">
                Learn how to use idegy Vectorizer v2.0
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <Icon icon="mdi:close" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'text-idegy-blue border-b-2 border-idegy-blue'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Icon icon={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
          {activeTab === 'getting-started' && <GettingStarted />}
          {activeTab === 'features' && <Features />}
          {activeTab === 'formats' && <Formats />}
          {activeTab === 'tips' && <Tips />}
          {activeTab === 'keyboard' && <Keyboard />}
        </div>
      </div>
    </div>
  );
}

function GettingStarted() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Welcome to idegy Vectorizer</h3>
        <p className="text-gray-600 mb-4">
          Transform your raster images (PNG, JPG, WEBP) into crisp, scalable vector graphics
          using AI-powered technology.
        </p>
      </div>

      <div className="space-y-4">
        <Step
          number={1}
          title="Upload an Image"
          description="Drag and drop your image or click to browse. We support PNG, JPG, and WEBP formats up to 10MB."
        />
        <Step
          number={2}
          title="Choose Processing Options"
          description="Select AI vectorization for best quality or Potrace for simple black & white images. Enable background removal if needed."
        />
        <Step
          number={3}
          title="Edit Your Vector"
          description="Use the canvas editor to modify colors, add elements, or adjust your vectorized image."
        />
        <Step
          number={4}
          title="Export"
          description="Download your vector in SVG, PNG, PDF, or EPS format for use in any design application."
        />
      </div>
    </div>
  );
}

function Step({ number, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-idegy-teal to-idegy-blue text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function Features() {
  const features = [
    {
      icon: 'mdi:robot',
      title: 'AI Vectorization',
      description: 'Powered by Replicate AI for professional-grade vector conversion.',
    },
    {
      icon: 'mdi:image-filter-center-focus',
      title: 'Background Removal',
      description: 'Automatically remove backgrounds before vectorization.',
    },
    {
      icon: 'mdi:lightning-bolt',
      title: 'SVG Optimization',
      description: 'Automatic SVGO optimization reduces file size by up to 50%.',
    },
    {
      icon: 'mdi:image-multiple',
      title: 'Batch Processing',
      description: 'Process up to 20 images at once with real-time progress tracking.',
    },
    {
      icon: 'mdi:palette',
      title: 'Color Editing',
      description: 'Extract and modify colors directly in your vectorized images.',
    },
    {
      icon: 'mdi:websocket',
      title: 'Real-time Updates',
      description: 'WebSocket-powered progress tracking for batch operations.',
    },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {features.map((feature) => (
        <div key={feature.title} className="p-4 bg-gray-50 rounded-lg">
          <Icon icon={feature.icon} className="w-8 h-8 text-idegy-blue mb-2" />
          <h4 className="font-medium text-gray-900">{feature.title}</h4>
          <p className="text-sm text-gray-600">{feature.description}</p>
        </div>
      ))}
    </div>
  );
}

function Formats() {
  const formats = [
    {
      format: 'SVG',
      icon: 'mdi:svg',
      color: 'text-orange-600',
      use: 'Web, Design Tools',
      description: 'Scalable Vector Graphics - Perfect for web and responsive designs.',
    },
    {
      format: 'PNG',
      icon: 'mdi:file-png-box',
      color: 'text-blue-600',
      use: 'Web, Social Media',
      description: 'High-quality raster export with transparency support.',
    },
    {
      format: 'PDF',
      icon: 'mdi:file-pdf-box',
      color: 'text-red-600',
      use: 'Print, Documents',
      description: 'Vector PDF for professional printing and documentation.',
    },
    {
      format: 'EPS',
      icon: 'mdi:file-document-outline',
      color: 'text-purple-600',
      use: 'Adobe Suite, Print',
      description: 'Encapsulated PostScript for legacy design applications.',
    },
  ];

  return (
    <div className="space-y-4">
      {formats.map((f) => (
        <div key={f.format} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
          <Icon icon={f.icon} className={`w-10 h-10 ${f.color}`} />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{f.format}</h4>
              <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">{f.use}</span>
            </div>
            <p className="text-sm text-gray-600">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tips() {
  const tips = [
    'Use high-contrast images for best vectorization results.',
    'Simple logos and icons work better than complex photographs.',
    'Enable background removal for images with busy backgrounds.',
    'Use AI method for colored images, Potrace for black & white.',
    'Optimize your SVGs to reduce file size before using in production.',
    'Check the quality score to ensure true vector output.',
  ];

  return (
    <div className="space-y-3">
      {tips.map((tip, index) => (
        <div key={index} className="flex items-start gap-3">
          <Icon icon="mdi:lightbulb" className="w-5 h-5 text-yellow-500 mt-0.5" />
          <p className="text-gray-700">{tip}</p>
        </div>
      ))}
    </div>
  );
}

function Keyboard() {
  const shortcuts = [
    { keys: ['Ctrl', 'Z'], action: 'Undo' },
    { keys: ['Ctrl', 'Y'], action: 'Redo' },
    { keys: ['Ctrl', 'S'], action: 'Export SVG' },
    { keys: ['Ctrl', 'E'], action: 'Export PNG' },
    { keys: ['Del'], action: 'Delete selected' },
    { keys: ['Ctrl', 'A'], action: 'Select all' },
    { keys: ['Ctrl', '+'], action: 'Zoom in' },
    { keys: ['Ctrl', '-'], action: 'Zoom out' },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {shortcuts.map((s, index) => (
        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-700">{s.action}</span>
          <div className="flex gap-1">
            {s.keys.map((key, i) => (
              <span key={i}>
                <kbd className="px-2 py-1 bg-white border rounded text-sm font-mono">
                  {key}
                </kbd>
                {i < s.keys.length - 1 && <span className="mx-1">+</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default HelpModal;
