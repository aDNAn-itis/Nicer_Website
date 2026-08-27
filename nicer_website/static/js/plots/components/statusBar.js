/**
 * Status Bar Module - Manages loading states and operations status
 * Replaces individual loading indicators to prevent page layout shifts
 */

let statusBarInstance = null;

export class StatusBar {
  constructor() {
    this.operations = new Map();
    this.container = null;
    this.init();
  }

  static getInstance() {
    if (!statusBarInstance) {
      statusBarInstance = new StatusBar();
    }
    return statusBarInstance;
  }

  init() {
    this.addStatusBarStyles();
    this.createStatusBar();
  }

  addStatusBarStyles() {
    if (document.getElementById('status-bar-styles')) return;

    const styles = `
      .status-bar {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 280px;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease-in-out;
      }

      .status-bar.visible {
        opacity: 1;
        transform: translateX(0);
      }

      .status-operation {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 8px 11px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 10px;
        line-height: 1.4;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .status-operation.completed {
        border-color: #4caf50;
        background: #f8fff8;
      }

      .status-operation.error {
        border-color: #f44336;
        background: #fff8f8;
      }

      .status-operation.removing {
        opacity: 0;
        transform: translateX(100%);
        margin-bottom: -40px;
      }

      .status-spinner {
        width: 11px;
        height: 11px;
        border: 2px solid #f0f0f0;
        border-top: 2px solid #666;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        flex-shrink: 0;
      }

      .status-icon {
        width: 11px;
        height: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 9px;
        flex-shrink: 0;
      }

      .status-icon.success {
        color: #4caf50;
      }

      .status-icon.error {
        color: #f44336;
      }

      .status-message {
        flex: 1;
        color: #333;
        font-weight: 400;
      }

      .status-close {
        position: absolute;
        top: 3px;
        right: 3px;
        background: none;
        border: none;
        color: #999;
        font-size: 10px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        opacity: 0;
        transition: opacity 0.2s;
        line-height: 1;
      }

      .status-operation:hover .status-close {
        opacity: 1;
      }

      .status-close:hover {
        background: #f0f0f0;
        color: #666;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Ensure status bar is above other content */
      .status-bar {
        z-index: 10000;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .status-bar {
          top: 10px;
          right: 10px;
          left: 10px;
          max-width: none;
        }
        
        .status-operation {
          padding: 10px 12px;
          font-size: 13px;
        }
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = 'status-bar-styles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  createStatusBar() {
    if (this.container) return;

    this.container = $('<div>', {
      id: 'global-status-bar',
      class: 'status-bar'
    });

    $('body').append(this.container);
  }

  startOperation(id, message) {
    this.operations.set(id, {
      id,
      message,
      status: 'loading',
      startTime: Date.now()
    });
    this.updateDisplay();
    this.show();
  }

  completeOperation(id, successMessage = null) {
    const operation = this.operations.get(id);
    if (!operation) return;

    operation.status = 'completed';
    operation.endTime = Date.now();
    if (successMessage) {
      operation.message = successMessage;
    }

    this.updateDisplay();

    // Auto-remove completed operations after 2 seconds
    setTimeout(() => {
      this.removeOperation(id);
    }, 2000);
  }

  errorOperation(id, errorMessage = null) {
    const operation = this.operations.get(id);
    if (!operation) return;

    operation.status = 'error';
    operation.endTime = Date.now();
    if (errorMessage) {
      operation.message = errorMessage;
    }

    this.updateDisplay();

    // Auto-remove error operations after 4 seconds
    setTimeout(() => {
      this.removeOperation(id);
    }, 4000);
  }

  removeOperation(id) {
    const operation = this.operations.get(id);
    if (!operation) return;

    // Add removing animation to the operation element
    const operationEl = this.container.find(`[data-operation-id="${id}"]`);
    if (operationEl.length) {
      operationEl.addClass('removing');
      
      // Remove after animation completes
      setTimeout(() => {
        this.operations.delete(id);
        this.updateDisplay();

        // Hide status bar if no operations remain
        if (this.operations.size === 0) {
          this.hide();
        }
      }, 300);
    } else {
      // Fallback if element not found
      this.operations.delete(id);
      this.updateDisplay();
      
      if (this.operations.size === 0) {
        this.hide();
      }
    }
  }

  updateDisplay() {
    if (!this.container) return;

    // Remove operations that are not in the removing state
    this.container.find('.status-operation:not(.removing)').remove();

    // Add current operations
    this.operations.forEach(operation => {
      const operationEl = this.createOperationElement(operation);
      this.container.append(operationEl);
    });
  }

  createOperationElement(operation) {
    const element = $('<div>', {
      class: `status-operation ${operation.status}`,
      'data-operation-id': operation.id
    });

    let icon;
    switch (operation.status) {
      case 'loading':
        icon = $('<div>', { class: 'status-spinner' });
        break;
      case 'completed':
        icon = $('<div>', { 
          class: 'status-icon success',
          html: '✓'
        });
        break;
      case 'error':
        icon = $('<div>', { 
          class: 'status-icon error',
          html: '✗'
        });
        break;
    }

    const message = $('<div>', {
      class: 'status-message',
      text: operation.message
    });

    // Add close button for manual dismissal
    const closeButton = $('<button>', {
      class: 'status-close',
      html: '×',
      title: 'Dismiss'
    });

    closeButton.on('click', (e) => {
      e.stopPropagation();
      this.removeOperation(operation.id);
    });

    element.append(icon, message, closeButton);
    return element;
  }

  show() {
    if (!this.container) return;
    
    this.container.addClass('visible');
  }

  hide() {
    if (!this.container) return;
    
    this.container.removeClass('visible');
  }

  clear() {
    this.operations.clear();
    this.updateDisplay();
    this.hide();
  }

  completeOperationsByPattern(pattern) {
    let completed = 0;
    this.operations.forEach((operation, id) => {
      if (id.includes(pattern) && operation.status === 'loading') {
        operation.status = 'completed';
        operation.endTime = Date.now();
        completed++;
        
        // Auto-remove completed operations after 2 seconds
        setTimeout(() => {
          this.removeOperation(id);
        }, 2000);
      }
    });
    if (completed > 0) {
      this.updateDisplay();
    }
    return completed;
  }

  clearOperationsByPattern(pattern) {
    let cleared = 0;
    this.operations.forEach((operation, id) => {
      if (id.includes(pattern)) {
        cleared++;
        this.removeOperation(id);
      }
    });
    return cleared;
  }

  updateOperationMessage(id, newMessage) {
    const operation = this.operations.get(id);
    if (operation && operation.status === 'loading') {
      operation.message = newMessage;
      this.updateDisplay();
      return true;
    }
    return false;
  }

  hasActiveOperations() {
    return Array.from(this.operations.values()).some(op => op.status === 'loading');
  }
}

// Export convenience functions
export function startOperation(id, message) {
  return StatusBar.getInstance().startOperation(id, message);
}

export function completeOperation(id, successMessage = null) {
  return StatusBar.getInstance().completeOperation(id, successMessage);
}

export function errorOperation(id, errorMessage = null) {
  return StatusBar.getInstance().errorOperation(id, errorMessage);
}

export function removeOperation(id) {
  return StatusBar.getInstance().removeOperation(id);
}

export function clearAllOperations() {
  return StatusBar.getInstance().clear();
}

export function completeOperationsByPattern(pattern) {
  return StatusBar.getInstance().completeOperationsByPattern(pattern);
}

export function clearOperationsByPattern(pattern) {
  return StatusBar.getInstance().clearOperationsByPattern(pattern);
}

export function updateOperationMessage(id, newMessage) {
  return StatusBar.getInstance().updateOperationMessage(id, newMessage);
}

export function hasActiveOperations() {
  return StatusBar.getInstance().hasActiveOperations();
}
