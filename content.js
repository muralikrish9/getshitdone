let highlightButton = null;
let screenshotCapture = null;

// Screenshot capture functionality
class ScreenshotCapture {
  constructor() {
    this.overlay = null;
    this.selectionBox = null;
    this.startX = 0;
    this.startY = 0;
    this.isSelecting = false;
  }

  async captureScreen() {
    return new Promise((resolve, reject) => {
      this.createOverlay();
      this.resolveCapture = resolve;
      this.rejectCapture = reject;
    });
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'getshitdone-screenshot-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      cursor: crosshair;
    `;

    const instructions = document.createElement('div');
    instructions.id = 'getshitdone-screenshot-instructions';
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 2147483648;
    `;
    instructions.innerHTML = `
      <strong>📸 Screenshot Capture</strong><br>
      Click and drag to select region • Press ESC to cancel
    `;

    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #667eea;
      background: rgba(102, 126, 234, 0.1);
      display: none;
      z-index: 2147483648;
      pointer-events: none;
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(instructions);
    document.body.appendChild(this.selectionBox);

    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.overlay.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.overlay.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.keyDownHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.keyDownHandler);
  }

  handleMouseDown(e) {
    this.isSelecting = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    
    this.selectionBox.style.left = `${this.startX}px`;
    this.selectionBox.style.top = `${this.startY}px`;
    this.selectionBox.style.width = '0px';
    this.selectionBox.style.height = '0px';
    this.selectionBox.style.display = 'block';
  }

  handleMouseMove(e) {
    if (!this.isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);
    const left = Math.min(currentX, this.startX);
    const top = Math.min(currentY, this.startY);

    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  async handleMouseUp(e) {
    if (!this.isSelecting) return;
    
    this.isSelecting = false;
    const endX = e.clientX;
    const endY = e.clientY;
    const width = Math.abs(endX - this.startX);
    const height = Math.abs(endY - this.startY);

    if (width < 50 || height < 50) {
      this.cleanup();
      this.rejectCapture(new Error('Selection too small'));
      return;
    }

    const region = {
      x: Math.min(this.startX, endX),
      y: Math.min(this.startY, endY),
      width: width,
      height: height
    };

    this.cleanup();
    
    chrome.runtime.sendMessage({
      action: 'captureScreenshot',
      region: region
    }, (response) => {
      if (response && response.success) {
        this.resolveCapture(response.imageData);
      } else {
        this.rejectCapture(new Error('Screenshot capture failed'));
      }
    });
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.cleanup();
      this.rejectCapture(new Error('Cancelled by user'));
    }
  }

  cleanup() {
    if (this.overlay) this.overlay.remove();
    if (this.selectionBox) this.selectionBox.remove();
    const instructions = document.getElementById('getshitdone-screenshot-instructions');
    if (instructions) instructions.remove();
    if (this.keyDownHandler) {
      document.removeEventListener('keydown', this.keyDownHandler);
    }
  }
}

function createHighlightButton() {
  const button = document.createElement('div');
  button.id = 'getshitdone-highlight-btn';
  button.innerHTML = '✨ Capture Task';
  button.style.cssText = `
    position: absolute;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: none;
    transition: all 0.2s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  });
  
  button.addEventListener('click', handleCapture);
  document.body.appendChild(button);
  return button;
}

function handleCapture() {
  const selectedText = window.getSelection().toString().trim();
  
  if (!selectedText) {
    console.log('[Content] No text selected');
    return;
  }

  const pageContext = {
    url: window.location.href,
    title: document.title,
    selectedText: selectedText,
    timestamp: new Date().toISOString()
  };

  console.log('[Content] Sending message to background:', pageContext);

  chrome.runtime.sendMessage({
    action: 'captureTask',
    data: pageContext
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Content] Runtime error:', chrome.runtime.lastError);
      showNotification('Failed to capture task: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    
    console.log('[Content] Received response:', response);
    
    if (response && response.success) {
      showNotification('Task captured successfully!', 'success');
    } else {
      showNotification('Failed to capture task', 'error');
    }
  });

  hideHighlightButton();
  window.getSelection().removeAllRanges();
}

function showHighlightButton(x, y) {
  if (!highlightButton) {
    highlightButton = createHighlightButton();
  }
  
  highlightButton.style.left = `${x}px`;
  highlightButton.style.top = `${y - 45}px`;
  highlightButton.style.display = 'block';
}

function hideHighlightButton() {
  if (highlightButton) {
    highlightButton.style.display = 'none';
  }
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideIn 0.3s ease-out;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText.length > 10) {
      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showHighlightButton(
        rect.left + (rect.width / 2) - 60,
        rect.top + window.scrollY
      );
    } else {
      hideHighlightButton();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (highlightButton && !highlightButton.contains(e.target)) {
    setTimeout(() => {
      const selectedText = window.getSelection().toString().trim();
      if (!selectedText) {
        hideHighlightButton();
      }
    }, 10);
  }
});

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Listen for screenshot capture requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScreenshotCapture') {
    (async () => {
      try {
        screenshotCapture = new ScreenshotCapture();
        const imageData = await screenshotCapture.captureScreen();
        sendResponse({ success: true, imageData });
      } catch (error) {
        console.error('Screenshot capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});
