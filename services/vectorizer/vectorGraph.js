/**
 * Vector Graph Module
 *
 * A graph-based representation of vector shapes that maintains:
 * - Shape relationships (adjacency, containment)
 * - Shared edges between shapes
 * - Consistent coordinates across shape boundaries
 * - Hierarchical structure (parent/child shapes)
 *
 * This is key to avoiding gaps and overlaps between adjacent shapes,
 * which is a common problem in traditional vectorization.
 */

class VectorGraph {
  constructor() {
    // Node storage: shape ID -> ShapeNode
    this.nodes = new Map();

    // Edge storage: edge ID -> SharedEdge
    this.edges = new Map();

    // Spatial index for efficient neighbor lookup
    this.spatialIndex = new Map();
    this.gridSize = 10; // Pixels per grid cell

    // ID counters
    this.nextNodeId = 0;
    this.nextEdgeId = 0;
  }

  /**
   * Add a shape to the graph
   * @param {Object} shape - Shape with contours, color, bounds
   * @returns {number} Node ID
   */
  addShape(shape) {
    const id = this.nextNodeId++;

    const node = new ShapeNode(id, shape);
    this.nodes.set(id, node);

    // Add to spatial index
    this.indexShape(node);

    return id;
  }

  /**
   * Index shape in spatial grid for fast neighbor lookup
   */
  indexShape(node) {
    const { bounds } = node.shape;
    if (!bounds) return;

    const minCellX = Math.floor(bounds.minX / this.gridSize);
    const maxCellX = Math.floor(bounds.maxX / this.gridSize);
    const minCellY = Math.floor(bounds.minY / this.gridSize);
    const maxCellY = Math.floor(bounds.maxY / this.gridSize);

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const key = `${cx},${cy}`;
        if (!this.spatialIndex.has(key)) {
          this.spatialIndex.set(key, new Set());
        }
        this.spatialIndex.get(key).add(node.id);
      }
    }
  }

  /**
   * Find shapes that might be adjacent to a given shape
   */
  findPotentialNeighbors(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || !node.shape.bounds) return [];

    const neighbors = new Set();
    const { bounds } = node.shape;

    const minCellX = Math.floor(bounds.minX / this.gridSize) - 1;
    const maxCellX = Math.floor(bounds.maxX / this.gridSize) + 1;
    const minCellY = Math.floor(bounds.minY / this.gridSize) - 1;
    const maxCellY = Math.floor(bounds.maxY / this.gridSize) + 1;

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const key = `${cx},${cy}`;
        const cell = this.spatialIndex.get(key);
        if (cell) {
          for (const otherId of cell) {
            if (otherId !== nodeId) {
              neighbors.add(otherId);
            }
          }
        }
      }
    }

    return Array.from(neighbors);
  }

  /**
   * Detect and create shared edges between adjacent shapes
   */
  buildSharedEdges(tolerance = 2.0) {
    console.log('[VectorGraph] Building shared edges...');

    const processedPairs = new Set();

    for (const [nodeId, node] of this.nodes) {
      const neighbors = this.findPotentialNeighbors(nodeId);

      for (const neighborId of neighbors) {
        // Avoid processing same pair twice
        const pairKey = nodeId < neighborId ? `${nodeId}-${neighborId}` : `${neighborId}-${nodeId}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const neighborNode = this.nodes.get(neighborId);
        const sharedEdge = this.findSharedEdge(node, neighborNode, tolerance);

        if (sharedEdge) {
          this.createSharedEdge(nodeId, neighborId, sharedEdge);
        }
      }
    }

    console.log(`[VectorGraph] Created ${this.edges.size} shared edges`);
  }

  /**
   * Find shared edge between two shapes
   */
  findSharedEdge(node1, node2, tolerance) {
    const contour1 = node1.shape.contour || [];
    const contour2 = node2.shape.contour || [];

    if (contour1.length < 2 || contour2.length < 2) return null;

    const sharedPoints = [];

    // Find points in contour1 that are close to contour2
    for (const p1 of contour1) {
      for (const p2 of contour2) {
        const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        if (dist < tolerance) {
          // Merge to midpoint
          sharedPoints.push({
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
            p1Index: contour1.indexOf(p1),
            p2Index: contour2.indexOf(p2)
          });
        }
      }
    }

    if (sharedPoints.length < 2) return null;

    // Order shared points to form continuous edge
    return this.orderSharedPoints(sharedPoints);
  }

  /**
   * Order shared points into a continuous edge
   */
  orderSharedPoints(points) {
    if (points.length < 2) return null;

    // Sort by position along the edge
    const sorted = [...points].sort((a, b) => {
      // Use p1Index as primary sort key
      return a.p1Index - b.p1Index;
    });

    // Extract just the merged coordinates
    return sorted.map(p => ({ x: p.x, y: p.y }));
  }

  /**
   * Create a shared edge between two nodes
   */
  createSharedEdge(nodeId1, nodeId2, points) {
    const id = this.nextEdgeId++;

    const edge = new SharedEdge(id, nodeId1, nodeId2, points);
    this.edges.set(id, edge);

    // Link nodes to edge
    this.nodes.get(nodeId1).addEdge(id);
    this.nodes.get(nodeId2).addEdge(id);

    return id;
  }

  /**
   * Detect containment relationships (shapes inside other shapes)
   */
  buildContainmentHierarchy() {
    console.log('[VectorGraph] Building containment hierarchy...');

    // Sort nodes by area (largest first)
    const nodesByArea = [...this.nodes.values()].sort((a, b) => {
      const areaA = this.calculateArea(a);
      const areaB = this.calculateArea(b);
      return areaB - areaA;
    });

    // Check each shape for containment
    for (let i = 0; i < nodesByArea.length; i++) {
      const outer = nodesByArea[i];

      for (let j = i + 1; j < nodesByArea.length; j++) {
        const inner = nodesByArea[j];

        if (inner.parent !== null) continue; // Already has parent

        if (this.isContained(inner, outer)) {
          inner.parent = outer.id;
          outer.children.push(inner.id);
        }
      }
    }

    const containedCount = [...this.nodes.values()].filter(n => n.parent !== null).length;
    console.log(`[VectorGraph] Found ${containedCount} contained shapes`);
  }

  /**
   * Calculate approximate area of a shape
   */
  calculateArea(node) {
    const bounds = node.shape.bounds;
    if (!bounds) return 0;
    return bounds.width * bounds.height;
  }

  /**
   * Check if inner shape is contained within outer shape
   */
  isContained(innerNode, outerNode) {
    const inner = innerNode.shape.bounds;
    const outer = outerNode.shape.bounds;

    if (!inner || !outer) return false;

    // Simple bounding box check
    return (
      inner.minX >= outer.minX &&
      inner.maxX <= outer.maxX &&
      inner.minY >= outer.minY &&
      inner.maxY <= outer.maxY
    );
  }

  /**
   * Enforce shared edge consistency
   * Updates shape contours to use exact shared edge coordinates
   */
  enforceEdgeConsistency() {
    console.log('[VectorGraph] Enforcing edge consistency...');

    for (const [edgeId, edge] of this.edges) {
      const node1 = this.nodes.get(edge.nodeId1);
      const node2 = this.nodes.get(edge.nodeId2);

      if (!node1 || !node2) continue;

      // Update contours to use shared edge points
      this.updateContourWithSharedEdge(node1, edge.points);
      this.updateContourWithSharedEdge(node2, edge.points);
    }
  }

  /**
   * Update a contour to use shared edge points exactly
   */
  updateContourWithSharedEdge(node, sharedPoints) {
    const contour = node.shape.contour;
    if (!contour || contour.length < 2) return;

    const tolerance = 3.0;

    for (const shared of sharedPoints) {
      // Find closest point in contour
      let minDist = Infinity;
      let minIdx = -1;

      for (let i = 0; i < contour.length; i++) {
        const dist = Math.sqrt(
          (contour[i].x - shared.x) ** 2 +
          (contour[i].y - shared.y) ** 2
        );
        if (dist < minDist) {
          minDist = dist;
          minIdx = i;
        }
      }

      // Snap to shared point if close enough
      if (minDist < tolerance && minIdx >= 0) {
        contour[minIdx].x = shared.x;
        contour[minIdx].y = shared.y;
      }
    }
  }

  /**
   * Get all shapes organized by layer (containment depth)
   */
  getShapesByLayer() {
    const layers = [];

    // Find root shapes (no parent)
    const roots = [...this.nodes.values()].filter(n => n.parent === null);

    // BFS to organize by depth
    let currentLayer = roots;
    while (currentLayer.length > 0) {
      layers.push(currentLayer.map(n => n.id));

      const nextLayer = [];
      for (const node of currentLayer) {
        for (const childId of node.children) {
          nextLayer.push(this.nodes.get(childId));
        }
      }
      currentLayer = nextLayer;
    }

    return layers;
  }

  /**
   * Export graph for debugging
   */
  toJSON() {
    return {
      nodes: [...this.nodes.entries()].map(([id, node]) => ({
        id,
        parent: node.parent,
        children: node.children,
        edges: [...node.edges],
        bounds: node.shape.bounds
      })),
      edges: [...this.edges.entries()].map(([id, edge]) => ({
        id,
        nodeId1: edge.nodeId1,
        nodeId2: edge.nodeId2,
        pointCount: edge.points.length
      }))
    };
  }

  /**
   * Get optimized render order (back to front)
   */
  getRenderOrder() {
    const layers = this.getShapesByLayer();
    return layers.flat();
  }

  /**
   * Merge two adjacent shapes (for cleanup)
   */
  mergeShapes(nodeId1, nodeId2) {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);

    if (!node1 || !node2) return null;

    // Create merged shape
    const mergedContour = this.mergeContours(node1.shape.contour, node2.shape.contour);

    const mergedShape = {
      color: node1.shape.color,
      contour: mergedContour,
      bounds: this.computeBounds(mergedContour)
    };

    // Remove old nodes
    this.removeNode(nodeId1);
    this.removeNode(nodeId2);

    // Add merged node
    return this.addShape(mergedShape);
  }

  /**
   * Merge two contours
   */
  mergeContours(contour1, contour2) {
    // Simple merge: concatenate and compute convex hull
    const allPoints = [...(contour1 || []), ...(contour2 || [])];
    return this.convexHull(allPoints);
  }

  /**
   * Compute convex hull of points
   */
  convexHull(points) {
    if (points.length < 3) return points;

    // Graham scan
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const pivot = sorted[0];

    sorted.sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      return angleA - angleB;
    });

    const hull = [sorted[0], sorted[1]];

    for (let i = 2; i < sorted.length; i++) {
      while (hull.length > 1 && this.cross(hull[hull.length - 2], hull[hull.length - 1], sorted[i]) <= 0) {
        hull.pop();
      }
      hull.push(sorted[i]);
    }

    return hull;
  }

  /**
   * Cross product for convex hull
   */
  cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  /**
   * Compute bounds from contour
   */
  computeBounds(contour) {
    if (!contour || contour.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of contour) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from edges
    for (const edgeId of node.edges) {
      this.edges.delete(edgeId);
    }

    // Remove from parent's children
    if (node.parent !== null) {
      const parent = this.nodes.get(node.parent);
      if (parent) {
        parent.children = parent.children.filter(id => id !== nodeId);
      }
    }

    // Reparent children
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (child) {
        child.parent = node.parent;
      }
    }

    this.nodes.delete(nodeId);
  }
}

/**
 * Shape Node in the Vector Graph
 */
class ShapeNode {
  constructor(id, shape) {
    this.id = id;
    this.shape = shape;
    this.parent = null;
    this.children = [];
    this.edges = new Set(); // IDs of shared edges
  }

  addEdge(edgeId) {
    this.edges.add(edgeId);
  }
}

/**
 * Shared Edge between two shapes
 */
class SharedEdge {
  constructor(id, nodeId1, nodeId2, points) {
    this.id = id;
    this.nodeId1 = nodeId1;
    this.nodeId2 = nodeId2;
    this.points = points; // Array of {x, y} coordinates
  }
}

module.exports = VectorGraph;
