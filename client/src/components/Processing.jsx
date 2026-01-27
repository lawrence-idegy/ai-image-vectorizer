import { Icon } from '@iconify/react';

function Processing({ filename, status }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <div className="text-center max-w-md">
        {/* Animated Spinner */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          {/* Outer ring */}
          <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
          {/* Spinning ring */}
          <div className="absolute inset-0 border-4 border-transparent border-t-idegy-navy dark:border-t-idegy-blue rounded-full spinner-ring"></div>
          {/* Inner icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon icon="mdi:vector-triangle" className="w-10 h-10 text-idegy-navy dark:text-idegy-blue animate-pulse" />
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {status || 'Processing your logo...'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          This usually takes 10-30 seconds
        </p>

        {/* File name indicator */}
        {filename && (
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm text-gray-600 dark:text-gray-400">
            <Icon icon="mdi:file-image" className="w-4 h-4" />
            {filename}
          </div>
        )}

        {/* Progress dots animation */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="w-2 h-2 bg-idegy-navy dark:bg-idegy-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-idegy-navy-light dark:bg-idegy-teal rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-idegy-navy dark:bg-idegy-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
}

export default Processing;
