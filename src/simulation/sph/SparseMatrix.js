/**
 * SparseMatrix.js
 * 
 * Compressed Sparse Row (CSR) format matrix for implicit SPH solver
 * Used for building and solving the implicit system: (M - dt*J) * v = rhs
 * 
 * CSR Format:
 * - values[]: Non-zero matrix entries
 * - colIndices[]: Column index for each value
 * - rowPtr[]: Starting index in values[] for each row
 * 
 * Memory efficient for SPH (each particle has ~20-50 neighbors)
 */

export default class SparseMatrix {
  /**
   * @param {number} size - Matrix dimension (N×N where N = particleCount * 2)
   * @param {number} estimatedNonZeros - Estimated non-zero entries
   */
  constructor(size, estimatedNonZeros = 1000) {
    this.size = size;
    this.nnz = 0; // Current number of non-zeros
    
    // CSR storage
    this.values = new Float32Array(estimatedNonZeros);
    this.colIndices = new Int32Array(estimatedNonZeros);
    this.rowPtr = new Int32Array(size + 1);
    
    // Capacity
    this.capacity = estimatedNonZeros;
    
    // Build state
    this.currentRow = -1;
    this.built = false;
  }
  
  /**
   * Begin building a new row
   */
  beginRow(rowIndex) {
    if (this.built) {
      throw new Error('Matrix already built - cannot modify');
    }
    if (rowIndex !== this.currentRow + 1) {
      throw new Error(`Rows must be added sequentially. Expected ${this.currentRow + 1}, got ${rowIndex}`);
    }
    this.currentRow = rowIndex;
    this.rowPtr[rowIndex] = this.nnz;
  }
  
  /**
   * Add entry to current row
   * Entries must be added in column-sorted order
   */
  addEntry(colIndex, value) {
    if (this.currentRow === -1) {
      throw new Error('Must call beginRow() before addEntry()');
    }
    if (Math.abs(value) < 1e-12) {
      return; // Skip near-zero entries
    }
    
    // Grow arrays if needed
    if (this.nnz >= this.capacity) {
      this.grow();
    }
    
    this.values[this.nnz] = value;
    this.colIndices[this.nnz] = colIndex;
    this.nnz++;
  }
  
  /**
   * Finish building the matrix
   */
  finalize() {
    if (this.currentRow !== this.size - 1) {
      throw new Error(`Not all rows added. Expected ${this.size}, got ${this.currentRow + 1}`);
    }
    this.rowPtr[this.size] = this.nnz;
    this.built = true;
    
    console.log(`✅ Sparse matrix built: ${this.size}×${this.size}, ${this.nnz} non-zeros (${(this.nnz / (this.size * this.size) * 100).toFixed(2)}% dense)`);
  }
  
  /**
   * Grow storage arrays (double capacity)
   */
  grow() {
    const newCapacity = this.capacity * 2;
    
    const newValues = new Float32Array(newCapacity);
    const newColIndices = new Int32Array(newCapacity);
    
    newValues.set(this.values.subarray(0, this.nnz));
    newColIndices.set(this.colIndices.subarray(0, this.nnz));
    
    this.values = newValues;
    this.colIndices = newColIndices;
    this.capacity = newCapacity;
    
    console.log(`⚠️ Sparse matrix grown to capacity ${newCapacity}`);
  }
  
  /**
   * Matrix-vector multiplication: y = A * x
   * @param {Float32Array} x - Input vector (length = size)
   * @param {Float32Array} y - Output vector (length = size)
   */
  multiply(x, y) {
    if (!this.built) {
      throw new Error('Matrix not finalized');
    }
    if (x.length !== this.size || y.length !== this.size) {
      throw new Error(`Vector size mismatch. Expected ${this.size}, got x=${x.length}, y=${y.length}`);
    }
    
    y.fill(0);
    
    for (let i = 0; i < this.size; i++) {
      const rowStart = this.rowPtr[i];
      const rowEnd = this.rowPtr[i + 1];
      
      let sum = 0;
      for (let j = rowStart; j < rowEnd; j++) {
        sum += this.values[j] * x[this.colIndices[j]];
      }
      y[i] = sum;
    }
  }
  
  /**
   * Get diagonal entry (for preconditioning)
   */
  getDiagonal(i) {
    const rowStart = this.rowPtr[i];
    const rowEnd = this.rowPtr[i + 1];
    
    for (let j = rowStart; j < rowEnd; j++) {
      if (this.colIndices[j] === i) {
        return this.values[j];
      }
    }
    return 0;
  }
  
  /**
   * Get entry at (row, col)
   */
  get(row, col) {
    const rowStart = this.rowPtr[row];
    const rowEnd = this.rowPtr[row + 1];
    
    for (let j = rowStart; j < rowEnd; j++) {
      if (this.colIndices[j] === col) {
        return this.values[j];
      }
    }
    return 0;
  }
  
  /**
   * Get memory usage in MB
   */
  getMemoryUsage() {
    const bytes = this.values.byteLength + this.colIndices.byteLength + this.rowPtr.byteLength;
    return (bytes / (1024 * 1024)).toFixed(2);
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const avgNonZerosPerRow = this.nnz / this.size;
    const sparsity = (1 - this.nnz / (this.size * this.size)) * 100;
    
    return {
      size: this.size,
      nonZeros: this.nnz,
      avgPerRow: avgNonZerosPerRow.toFixed(1),
      sparsity: sparsity.toFixed(2) + '%',
      memoryMB: this.getMemoryUsage()
    };
  }
}
