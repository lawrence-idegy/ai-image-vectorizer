import { useState } from 'react';

// Layout Components
import Header from './components/Layout/Header';

// Simple Flow Components
import SimpleUpload from './components/SimpleUpload';
import Processing from './components/Processing';
import CleanupEditor from './components/CleanupEditor';
import DownloadResults from './components/DownloadResults';

// Auth Components
import AuthModal from './components/Auth/AuthModal';

// Hooks
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

// Theme Context
import { ThemeProvider } from './contexts/ThemeContext';

// API
import { vectorizeImage, removeBackground } from './services/api';

// Utils
import { convertPdfToImage, isPdfFile } from './utils/pdfToImage';

function AppContent() {
  // Flow state: 'upload' | 'processing' | 'cleanup' | 'complete'
  const [step, setStep] = useState('upload');
  const [error, setError] = useState(null);
  const [processingStatus, setProcessingStatus] = useState('Processing...');

  // Data state
  const [currentFile, setCurrentFile] = useState(null);
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [svgContent, setSvgContent] = useState(null);

  // Auth - require login before accessing app
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // Show login modal if not authenticated (after loading check)
  const needsAuth = !loading && !isAuthenticated;

  const handleUpload = async ({ file, clientName: client, projectName: project, removeBackground: shouldRemoveBg, mode = 'vectorize' }) => {
    // Double-check authentication
    if (!isAuthenticated) {
      setShowAuth(true);
      return;
    }

    setCurrentFile(file);
    setClientName(client);
    setProjectName(project);
    setStep('processing');
    setError(null);

    try {
      let processedFile = file;

      // If the file is already an SVG, read it and go straight to cleanup
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      if (isSvg) {
        setProcessingStatus('Loading SVG...');
        const svgText = await file.text();
        setSvgContent(svgText);
        setStep('cleanup');
        return;
      }

      // Step 0: Convert PDF to PNG on the client side (server can't process PDFs on Vercel)
      if (isPdfFile(file)) {
        setProcessingStatus('Converting PDF to image...');
        try {
          processedFile = await convertPdfToImage(file);
        } catch (pdfErr) {
          throw new Error('Failed to convert PDF: ' + pdfErr.message);
        }
      }

      // Step 1: Remove background if requested (vectorize mode only)
      if (shouldRemoveBg && mode === 'vectorize') {
        setProcessingStatus('Removing background...');
        try {
          const bgResult = await removeBackground(processedFile, { quality: 'balanced' });
          if (bgResult.success && bgResult.image) {
            // Convert data URI back to File
            const response = await fetch(bgResult.image);
            const blob = await response.blob();
            processedFile = new File([blob], processedFile.name.replace(/\.[^.]+$/, '_nobg.png'), { type: 'image/png' });
          }
        } catch (bgErr) {
          // Continue with original file if background removal fails
        }
      }

      // Step 2: Vectorize the image
      setProcessingStatus(mode === 'cleanup' ? 'Tracing image...' : 'Vectorizing with AI...');

      const vectorOptions = {
        method: 'ai',
        optimize: mode === 'vectorize',
        detailLevel: 'high',
      };

      const result = await vectorizeImage(processedFile, vectorOptions);

      if (result.success) {
        setSvgContent(result.svgContent);
        setStep('cleanup'); // Go to cleanup step first
      } else {
        throw new Error(result.message || 'Vectorization failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred during vectorization';
      setError(errorMessage);
      setStep('upload');
    }
  };

  const handleStartOver = () => {
    setStep('upload');
    setCurrentFile(null);
    setClientName('');
    setProjectName('');
    setSvgContent(null);
    setError(null);
    setProcessingStatus('Processing...');
  };

  const handleCleanupComplete = (cleanedSvg) => {
    setSvgContent(cleanedSvg);
    setStep('complete');
  };

  const handleCleanupBack = () => {
    // Go back to upload to try again
    handleStartOver();
  };

  const handleBackToEdit = () => {
    // Go back to cleanup editor with current SVG content
    setStep('cleanup');
  };

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header user={null} onLogout={() => {}} onSignIn={() => {}} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-idegy-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (needsAuth) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header user={null} onLogout={() => {}} onSignIn={() => {}} />
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-md animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to Vector Fix</h1>
              <p className="text-gray-500 dark:text-gray-400">Sign in to start converting images to vectors</p>
            </div>
            <AuthModal
              isOpen={true}
              onClose={() => {}}
              embedded={true}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header
        user={user}
        onLogout={logout}
        onSignIn={() => setShowAuth(true)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-3">
            <div className="max-w-xl mx-auto flex items-center gap-2 text-red-700 dark:text-red-400">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Step Content */}
        {step === 'upload' && (
          <SimpleUpload
            onUpload={handleUpload}
            disabled={false}
          />
        )}

        {step === 'processing' && (
          <Processing
            filename={currentFile?.name}
            status={processingStatus}
          />
        )}

        {step === 'cleanup' && svgContent && (
          <CleanupEditor
            svgContent={svgContent}
            onComplete={handleCleanupComplete}
            onBack={handleCleanupBack}
          />
        )}

        {step === 'complete' && svgContent && (
          <DownloadResults
            svgContent={svgContent}
            clientName={clientName}
            projectName={projectName}
            onStartOver={handleStartOver}
            onBackToEdit={handleBackToEdit}
          />
        )}
      </main>

      {/* Auth Modal - for re-login if needed */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
