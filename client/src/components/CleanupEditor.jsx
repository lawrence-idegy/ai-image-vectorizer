import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

// Convert color to human-readable name
function getColorName(color) {
  if (!color || color === 'none' || color === 'transparent') {
    return 'Transparent';
  }
  if (color.startsWith('url(')) {
    return 'Gradient/Pattern';
  }

  // Convert to lowercase for matching
  const c = color.toLowerCase().trim();

  // Check for common color names
  if (c === 'white' || c === '#fff' || c === '#ffffff' || c === 'rgb(255, 255, 255)' || c === 'rgb(255,255,255)') {
    return 'White';
  }
  if (c === 'black' || c === '#000' || c === '#000000' || c === 'rgb(0, 0, 0)' || c === 'rgb(0,0,0)') {
    return 'Black';
  }

  // Parse hex colors
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    let r, g, b;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }

    // Determine color name based on RGB values
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2 / 255;

    if (lightness > 0.95) return 'White';
    if (lightness < 0.05) return 'Black';
    if (lightness > 0.7 && max - min < 30) return 'Light Gray';
    if (lightness < 0.3 && max - min < 30) return 'Dark Gray';
    if (max - min < 30) return 'Gray';

    // Determine hue
    if (r > g && r > b) {
      if (g > b) return r > 200 ? 'Orange' : 'Brown';
      return 'Red';
    }
    if (g > r && g > b) {
      if (r > b) return 'Yellow-Green';
      return 'Green';
    }
    if (b > r && b > g) {
      if (r > g) return 'Purple';
      return 'Blue';
    }
    if (r === g && g > b) return 'Yellow';
    if (r === b && r > g) return 'Magenta';
    if (g === b && g > r) return 'Cyan';

    return color;
  }

  // Parse rgb() colors
  const rgbMatch = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);

    if (r > 240 && g > 240 && b > 240) return 'White';
    if (r < 15 && g < 15 && b < 15) return 'Black';
    if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) return 'Gray';
    if (r > g && r > b) return 'Red';
    if (g > r && g > b) return 'Green';
    if (b > r && b > g) return 'Blue';
  }

  return color;
}

