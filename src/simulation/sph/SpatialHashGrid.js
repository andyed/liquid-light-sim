/**
 * SpatialHashGrid.js
 * 
 * O(N log N) spatial partitioning for fast SPH neighbor queries
 * Divides space into uniform grid cells, particles query only nearby cells
 * 
 * Critical for SPH performance - naive O(N²) is unusable beyond ~1000 particles
 */

export default class SpatialHashGrid {
  constructor(cellSize, containerRadius) {
    this.cellSize = cellSize; // Should be ~2x SPH smoothing radius
    this.containerRadius = containerRadius;
    
    // Hash table: cellKey -> array of particle indices
    this.cells = new Map();
    
    // Grid dimensions (centered at origin)
    const diameter = containerRadius * 2;
    this.gridWidth = Math.ceil(diameter / cellSize);
    this.gridHeight = Math.ceil(diameter / cellSize);
    
    // Offset to convert world coords to grid coords
    this.offsetX = this.gridWidth / 2;
    this.offsetY = this.gridHeight / 2;
  }
  
  /**
   * Hash function: (x,y) grid coords -> single integer key
   * Uses prime numbers to reduce hash collisions
   */
  hashCell(gridX, gridY) {
    // Cantor pairing with primes for good distribution
    return (gridX * 73856093) ^ (gridY * 19349663);
  }
  
  /**
   * World position -> grid cell coordinates
   */
  worldToGrid(x, y) {
    const gridX = Math.floor(x / this.cellSize + this.offsetX);
    const gridY = Math.floor(y / this.cellSize + this.offsetY);
    return { gridX, gridY };
  }
  
  /**
   * Clear all cells (call before rebuilding each frame)
   */
  clear() {
    this.cells.clear();
  }
  
  /**
   * Insert particle into spatial hash
   * @param {number} particleIndex - Index in particle array
   * @param {number} x - World X position
   * @param {number} y - World Y position
   */
  insert(particleIndex, x, y) {
    const { gridX, gridY } = this.worldToGrid(x, y);
    const key = this.hashCell(gridX, gridY);
    
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(particleIndex);
  }
  
  /**
   * Query nearby particles within radius
   * @param {number} x - Query center X
   * @param {number} y - Query center Y
   * @param {number} radius - Search radius
   * @returns {Array<number>} Array of particle indices
   */
  query(x, y, radius) {
    const neighbors = [];
    
    // Determine which cells to check
    const { gridX: centerX, gridY: centerY } = this.worldToGrid(x, y);
    const cellRadius = Math.ceil(radius / this.cellSize);
    
    // Check surrounding cells (including current cell)
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const gridX = centerX + dx;
        const gridY = centerY + dy;
        const key = this.hashCell(gridX, gridY);
        
        const cell = this.cells.get(key);
        if (cell) {
          // Add all particles in this cell to results
          neighbors.push(...cell);
        }
      }
    }
    
    return neighbors;
  }
  
  /**
   * Get statistics for debugging
   */
  getStats() {
    let totalParticles = 0;
    let maxCellSize = 0;
    let occupiedCells = 0;
    
    for (const cell of this.cells.values()) {
      occupiedCells++;
      totalParticles += cell.length;
      maxCellSize = Math.max(maxCellSize, cell.length);
    }
    
    const avgCellSize = occupiedCells > 0 ? totalParticles / occupiedCells : 0;
    
    return {
      totalParticles,
      occupiedCells,
      maxCellSize,
      avgCellSize: avgCellSize.toFixed(2),
      totalCells: this.gridWidth * this.gridHeight
    };
  }
}
