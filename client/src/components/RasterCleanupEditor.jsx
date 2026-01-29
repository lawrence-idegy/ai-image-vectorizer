import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';

const MAX_CANVAS_DIM = 4096;
const MAX_UNDO_STEPS = 20;
const LARGE_IMAGE_UNDO_CAP = 10;
const LARGE_IMAGE_THRESHOLD = 2048 * 2048;

// Color distance (Euclidean in RGB space)
function colorDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
  return Math.sqrt(
    (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2 + (a1 - a2) ** 2
  );
}

// Flood-fill erase: BFS from a point, erasing all connected pixels within tolerance
function floodFillErase(imageData, startX, startY, tolerance) {
  const { width, height, data } = imageData;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

  const idx = (sy * width + sx) * 4;
  const targetR = data[idx];
  const targetG = data[idx + 1];
  const targetB = data[idx + 2];
  const targetA = data[idx + 3];

  // If already fully transparent, nothing to do
  if (targetA === 0) return;

  const visited = new Uint8Array(width * height);
  const queue = [sx, sy];
  let head = 0;

  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];

    const pi = y * width + x;
    if (visited[pi]) continue;
    visited[pi] = 1;

    const i = pi * 4;
    const dist = colorDistance(
      data[i], data[i + 1], data[i + 2], data[i + 3],
      targetR, targetG, targetB, targetA
    );

    if (dist > tolerance) continue;

    // Erase this pixel
    data[i + 3] = 0;

    // Enqueue neighbors (4-connected)
    if (x > 0) { queue.push(x - 1, y); }
    if (x < width - 1) { queue.push(x + 1, y); }
    if (y > 0) { queue.push(x, y - 1); }
    if (y < height - 1) { queue.push(x, y + 1); }
  }
}

// Bulk erase: remove ALL pixels matching a color within tolerance
function bulkColorErase(imageData, targetR, targetG, targetB, targetA, tolerance) {
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip already transparent
    const dist = colorDistance(
      data[i], data[i + 1], data[i + 2], data[i + 3],
      targetR, targetG, targetB, targetA
    );
    if (dist <= tolerance) {
      data[i + 3] = 0;
    }
  }
}