function CleanupEditor({ svgContent, onComplete, onBack }) {
  const containerRef = useRef(null);
  const [selectedElements, setSelectedElements] = useState(new Set());
  const [hiddenElements, setHiddenElements] = useState(new Set());
  const [colorChanges, setColorChanges] = useState({}); // { elementId: newColor }
  const [history, setHistory] = useState([]);
  const [svgElements, setSvgElements] = useState([]);
  const [parsedSvg, setParsedSvg] = useState(null);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [opacityChanges, setOpacityChanges] = useState({}); // { elementId: opacity (0-1) }
  const [currentOpacity, setCurrentOpacity] = useState(1); // For the slider
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle

  // Marquee drag-to-select state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null); // { x, y } in container coords
  const [dragEnd, setDragEnd] = useState(null);
  const dragThreshold = 5; // px movement before it counts as a drag vs click
  const canvasAreaRef = useRef(null);

  // Preset colors for quick selection
  const presetColors = [
    { name: 'No Fill (transparent)', value: 'transparent' },
    { name: 'White', value: '#ffffff' },
    { name: 'Black', value: '#000000' },
    { name: 'Red', value: '#ff0000' },
    { name: 'Green', value: '#00ff00' },
    { name: 'Blue', value: '#0000ff' },
    { name: 'Yellow', value: '#ffff00' },
    { name: 'Cyan', value: '#00ffff' },
    { name: 'Magenta', value: '#ff00ff' },
  ];

  // Find elements that overlap with a given element (for "punch through" selection)
  // Only finds elements of SIMILAR size and position (not parent containers)
  const findOverlappingElements = (elementId) => {
    // Use the rendered SVG in the container to get accurate bounding boxes
    if (!containerRef.current) return [];

    const renderedSvg = containerRef.current.querySelector('svg');
    if (!renderedSvg) return [];

    const targetNode = renderedSvg.querySelector(`[data-element-id="${elementId}"]`);
    if (!targetNode) return [];

    try {
      const targetBBox = targetNode.getBBox();
      if (!targetBBox || targetBBox.width === 0) return [];

      // Find center point of target
      const targetCenterX = targetBBox.x + targetBBox.width / 2;
      const targetCenterY = targetBBox.y + targetBBox.height / 2;
      const targetArea = targetBBox.width * targetBBox.height;

      // Find all elements that are similar in size AND position
      const overlapping = [];

      svgElements.forEach(el => {
        if (el.id === elementId) return; // Skip self
        if (hiddenElements.has(el.id)) return; // Skip hidden

        const node = renderedSvg.querySelector(`[data-element-id="${el.id}"]`);
        if (!node) return;

        try {
          const bbox = node.getBBox();
          if (!bbox || bbox.width === 0) return;

          const elCenterX = bbox.x + bbox.width / 2;
          const elCenterY = bbox.y + bbox.height / 2;
          const elArea = bbox.width * bbox.height;

          // Check if centers are close (within 50% of target size)
          const maxCenterDistance = Math.max(targetBBox.width, targetBBox.height) * 0.5;
          const centerDistance = Math.sqrt(
            Math.pow(targetCenterX - elCenterX, 2) +
            Math.pow(targetCenterY - elCenterY, 2)
          );

          // Check if sizes are similar (within 3x of each other)
          const sizeRatio = Math.max(targetArea, elArea) / Math.min(targetArea, elArea);
          const isSimilarSize = sizeRatio < 3;

          // Element must have similar center AND similar size
          const isSimilarPosition = centerDistance < maxCenterDistance;

          if (isSimilarPosition && isSimilarSize) {
            overlapping.push(el.id);
          }
        } catch (e) {
          // Skip elements that can't compute bbox
        }
      });

      return overlapping;
    } catch (e) {
      console.error('Error finding overlapping elements:', e);
      return [];
    }
  };

  // Select element and all overlapping elements (punch through)
  const handleSelectStack = () => {
    if (selectedElements.size === 0) return;

    const allOverlapping = new Set(selectedElements);
    selectedElements.forEach(id => {
      const overlapping = findOverlappingElements(id);
      overlapping.forEach(oid => allOverlapping.add(oid));
    });

    setSelectedElements(allOverlapping);
  };

  // --- Marquee drag-to-select logic ---
  const handleCanvasMouseDown = (e) => {
    // Only respond to left mouse button on the canvas background or SVG elements
    if (e.button !== 0) return;
    // Don't start drag if clicking on a button or the sidebar
    if (e.target.closest('button') || e.target.closest('.elements-panel')) return;

    const rect = canvasAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragStart({ x, y });
    setDragEnd({ x, y });
    setIsDragging(false); // Not dragging yet, might be a click
  };

  const handleCanvasMouseMove = (e) => {
    if (!dragStart) return;

    const rect = canvasAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if movement exceeds threshold to start a drag
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    if (!isDragging && Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
      setIsDragging(true);
    }

    setDragEnd({ x, y });
  };

  // Compute normalized rectangle from two points
  const getSelectionRect = (start, end) => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    return { x, y, width, height };
  };

  // Refs to avoid stale closures in mouseup handler
  const dragStateRef = useRef({});
  const svgElementsRef = useRef(svgElements);
  const hiddenElementsRef = useRef(hiddenElements);
  const selectedElementsRef = useRef(selectedElements);

  useEffect(() => { dragStateRef.current = { dragStart, isDragging, dragEnd }; }, [dragStart, isDragging, dragEnd]);
  useEffect(() => { svgElementsRef.current = svgElements; }, [svgElements]);
  useEffect(() => { hiddenElementsRef.current = hiddenElements; }, [hiddenElements]);
  useEffect(() => { selectedElementsRef.current = selectedElements; }, [selectedElements]);

  const handleCanvasMouseUp = (e) => {
    const { dragStart: ds, isDragging: dragging, dragEnd: de } = dragStateRef.current;
    if (!ds) return;

    if (dragging && de) {
      const selRect = getSelectionRect(ds, de);
      const renderedSvg = containerRef.current?.querySelector('svg');

      if (renderedSvg && canvasAreaRef.current) {
        const canvasRect = canvasAreaRef.current.getBoundingClientRect();

        // Convert selection rectangle from canvas coords to page coords
        const selPageLeft = canvasRect.left + selRect.x;
        const selPageTop = canvasRect.top + selRect.y;
        const selPageRight = selPageLeft + selRect.width;
        const selPageBottom = selPageTop + selRect.height;

        const newSelected = new Set(e.shiftKey ? selectedElementsRef.current : []);

        svgElementsRef.current.forEach(el => {
          if (hiddenElementsRef.current.has(el.id)) return;
          const node = renderedSvg.querySelector(`[data-element-id="${el.id}"]`);
          if (!node) return;

          try {
            const elRect = node.getBoundingClientRect();
            if (
              elRect.right > selPageLeft &&
              elRect.left < selPageRight &&
              elRect.bottom > selPageTop &&
              elRect.top < selPageBottom
            ) {
              newSelected.add(el.id);
            }
          } catch (err) {
            // Skip elements that can't compute rect
          }
        });

        setSelectedElements(newSelected);
      }
    }

    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
  };

  // Cancel drag if mouse leaves the canvas area
  const handleCanvasMouseLeave = () => {
    // Let the drag complete on mouse up even outside
  };

  // Attach global mouseup to handle drag ending outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = (e) => {
      if (dragStateRef.current.dragStart) {
        handleCanvasMouseUp(e);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showColorPicker && !e.target.closest('.color-picker-container')) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showColorPicker]);

  // Parse SVG and extract elements on mount
  useEffect(() => {
    if (!svgContent) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) return;

    // Force SVG to have transparent background
    svg.style.background = 'none';
    svg.style.backgroundColor = 'transparent';

    // Remove any embedded style tags that might set background
    svg.querySelectorAll('style').forEach(styleEl => {
      styleEl.textContent = styleEl.textContent.replace(/background[^;]*;?/gi, '');
    });

    // Check for a white/light-colored rect at the very start - likely a background
    const firstChild = svg.querySelector('rect, path');
    if (firstChild && firstChild.tagName === 'rect') {
      const fill = firstChild.getAttribute('fill') || '';
      const fillLower = fill.toLowerCase();
      // If it's white or very light, it's probably a background rect
      if (fillLower === '#fff' || fillLower === '#ffffff' || fillLower === 'white' ||
          fillLower === 'rgb(255,255,255)' || fillLower === 'rgb(255, 255, 255)') {
        // Mark it clearly as background
        firstChild.setAttribute('data-is-background', 'true');
      }
    }

    setParsedSvg(svg);

    // Find all drawable elements
    const elements = [];
    const selectors = 'path, polygon, polyline, rect, circle, ellipse, line, g';
    const nodes = svg.querySelectorAll(selectors);

    nodes.forEach((node, index) => {
      // Skip groups that just contain other elements
      if (node.tagName === 'g' && node.children.length > 0) return;

      // Get fill color for display
      const fill = node.getAttribute('fill') ||
                   getComputedStyle(node).fill ||
                   'unknown';

      const stroke = node.getAttribute('stroke') || 'none';

      // Try to get bounding box for size info
      let size = 'unknown';
      try {
        const bbox = node.getBBox?.();
        if (bbox) {
          const area = bbox.width * bbox.height;
          if (area > 100000) size = 'large';
          else if (area > 10000) size = 'medium';
          else size = 'small';
        }
      } catch (e) {}

      // Generate descriptive name based on color
      const colorName = getColorName(fill);
      const strokeName = stroke !== 'none' ? getColorName(stroke) : null;

      let label = colorName;
      if (strokeName && fill === 'none') {
        label = `${strokeName} outline`;
      } else if (strokeName) {
        label = `${colorName} with ${strokeName} stroke`;
      }

      // Flag first large rectangle as likely background
      if (index === 0 && node.tagName === 'rect' && size === 'large') {
        label = `${colorName} (BACKGROUND)`;
      } else if (index === 0 && size === 'large') {
        label = `${colorName} (likely bg)`;
      }

      elements.push({
        id: `element-${index}`,
        node: node,
        tagName: node.tagName,
        fill: fill,
        stroke: stroke,
        index: index,
        size: size,
        label: label
      });

      // Add data attribute for selection
      node.setAttribute('data-element-id', `element-${index}`);
      node.style.cursor = 'pointer';
    });

    setSvgElements(elements);
  }, [svgContent]);

  // Render SVG with click handlers
  useEffect(() => {
    if (!containerRef.current || !parsedSvg) return;

    // Clone the SVG for rendering
    const svgClone = parsedSvg.cloneNode(true);

    // Apply hidden state - actually REMOVE elements from the clone
    hiddenElements.forEach(id => {
      const el = svgClone.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        el.remove(); // Actually remove, not just hide
      }
    });

    // Apply color changes
    Object.entries(colorChanges).forEach(([id, newColor]) => {
      const el = svgClone.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        if (newColor === 'none') {
          el.setAttribute('fill', 'none');
          el.style.fill = 'none';
        } else {
          el.setAttribute('fill', newColor);
          el.style.fill = newColor;
        }
      }
    });

    // Apply opacity changes
    Object.entries(opacityChanges).forEach(([id, opacity]) => {
      const el = svgClone.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        el.style.opacity = opacity;
      }
    });

    // Apply selection styling
    selectedElements.forEach(id => {
      const el = svgClone.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        el.style.outline = '3px solid #0076CE';
        el.style.outlineOffset = '2px';
      }
    });

    // Apply hover highlight (bright red pulsing outline)
    if (hoveredElement) {
      const el = svgClone.querySelector(`[data-element-id="${hoveredElement}"]`);
      if (el) {
        el.style.outline = '4px solid #ff0000';
        el.style.outlineOffset = '3px';
        el.style.filter = 'drop-shadow(0 0 8px #ff0000)';
      }
    }

    // Set viewBox and size - make it large
    svgClone.setAttribute('width', '100%');
    svgClone.setAttribute('height', '100%');
    svgClone.style.maxWidth = '800px';
    svgClone.style.maxHeight = '600px';
    svgClone.style.width = 'auto';
    svgClone.style.height = 'auto';

    // FORCE transparent background on SVG
    svgClone.style.background = 'transparent';
    svgClone.style.backgroundColor = 'transparent';
    svgClone.removeAttribute('fill'); // Remove any default fill

    // Clear and append
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(svgClone);

    // Add click handlers - only for single-element clicks, not drag selections
    const handleClick = (e) => {
      // If a drag just completed, don't process as a click
      if (isDragging) return;

      const elementId = e.target.getAttribute('data-element-id');
      if (!elementId) return;

      e.stopPropagation();

      setSelectedElements(prev => {
        const next = new Set(prev);
        if (e.shiftKey) {
          // Shift+click adds/removes from selection
          if (next.has(elementId)) {
            next.delete(elementId);
          } else {
            next.add(elementId);
          }
        } else {
          // Regular click toggles single element
          if (next.has(elementId)) {
            next.delete(elementId);
          } else {
            next.add(elementId);
          }
        }
        return next;
      });
    };

    svgClone.addEventListener('click', handleClick);

    return () => {
      svgClone.removeEventListener('click', handleClick);
    };
  }, [parsedSvg, hiddenElements, selectedElements, hoveredElement, colorChanges, opacityChanges, isDragging]);

  const handleDeleteSelected = () => {
    if (selectedElements.size === 0) return;

    // Save to history for undo
    setHistory(prev => [...prev, { type: 'delete', elements: new Set(selectedElements) }]);

    // Hide selected elements
    setHiddenElements(prev => {
      const next = new Set(prev);
      selectedElements.forEach(id => next.add(id));
      return next;
    });

    // Clear selection
    setSelectedElements(new Set());
  };

  const handleChangeColor = (newColor) => {
    if (selectedElements.size === 0) return;

    // Convert 'transparent' to 'none' for SVG fill
    const fillValue = newColor === 'transparent' ? 'none' : newColor;

    // Save previous colors to history for undo
    const previousColors = {};
    selectedElements.forEach(id => {
      const el = svgElements.find(e => e.id === id);
      if (el) {
        previousColors[id] = colorChanges[id] || el.fill;
      }
    });

    setHistory(prev => [...prev, { type: 'colorChange', previousColors }]);

    // Apply new color
    setColorChanges(prev => {
      const next = { ...prev };
      selectedElements.forEach(id => {
        next[id] = fillValue;
      });
      return next;
    });

    // Update element labels in state to reflect new color
    setSvgElements(prev => prev.map(el => {
      if (selectedElements.has(el.id)) {
        const colorName = getColorName(fillValue);
        return { ...el, fill: fillValue, label: colorName };
      }
      return el;
    }));

    setShowColorPicker(false);
    setSelectedElements(new Set());
  };

  const handleChangeOpacity = (opacity) => {
    if (selectedElements.size === 0) return;

    // Save previous opacities to history for undo
    const previousOpacities = {};
    selectedElements.forEach(id => {
      previousOpacities[id] = opacityChanges[id] !== undefined ? opacityChanges[id] : 1;
    });

    setHistory(prev => [...prev, { type: 'opacityChange', previousOpacities }]);

    // Apply new opacity
    setOpacityChanges(prev => {
      const next = { ...prev };
      selectedElements.forEach(id => {
        next[id] = opacity;
      });
      return next;
    });
  };

  const handleUndo = () => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];

    if (lastAction.type === 'delete') {
      // Restore hidden elements
      setHiddenElements(prev => {
        const next = new Set(prev);
        lastAction.elements.forEach(id => next.delete(id));
        return next;
      });
    } else if (lastAction.type === 'colorChange') {
      // Restore previous colors
      setColorChanges(prev => {
        const next = { ...prev };
        Object.entries(lastAction.previousColors).forEach(([id, oldColor]) => {
          // If the old color was the original, remove from colorChanges
          const el = svgElements.find(e => e.id === id);
          if (el && el.fill === oldColor) {
            delete next[id];
          } else {
            next[id] = oldColor;
          }
        });
        return next;
      });

      // Update labels
      setSvgElements(prev => prev.map(el => {
        if (lastAction.previousColors[el.id]) {
          const oldColor = lastAction.previousColors[el.id];
          const colorName = getColorName(oldColor);
          return { ...el, fill: oldColor, label: colorName };
        }
        return el;
      }));
    } else if (lastAction.type === 'opacityChange') {
      // Restore previous opacities
      setOpacityChanges(prev => {
        const next = { ...prev };
        Object.entries(lastAction.previousOpacities).forEach(([id, oldOpacity]) => {
          if (oldOpacity === 1) {
            delete next[id];
          } else {
            next[id] = oldOpacity;
          }
        });
        return next;
      });
    }

    // Remove from history
    setHistory(prev => prev.slice(0, -1));
  };

  const handleSelectAll = () => {
    const visibleElements = svgElements
      .filter(el => !hiddenElements.has(el.id))
      .map(el => el.id);
    setSelectedElements(new Set(visibleElements));
  };

  const handleDeselectAll = () => {
    setSelectedElements(new Set());
  };

  const handleComplete = () => {
    if (!parsedSvg) {
      onComplete(svgContent);
      return;
    }

    // Create final SVG with hidden elements removed and colors changed
    const finalSvg = parsedSvg.cloneNode(true);

    // Remove hidden elements
    hiddenElements.forEach(id => {
      const el = finalSvg.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        el.remove();
      }
    });

    // Apply color changes
    Object.entries(colorChanges).forEach(([id, newColor]) => {
      const el = finalSvg.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        el.setAttribute('fill', newColor);
      }
    });

    // Apply opacity changes
    Object.entries(opacityChanges).forEach(([id, opacity]) => {
      const el = finalSvg.querySelector(`[data-element-id="${id}"]`);
      if (el) {
        // If opacity is 0, remove the element entirely for cleaner SVG
        if (opacity === 0) {
          el.remove();
        } else if (opacity < 1) {
          el.setAttribute('opacity', opacity);
        }
      }
    });

    // Remove our data attributes and inline styles
    finalSvg.querySelectorAll('[data-element-id]').forEach(el => {
      el.removeAttribute('data-element-id');
      el.style.cursor = '';
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.fill = ''; // Remove inline style, keep attribute
      el.style.filter = '';
      el.style.opacity = ''; // Remove inline opacity, keep attribute
    });

    // Serialize back to string
    const serializer = new XMLSerializer();
    const finalContent = serializer.serializeToString(finalSvg);

    onComplete(finalContent);
  };

  // Get color preview for element
  const getColorPreview = (fill) => {
    if (!fill || fill === 'none' || fill === 'transparent') {
      return 'transparent';
    }
    if (fill.startsWith('url(')) {
      return '#888'; // Gradient or pattern
    }
    return fill;
  };

  // Sort by size (large first - likely backgrounds) and filter hidden
  const visibleElements = svgElements
    .filter(el => !hiddenElements.has(el.id))
    .sort((a, b) => {
      const sizeOrder = { large: 0, medium: 1, small: 2, unknown: 3 };
      return (sizeOrder[a.size] || 3) - (sizeOrder[b.size] || 3);
    });

  // Group elements by color label for quick selection
  const colorGroups = visibleElements.reduce((groups, el) => {
    const colorLabel = el.label || 'Unknown';
    if (!groups[colorLabel]) {
      groups[colorLabel] = { elements: [], fill: el.fill, largeElements: [], smallElements: [] };
    }
    groups[colorLabel].elements.push(el.id);
    if (el.size === 'large') {
      groups[colorLabel].largeElements.push(el.id);
    } else {
      groups[colorLabel].smallElements.push(el.id);
    }
    return groups;
  }, {});

  const handleSelectByColor = (colorLabel, sizeFilter = 'all') => {
    const group = colorGroups[colorLabel];
    if (group) {
      let elementsToToggle = group.elements;
      if (sizeFilter === 'large') elementsToToggle = group.largeElements;
      if (sizeFilter === 'small') elementsToToggle = group.smallElements;

      setSelectedElements(prev => {
        const next = new Set(prev);
        // If all are already selected, deselect them
        const allSelected = elementsToToggle.every(id => next.has(id));
        if (allSelected) {
          elementsToToggle.forEach(id => next.delete(id));
        } else {
          elementsToToggle.forEach(id => next.add(id));
        }
        return next;
      });
    }
  };

  // Auto-remove likely background elements (large rectangles at the start)
  const handleRemoveBackgrounds = () => {
    const backgroundElements = svgElements.filter(el =>
      !hiddenElements.has(el.id) &&
      (el.size === 'large' || el.tagName === 'rect') &&
      el.index < 5 // Only check first few elements
    );

    if (backgroundElements.length === 0) return;

    const idsToHide = backgroundElements.map(el => el.id);

    setHistory(prev => [...prev, { type: 'delete', elements: new Set(idsToHide) }]);
    setHiddenElements(prev => {
      const next = new Set(prev);
      idsToHide.forEach(id => next.add(id));
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left side - Back button and info (hidden on mobile) */}
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Icon icon="mdi:arrow-left" className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <span className="hidden md:inline text-gray-300 dark:text-gray-600">|</span>
            <span className="hidden md:inline text-sm text-gray-600 dark:text-gray-400">
              Click or drag to select elements, then delete unwanted parts
            </span>
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Undo (restore deleted)"
            >
              <Icon icon="mdi:undo" className="w-4 h-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedElements.size === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete selected"
            >
              <Icon icon="mdi:delete" className="w-4 h-4" />
              Delete ({selectedElements.size})
            </button>
            <button
              onClick={handleSelectStack}
              disabled={selectedElements.size === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Select all elements stacked at the same position (to delete holes completely)"
            >
              <Icon icon="mdi:layers-triple" className="w-4 h-4" />
              <span className="hidden sm:inline">+ Stack</span>
            </button>

            {/* Color Change Dropdown */}
            <div className="relative color-picker-container">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                disabled={selectedElements.size === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon icon="mdi:palette" className="w-4 h-4" />
                <span className="hidden sm:inline">Recolor</span>
              </button>

              {showColorPicker && selectedElements.size > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-black/40 border border-gray-200 dark:border-gray-700 p-3 z-50 min-w-[180px]">
                  {/* Opacity Slider */}
                  <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Opacity:</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={currentOpacity * 100}
                        onChange={(e) => setCurrentOpacity(e.target.value / 100)}
                        className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-8">{Math.round(currentOpacity * 100)}%</span>
                    </div>
                    <button
                      onClick={() => {
                        handleChangeOpacity(currentOpacity);
                        setShowColorPicker(false);
                        setSelectedElements(new Set());
                      }}
                      className="w-full mt-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300"
                    >
                      Apply Opacity
                    </button>
                  </div>

                  {/* Color Options */}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Preset colors:</p>
                  <div className="grid grid-cols-3 gap-1">
                    {presetColors.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => handleChangeColor(color.value)}
                        className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400 transition-colors"
                        style={{
                          backgroundColor: color.value === 'none' ? 'transparent' : color.value,
                          backgroundImage: color.value === 'none'
                            ? `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`
                            : 'none',
                          backgroundSize: '8px 8px',
                          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                        }}
                        title={color.name}
                      />
                    ))}
                  </div>

                  {/* Custom Color Picker */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Custom color:</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-10 h-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                        onChange={(e) => handleChangeColor(e.target.value)}
                        defaultValue="#0076CE"
                      />
                      <input
                        type="text"
                        placeholder="#hex"
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const value = e.target.value.trim();
                            if (value.match(/^#[0-9A-Fa-f]{3,6}$/)) {
                              handleChangeColor(value);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowColorPicker(false)}
                    className="w-full mt-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-1"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden flex items-center gap-1 px-2 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Toggle elements panel"
            >
              <Icon icon="mdi:format-list-bulleted" className="w-4 h-4" />
            </button>
            <button
              onClick={handleComplete}
              className="flex items-center gap-1 px-3 sm:px-4 py-1.5 bg-idegy-navy dark:bg-white text-white dark:text-idegy-navy rounded-lg hover:bg-idegy-navy-dark dark:hover:bg-gray-100"
            >
              <span className="hidden sm:inline">Done</span>
              <Icon icon="mdi:check" className="w-4 h-4 sm:hidden" />
              <Icon icon="mdi:arrow-right" className="w-4 h-4 hidden sm:block" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area - Full Size */}
        <div
          ref={canvasAreaRef}
          className="flex-1 flex items-center justify-center p-2 sm:p-4 bg-gray-200 dark:bg-gray-900 overflow-auto relative select-none"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{ cursor: isDragging ? 'crosshair' : 'default' }}
        >
          <div className="rounded-xl shadow-lg p-6 w-full h-full max-w-[900px] max-h-[700px] flex items-center justify-center"
            style={{
              /* Dark checkerboard pattern for transparency - like Photoshop */
              backgroundImage: `
                linear-gradient(45deg, #808080 25%, transparent 25%),
                linear-gradient(-45deg, #808080 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #808080 75%),
                linear-gradient(-45deg, transparent 75%, #808080 75%)
              `,
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              backgroundColor: '#c0c0c0'
            }}
          >
            {/* SVG container */}
            <div
              ref={containerRef}
              className="w-full h-full flex items-center justify-center"
              style={{ minHeight: '500px' }}
            />
          </div>

          {/* Marquee selection rectangle */}
          {isDragging && dragStart && dragEnd && (() => {
            const rect = getSelectionRect(dragStart, dragEnd);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  border: '2px dashed #0076CE',
                  backgroundColor: 'rgba(0, 118, 206, 0.1)',
                  pointerEvents: 'none',
                  zIndex: 30,
                }}
              />
            );
          })()}
        </div>

        {/* Mobile overlay */}
        {showSidebar && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Elements Panel */}
        <div className={`
          fixed lg:relative inset-y-0 right-0 z-50 lg:z-auto
          w-72 sm:w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700
          flex flex-col overflow-hidden
          transform transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          {/* Quick Select by Color */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Quick Select by Color</h4>
            <div className="space-y-1">
              {Object.entries(colorGroups).map(([colorLabel, group]) => (
                <div key={colorLabel} className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-sm border border-gray-400 dark:border-gray-500 flex-shrink-0"
                    style={{
                      backgroundColor: getColorPreview(group.fill),
                      backgroundImage: group.fill === 'none' || group.fill === 'transparent'
                        ? `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`
                        : 'none',
                      backgroundSize: '4px 4px'
                    }}
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 w-16 truncate">{colorLabel}</span>
                  {group.largeElements.length > 0 && (
                    <button
                      onClick={() => handleSelectByColor(colorLabel, 'large')}
                      className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${
                        group.largeElements.every(id => selectedElements.has(id))
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                      }`}
                      title="Large elements (likely backgrounds)"
                    >
                      BG ({group.largeElements.length})
                    </button>
                  )}
                  {group.smallElements.length > 0 && (
                    <button
                      onClick={() => handleSelectByColor(colorLabel, 'small')}
                      className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${
                        group.smallElements.every(id => selectedElements.has(id))
                          ? 'bg-idegy-navy dark:bg-idegy-blue text-white border-idegy-navy dark:border-idegy-blue'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                      title="Small elements (likely content)"
                    >
                      Small ({group.smallElements.length})
                    </button>
                  )}
                  <button
                    onClick={() => handleSelectByColor(colorLabel, 'all')}
                    className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${
                      group.elements.every(id => selectedElements.has(id))
                        ? 'bg-gray-700 dark:bg-gray-600 text-white border-gray-700 dark:border-gray-600'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    All ({group.elements.length})
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">All Elements ({visibleElements.length})</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click or drag to select, Shift to add</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSelectAll}
                className="text-xs text-idegy-navy dark:text-idegy-blue hover:underline"
              >
                Select all
              </button>
              <button
                onClick={handleDeselectAll}
                className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {visibleElements.map((el) => (
              <button
                key={el.id}
                onClick={() => {
                  setSelectedElements(prev => {
                    const next = new Set(prev);
                    if (next.has(el.id)) {
                      next.delete(el.id);
                    } else {
                      next.add(el.id);
                    }
                    return next;
                  });
                }}
                onMouseEnter={() => setHoveredElement(el.id)}
                onMouseLeave={() => setHoveredElement(null)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                  selectedElements.has(el.id)
                    ? 'bg-idegy-navy/10 dark:bg-idegy-blue/20 border border-idegy-navy dark:border-idegy-blue'
                    : hoveredElement === el.id
                      ? 'bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                }`}
              >
                {/* Color preview */}
                <div
                  className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
                  style={{
                    backgroundColor: getColorPreview(el.fill),
                    backgroundImage: el.fill === 'none' || el.fill === 'transparent'
                      ? `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3C/svg%3E")`
                      : 'none'
                  }}
                />

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {el.label || 'Shape'}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {el.fill !== 'none' ? el.fill : el.stroke}
                  </div>
                </div>

                {selectedElements.has(el.id) && (
                  <Icon icon="mdi:check" className="w-4 h-4 text-idegy-navy dark:text-idegy-blue" />
                )}
              </button>
            ))}

            {hiddenElements.size > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 px-2">
                  {hiddenElements.size} element(s) deleted - click Undo to restore
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CleanupEditor;
