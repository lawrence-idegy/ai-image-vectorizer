import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

/**
 * MaskCanvas - HTML5 Canvas for pixel-level mask manipulation
 * Handles rendering the source image and mask overlay
 */
const MaskCanvas = forwardRef(({
  imageSrc,
  activeTool,
  toolSettings,
  onMaskChange,
  maskOverlayOpacity = 0.5
}, ref) => {
  const containerRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const [imageData, setImageData] = useState(null);
  const [maskData, setMaskData] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState(null);
  const [scale, setScale] = useState(1);

  // Marching ants animation
  const [dashOffset, setDashOffset] = useState(0);
  const animationRef = useRef(null);

  // Load image and initialize canvases
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      setDimensions({ width, height });

      // Calculate scale to fit container
      const container = containerRef.current;
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight || 500;
        const scaleX = containerWidth / width;
        const scaleY = containerHeight / height;
        setScale(Math.min(scaleX, scaleY, 1));
      }

      // Initialize image canvas
      const imageCanvas = imageCanvasRef.current;
      imageCanvas.width = width;
      imageCanvas.height = height;
      const imageCtx = imageCanvas.getContext('2d');
      imageCtx.drawImage(img, 0, 0);
      setImageData(imageCtx.getImageData(0, 0, width, height));

      // Initialize mask canvas (all zeros = nothing selected)
      const maskCanvas = maskCanvasRef.current;
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.clearRect(0, 0, width, height);

      // Initialize mask data array
      const newMaskData = new Uint8Array(width * height);
      setMaskData(newMaskData);

      // Initialize overlay canvas
      const overlayCanvas = overlayCanvasRef.current;
      overlayCanvas.width = width;
      overlayCanvas.height = height;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Marching ants animation
  useEffect(() => {
    const animate = () => {
      setDashOffset(prev => (prev + 1) % 16);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Render mask overlay
  const renderOverlay = useCallback(() => {
    if (!maskData || !overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;

    ctx.clearRect(0, 0, width, height);

    // Create overlay image data
    const overlayData = ctx.createImageData(width, height);

    for (let i = 0; i < maskData.length; i++) {
      const idx = i * 4;
      if (maskData[i] > 0) {
        // Red overlay for selected areas (to be removed)
        overlayData.data[idx] = 255;     // R
        overlayData.data[idx + 1] = 0;   // G
        overlayData.data[idx + 2] = 0;   // B
        overlayData.data[idx + 3] = Math.floor(maskData[i] * maskOverlayOpacity); // A
      }
    }

    ctx.putImageData(overlayData, 0, 0);

    // Draw marching ants border around selection
    drawMarchingAnts(ctx);
  }, [maskData, dimensions, maskOverlayOpacity, dashOffset]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  // Draw marching ants around selection edges
  const drawMarchingAnts = (ctx) => {
    if (!maskData) return;
    const { width, height } = dimensions;

    // Find edge pixels
    const edges = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (maskData[idx] > 127) {
          // Check if this is an edge pixel
          const isEdge =
            x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
            maskData[idx - 1] <= 127 || maskData[idx + 1] <= 127 ||
            maskData[idx - width] <= 127 || maskData[idx + width] <= 127;

          if (isEdge) {
            edges.push({ x, y });
          }
        }
      }
    }

    if (edges.length === 0) return;

    // Draw marching ants
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = dashOffset;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    edges.forEach(({ x, y }) => {
      ctx.strokeRect(x, y, 1, 1);
    });

    ctx.strokeStyle = '#fff';
    ctx.lineDashOffset = dashOffset + 4;
    edges.forEach(({ x, y }) => {
      ctx.strokeRect(x, y, 1, 1);
    });

    ctx.restore();
  };

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e) => {
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    return { x, y };
  };

  // Handle mouse down
  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoords(e);
    if (x < 0 || y < 0 || x >= dimensions.width || y >= dimensions.height) return;

    setIsDrawing(true);
    setLastPoint({ x, y });

    if (activeTool === 'magicWand') {
      performMagicWand(x, y, e.shiftKey, e.altKey);
    } else if (activeTool === 'brush' || activeTool === 'eraser') {
      paintAt(x, y);
    } else if (activeTool === 'lasso') {
      startLasso(x, y);
    }
  };

  // Handle mouse move
  const handleMouseMove = (e) => {
    if (!isDrawing) return;

    const { x, y } = getCanvasCoords(e);
    if (x < 0 || y < 0 || x >= dimensions.width || y >= dimensions.height) return;

    if (activeTool === 'brush' || activeTool === 'eraser') {
      paintLine(lastPoint.x, lastPoint.y, x, y);
      setLastPoint({ x, y });
    } else if (activeTool === 'lasso') {
      continueLasso(x, y);
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    if (activeTool === 'lasso' && isDrawing) {
      closeLasso();
    }
    setIsDrawing(false);
    setLastPoint(null);

    if (onMaskChange && maskData) {
      onMaskChange(maskData);
    }
  };

  // Magic Wand - Flood fill selection
  const performMagicWand = (startX, startY, addToSelection, subtractFromSelection) => {
    if (!imageData || !maskData) return;

    const { width, height } = dimensions;
    const tolerance = toolSettings?.tolerance || 32;
    const contiguous = toolSettings?.contiguous !== false;

    const pixels = imageData.data;
    const startIdx = (startY * width + startX) * 4;
    const targetColor = {
      r: pixels[startIdx],
      g: pixels[startIdx + 1],
      b: pixels[startIdx + 2]
    };

    const newMask = addToSelection ? new Uint8Array(maskData) : new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);

    const colorDistance = (idx) => {
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      return Math.sqrt(
        Math.pow(r - targetColor.r, 2) +
        Math.pow(g - targetColor.g, 2) +
        Math.pow(b - targetColor.b, 2)
      );
    };

    if (contiguous) {
      // Flood fill from start point
      const queue = [[startX, startY]];

      while (queue.length > 0) {
        const [x, y] = queue.shift();
        const idx = y * width + x;

        if (visited[idx]) continue;
        visited[idx] = 1;

        const pixelIdx = idx * 4;
        if (colorDistance(pixelIdx) <= tolerance) {
          if (subtractFromSelection) {
            newMask[idx] = 0;
          } else {
            newMask[idx] = 255;
          }

          // Add neighbors
          if (x > 0) queue.push([x - 1, y]);
          if (x < width - 1) queue.push([x + 1, y]);
          if (y > 0) queue.push([x, y - 1]);
          if (y < height - 1) queue.push([x, y + 1]);
        }
      }
    } else {
      // Select all similar colors
      for (let i = 0; i < width * height; i++) {
        if (colorDistance(i * 4) <= tolerance) {
          if (subtractFromSelection) {
            newMask[i] = 0;
          } else {
            newMask[i] = 255;
          }
        }
      }
    }

    setMaskData(newMask);
  };

  // Brush - Paint at single point
  const paintAt = (x, y) => {
    if (!maskData) return;

    const { width, height } = dimensions;
    const brushSize = toolSettings?.brushSize || 20;
    const hardness = toolSettings?.hardness || 100;
    const isEraser = activeTool === 'eraser';

    const newMask = new Uint8Array(maskData);
    const radius = brushSize / 2;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.floor(x + dx);
        const py = Math.floor(y + dy);

        if (px < 0 || px >= width || py < 0 || py >= height) continue;

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;

        const idx = py * width + px;

        // Calculate opacity based on hardness and distance
        let opacity = 255;
        if (hardness < 100) {
          const softness = 1 - hardness / 100;
          const falloff = 1 - (distance / radius) * softness;
          opacity = Math.floor(255 * Math.max(0, falloff));
        }

        if (isEraser) {
          newMask[idx] = Math.max(0, newMask[idx] - opacity);
        } else {
          newMask[idx] = Math.min(255, Math.max(newMask[idx], opacity));
        }
      }
    }

    setMaskData(newMask);
  };

  // Brush - Paint line between two points
  const paintLine = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(distance / 2));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(x1 + dx * t);
      const y = Math.floor(y1 + dy * t);
      paintAt(x, y);
    }
  };

  // Lasso - Track points for polygon
  const lassoPointsRef = useRef([]);

  const startLasso = (x, y) => {
    lassoPointsRef.current = [{ x, y }];
    drawLassoPreview();
  };

  const continueLasso = (x, y) => {
    lassoPointsRef.current.push({ x, y });
    drawLassoPreview();
  };

  const drawLassoPreview = () => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');

    renderOverlay();

    if (lassoPointsRef.current.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);

    for (let i = 1; i < lassoPointsRef.current.length; i++) {
      ctx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const closeLasso = () => {
    if (lassoPointsRef.current.length < 3) {
      lassoPointsRef.current = [];
      return;
    }

    // Rasterize polygon to mask
    const { width, height } = dimensions;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.fillStyle = 'white';
    tempCtx.beginPath();
    tempCtx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);
    for (let i = 1; i < lassoPointsRef.current.length; i++) {
      tempCtx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y);
    }
    tempCtx.closePath();
    tempCtx.fill();

    const tempData = tempCtx.getImageData(0, 0, width, height);
    const newMask = new Uint8Array(maskData);

    for (let i = 0; i < width * height; i++) {
      if (tempData.data[i * 4] > 0) {
        newMask[i] = 255;
      }
    }

    setMaskData(newMask);
    lassoPointsRef.current = [];
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getMaskData: () => maskData,
    getMaskDataURL: () => {
      if (!maskData) return null;

      const { width, height } = dimensions;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(width, height);

      for (let i = 0; i < maskData.length; i++) {
        const idx = i * 4;
        imgData.data[idx] = maskData[i];
        imgData.data[idx + 1] = maskData[i];
        imgData.data[idx + 2] = maskData[i];
        imgData.data[idx + 3] = 255;
      }

      ctx.putImageData(imgData, 0, 0);
      return canvas.toDataURL('image/png');
    },
    clearMask: () => {
      if (!dimensions.width) return;
      const newMask = new Uint8Array(dimensions.width * dimensions.height);
      setMaskData(newMask);
    },
    invertMask: () => {
      if (!maskData) return;
      const newMask = new Uint8Array(maskData.length);
      for (let i = 0; i < maskData.length; i++) {
        newMask[i] = 255 - maskData[i];
      }
      setMaskData(newMask);
    },
    getImageData: () => imageData,
    getDimensions: () => dimensions
  }));

  const displayWidth = dimensions.width * scale;
  const displayHeight = dimensions.height * scale;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-gray-900 overflow-hidden"
      style={{ minHeight: '400px' }}
    >
      {/* Checkerboard background for transparency */}
      <div
        className="absolute"
        style={{
          width: displayWidth,
          height: displayHeight,
          backgroundImage: `
            linear-gradient(45deg, #ccc 25%, transparent 25%),
            linear-gradient(-45deg, #ccc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #ccc 75%),
            linear-gradient(-45deg, transparent 75%, #ccc 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        }}
      />

      {/* Source image canvas */}
      <canvas
        ref={imageCanvasRef}
        className="absolute"
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated'
        }}
      />

      {/* Hidden mask canvas (for data storage) */}
      <canvas
        ref={maskCanvasRef}
        className="hidden"
      />

      {/* Visible overlay canvas (for interaction) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute cursor-crosshair"
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
});

MaskCanvas.displayName = 'MaskCanvas';

export default MaskCanvas;