function RasterCleanupEditor({ imageUrl, onComplete, onBack }) {
  // Refs
  const displayCanvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const undoStackRef = useRef([]);

  // State
  const [activeTool, setActiveTool] = useState('wand'); // 'wand' | 'bulk' | 'brush'
  const [brushSize, setBrushSize] = useState(30);
  const [tolerance, setTolerance] = useState(40);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cursorPos, setCursorPos] = useState(null);

  // Bulk erase: picked color preview
  const [pickedColor, setPickedColor] = useState(null); // { r, g, b, a }
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // Max undo steps based on image size
  const maxUndo = imageSize.width * imageSize.height > LARGE_IMAGE_THRESHOLD
    ? LARGE_IMAGE_UNDO_CAP
    : MAX_UNDO_STEPS;

  // Load image and initialize offscreen canvas
  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
        const scale = MAX_CANVAS_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      offscreenCanvasRef.current = offscreen;
      imageRef.current = img;
      setImageSize({ width: w, height: h });
      setImageLoaded(true);

      requestAnimationFrame(() => {
        if (containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const fitZoom = Math.min(
            (containerRect.width - 40) / w,
            (containerRect.height - 40) / h,
            1
          );
          setZoom(Math.max(0.25, fitZoom));
          setPan({ x: 0, y: 0 });
        }
      });
    };
    img.onerror = () => {
      console.error('Failed to load image for raster editor');
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw checkerboard + composited image on display canvas
  const renderDisplay = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const offscreen = offscreenCanvasRef.current;
    if (!displayCanvas || !offscreen) return;

    const ctx = displayCanvas.getContext('2d');
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    displayCanvas.width = rect.width * dpr;
    displayCanvas.height = rect.height * dpr;
    displayCanvas.style.width = rect.width + 'px';
    displayCanvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();

    const cx = rect.width / 2 + pan.x;
    const cy = rect.height / 2 + pan.y;
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    const imgW = offscreen.width;
    const imgH = offscreen.height;

    const checkSize = 12;
    const startX = -imgW / 2;
    const startY = -imgH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(startX, startY, imgW, imgH);
    ctx.clip();

    for (let y = 0; y < imgH; y += checkSize) {
      for (let x = 0; x < imgW; x += checkSize) {
        const isLight = ((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0);
        ctx.fillStyle = isLight ? '#ffffff' : '#d1d5db';
        ctx.fillRect(startX + x, startY + y, checkSize, checkSize);
      }
    }
    ctx.restore();

    ctx.drawImage(offscreen, startX, startY, imgW, imgH);

    ctx.restore();
  }, [zoom, pan]);

  useEffect(() => {
    if (imageLoaded) renderDisplay();
  }, [imageLoaded, renderDisplay]);

  useEffect(() => {
    const handleResize = () => { if (imageLoaded) renderDisplay(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [imageLoaded, renderDisplay]);

  // Convert screen coordinates to offscreen canvas coordinates
  const screenToCanvas = useCallback((clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return null;
    const cx = rect.width / 2 + pan.x;
    const cy = rect.height / 2 + pan.y;
    const canvasX = (x - cx) / zoom + offscreen.width / 2;
    const canvasY = (y - cy) / zoom + offscreen.height / 2;
    return { x: canvasX, y: canvasY };
  }, [zoom, pan]);

  // Save undo snapshot
  const saveUndoSnapshot = useCallback(() => {
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    const ctx = offscreen.getContext('2d');
    const snapshot = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > maxUndo) {
      undoStackRef.current.shift();
    }
    setCanUndo(true);
  }, [maxUndo]);

  // --- Brush eraser ---
  const eraseAt = useCallback((canvasX, canvasY) => {
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    const ctx = offscreen.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [brushSize]);

  const eraseLine = useCallback((from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = Math.max(1, brushSize / 4);
    const steps = Math.ceil(dist / step);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      eraseAt(from.x + dx * t, from.y + dy * t);
    }
  }, [eraseAt, brushSize]);

  // --- Magic wand ---
  const handleWandClick = useCallback((canvasX, canvasY) => {
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    saveUndoSnapshot();
    const ctx = offscreen.getContext('2d');
    const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    floodFillErase(imageData, canvasX, canvasY, tolerance);
    ctx.putImageData(imageData, 0, 0);
    renderDisplay();
  }, [tolerance, saveUndoSnapshot, renderDisplay]);

  // --- Bulk color erase ---
  const getColorAt = useCallback((canvasX, canvasY) => {
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return null;
    const ctx = offscreen.getContext('2d');
    const px = Math.floor(canvasX);
    const py = Math.floor(canvasY);
    if (px < 0 || px >= offscreen.width || py < 0 || py >= offscreen.height) return null;
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
  }, []);

  const executeBulkErase = useCallback(() => {
    if (!pickedColor) return;
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    saveUndoSnapshot();
    const ctx = offscreen.getContext('2d');
    const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    bulkColorErase(imageData, pickedColor.r, pickedColor.g, pickedColor.b, pickedColor.a, tolerance);
    ctx.putImageData(imageData, 0, 0);
    setShowBulkConfirm(false);
    setPickedColor(null);
    renderDisplay();
  }, [pickedColor, tolerance, saveUndoSnapshot, renderDisplay]);

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e) => {
    if (!imageLoaded) return;

    // Middle-click or alt+click for panning (any tool)
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    const canvasCoord = screenToCanvas(e.clientX, e.clientY);
    if (!canvasCoord) return;
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    if (canvasCoord.x < 0 || canvasCoord.x > offscreen.width ||
        canvasCoord.y < 0 || canvasCoord.y > offscreen.height) return;

    if (activeTool === 'wand') {
      handleWandClick(canvasCoord.x, canvasCoord.y);
    } else if (activeTool === 'bulk') {
      // Pick the color under the cursor
      const color = getColorAt(canvasCoord.x, canvasCoord.y);
      if (color && color.a > 0) {
        setPickedColor(color);
        setShowBulkConfirm(true);
      }
    } else if (activeTool === 'brush') {
      saveUndoSnapshot();
      isDrawingRef.current = true;
      lastPointRef.current = canvasCoord;
      eraseAt(canvasCoord.x, canvasCoord.y);
      renderDisplay();
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, [imageLoaded, pan, activeTool, screenToCanvas, handleWandClick, getColorAt, saveUndoSnapshot, eraseAt, renderDisplay]);

  const handlePointerMove = useCallback((e) => {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (isPanning && panStartRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawingRef.current || activeTool !== 'brush') return;

    const canvasCoord = screenToCanvas(e.clientX, e.clientY);
    if (!canvasCoord) return;
    if (lastPointRef.current) {
      eraseLine(lastPointRef.current, canvasCoord);
    } else {
      eraseAt(canvasCoord.x, canvasCoord.y);
    }
    lastPointRef.current = canvasCoord;
    renderDisplay();
  }, [isPanning, activeTool, screenToCanvas, eraseLine, eraseAt, renderDisplay]);

  const handlePointerUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, [isPanning]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(8, Math.max(0.25, prev * delta)));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Undo
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const snapshot = undoStackRef.current.pop();
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    const ctx = offscreen.getContext('2d');
    ctx.putImageData(snapshot, 0, 0);
    setCanUndo(undoStackRef.current.length > 0);
    renderDisplay();
  }, [renderDisplay]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === '[') {
        setBrushSize(prev => Math.max(5, prev - 5));
      } else if (e.key === ']') {
        setBrushSize(prev => Math.min(150, prev + 5));
      } else if (e.key === '1') {
        setActiveTool('wand');
      } else if (e.key === '2') {
        setActiveTool('bulk');
      } else if (e.key === '3') {
        setActiveTool('brush');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(8, prev * 1.25));
  const handleZoomOut = () => setZoom(prev => Math.max(0.25, prev / 1.25));
  const handleZoomFit = () => {
    if (!containerRef.current || !offscreenCanvasRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = offscreenCanvasRef.current.width;
    const h = offscreenCanvasRef.current.height;
    const fitZoom = Math.min((rect.width - 40) / w, (rect.height - 40) / h, 1);
    setZoom(Math.max(0.25, fitZoom));
    setPan({ x: 0, y: 0 });
  };

  // Done - export as PNG
  const handleDone = useCallback(() => {
    const offscreen = offscreenCanvasRef.current;
    if (!offscreen) return;
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      onComplete(url);
    }, 'image/png');
  }, [onComplete]);

  const brushScreenSize = brushSize * zoom;

  // Cursor style depends on tool
  const getCursorStyle = () => {
    if (isPanning) return 'grabbing';
    if (activeTool === 'brush') return 'none';
    if (activeTool === 'wand') return 'crosshair';
    if (activeTool === 'bulk') return 'crosshair';
    return 'default';
  };

  const toolButtons = [
    { id: 'wand', icon: 'mdi:magic-staff', label: 'Magic Wand', shortcut: '1', description: 'Click to erase connected region' },
    { id: 'bulk', icon: 'mdi:palette-swatch', label: 'Color Erase', shortcut: '2', description: 'Click a color, erase it everywhere' },
    { id: 'brush', icon: 'mdi:eraser', label: 'Brush', shortcut: '3', description: 'Paint to erase' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Left side - Back */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Icon icon="mdi:arrow-left" className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>

            {/* Tool switcher */}
            {toolButtons.map((tool) => (
              <button
                key={tool.id}
                onClick={() => { setActiveTool(tool.id); setShowBulkConfirm(false); setPickedColor(null); }}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
                  activeTool === tool.id
                    ? 'bg-idegy-navy/10 dark:bg-idegy-blue/20 text-idegy-navy dark:text-idegy-blue font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={`${tool.label} (${tool.shortcut}) — ${tool.description}`}
              >
                <Icon icon={tool.icon} className="w-4 h-4" />
                <span className="hidden md:inline text-sm">{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Center - Tool-specific controls */}
          <div className="flex items-center gap-2">
            {/* Tolerance slider (wand & bulk) */}
            {(activeTool === 'wand' || activeTool === 'bulk') && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Tolerance</span>
                <input
                  type="range"
                  min="0"
                  max="150"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="w-16 sm:w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  title={`Color tolerance: ${tolerance}`}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{tolerance}</span>
              </div>
            )}

            {/* Brush size slider (brush only) */}
            {activeTool === 'brush' && (
              <div className="flex items-center gap-1.5">
                <Icon icon="mdi:circle-outline" className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                <input
                  type="range"
                  min="5"
                  max="150"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-16 sm:w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  title={`Brush size: ${brushSize}px`}
                />
                <Icon icon="mdi:circle" className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 hidden sm:inline">{brushSize}px</span>
              </div>
            )}
          </div>

          {/* Right side - Undo, Zoom, Done */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Icon icon="mdi:undo" className="w-4 h-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>

            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>

            <button
              onClick={handleZoomOut}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Zoom out"
            >
              <Icon icon="mdi:magnify-minus" className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomFit}
              className="px-1.5 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Fit to view"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Zoom in"
            >
              <Icon icon="mdi:magnify-plus" className="w-4 h-4" />
            </button>

            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>

            <button
              onClick={handleDone}
              className="flex items-center gap-1 px-3 sm:px-4 py-1.5 bg-idegy-navy dark:bg-white text-white dark:text-idegy-navy rounded-lg hover:bg-idegy-navy-dark dark:hover:bg-gray-100"
            >
              <span className="hidden sm:inline">Done</span>
              <Icon icon="mdi:check" className="w-4 h-4 sm:hidden" />
              <Icon icon="mdi:arrow-right" className="w-4 h-4 hidden sm:block" />
            </button>
          </div>
        </div>
      </div>

      {/* Contextual help bar */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {activeTool === 'wand' && 'Click on any area to erase it and all connected pixels of similar color. Adjust tolerance for broader/narrower matching.'}
          {activeTool === 'bulk' && 'Click a color to select it, then confirm to erase ALL matching pixels across the entire image.'}
          {activeTool === 'brush' && 'Click and drag to paint-erase. Use [ ] to resize. Alt+drag to pan.'}
        </p>
      </div>

      {/* Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-200 dark:bg-gray-900"
        style={{
          cursor: getCursorStyle(),
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas
          ref={displayCanvasRef}
          className="absolute inset-0"
        />

        {/* Brush cursor (brush tool only) */}
        {cursorPos && !isPanning && imageLoaded && activeTool === 'brush' && (
          <div
            style={{
              position: 'absolute',
              left: cursorPos.x - brushScreenSize / 2,
              top: cursorPos.y - brushScreenSize / 2,
              width: brushScreenSize,
              height: brushScreenSize,
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.8)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {/* Bulk erase confirmation dialog */}
        {showBulkConfirm && pickedColor && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ pointerEvents: 'none' }}>
            <div
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-black/50 border border-gray-200 dark:border-gray-700 p-6 max-w-sm mx-4"
              style={{ pointerEvents: 'auto' }}
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Erase this color everywhere?</h3>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-lg border-2 border-gray-300 dark:border-gray-600"
                  style={{
                    backgroundColor: `rgba(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b}, ${pickedColor.a / 255})`,
                  }}
                />
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div>RGB({pickedColor.r}, {pickedColor.g}, {pickedColor.b})</div>
                  <div>Tolerance: {tolerance}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500 dark:text-gray-400">Tolerance</span>
                <input
                  type="range"
                  min="0"
                  max="150"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{tolerance}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowBulkConfirm(false); setPickedColor(null); }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBulkErase}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
                >
                  Erase All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-idegy-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading image...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RasterCleanupEditor;
