let highlightButton = null;

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
    return;
  }

  const pageContext = {
    url: window.location.href,
    title: document.title,
    selectedText: selectedText,
    timestamp: new Date().toISOString()
  };

  chrome.runtime.sendMessage({
    action: 'captureTask',
    data: pageContext
  }, (response) => {
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
