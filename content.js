let highlightButton = null;
let savedSelectedText = '';
let savedContext = null;

function extractGmailContent() {
  try {
    // Try multiple selectors for Gmail email content
    const selectors = [
      '[role="main"] [data-message-id]',
      '.adn .ii.gt',
      '.ii.gt',
      '[data-message-id] .ii.gt',
      '.email-body',
      '.message-content'
    ];

    for (const selector of selectors) {
      const emailElement = document.querySelector(selector);
      if (emailElement) {
        // Get text content and clean it up
        let content = emailElement.textContent || emailElement.innerText || '';

        // Clean up the content
        content = content
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/\n\s*\n/g, '\n') // Remove empty lines
          .trim();

        if (content.length > 50) { // Only return if we got substantial content
          console.log('[Gmail] Extracted email content using selector:', selector);
          return content;
        }
      }
    }

    // Fallback: try to get content from the main email area
    const mainContent = document.querySelector('[role="main"]');
    if (mainContent) {
      let content = mainContent.textContent || mainContent.innerText || '';
      content = content.replace(/\s+/g, ' ').trim();

      if (content.length > 50) {
        console.log('[Gmail] Extracted email content from main area');
        return content;
      }
    }

    return null;
  } catch (error) {
    console.error('[Gmail] Error extracting email content:', error);
    return null;
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

  // Prevent selection from being cleared by the click interaction
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
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
  console.log('[Content] ========================================');
  console.log('[Content] Capture button clicked!');
  const fallbackSelection = window.getSelection().toString().trim();
  const selectedText = savedSelectedText || fallbackSelection;
  console.log('[Content] Using text length:', selectedText ? selectedText.length : 0);

  if (!selectedText) {
    console.log('[Content] ✗ No text available to capture, aborting');
    showNotification('✗ No text selected to capture', 'error');
    return;
  }

  // Smart context expansion for Gmail
  let fullEmailContext = null;
  if (window.location.href.includes('mail.google.com') && selectedText.length < 200) {
    try {
      // Try to extract full email content from Gmail
      const emailBody = extractGmailContent();
      if (emailBody && emailBody.length > selectedText.length) {
        fullEmailContext = emailBody;
        console.log('[Content] ✓ Full email context extracted:', emailBody.length, 'chars');
      }
    } catch (error) {
      console.log('[Content] Could not extract full email context:', error);
    }
  }

  const context = savedContext || {
    url: window.location.href,
    title: document.title,
    selectedText,
    fullEmailContext,
    timestamp: new Date().toISOString()
  };

  console.log('[Content] Page context:', context);
  console.log('[Content] >>> Sending message to background script...');

  try {
    chrome.runtime.sendMessage({
      action: 'captureTask',
      data: context
    }, (response) => {
      console.log('[Content] <<< Response received from background');

      if (chrome.runtime.lastError) {
        console.error('[Content] ✗ Runtime error:', chrome.runtime.lastError);
        showNotification('Failed to capture task: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      console.log('[Content] Response data:', response);

      if (response && response.success) {
        console.log('[Content] ✓ Task captured successfully!');
        console.log('[Content] Saved task:', response.task);
        showNotification('✓ Task captured successfully!', 'success');
      } else {
        console.error('[Content] ✗ Task capture failed:', response?.error || 'Unknown error');
        showNotification('✗ Failed to capture task: ' + (response?.error || 'Unknown error'), 'error');
      }
    });
  } catch (error) {
    console.error('[Content] ✗ Extension context error:', error);
    showNotification('Extension needs to be reloaded. Please refresh the page.', 'error');

    // Hide the button since we can't communicate with background
    hideHighlightButton();
    savedSelectedText = '';
    savedContext = null;
  }

  hideHighlightButton();
  savedSelectedText = '';
  savedContext = null;
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
      console.log('[Content] Text selected (' + selectedText.length + ' chars), showing capture button');

      // Save the selected text and context NOW before it gets cleared
      savedSelectedText = selectedText;
      savedContext = {
        url: window.location.href,
        title: document.title,
        selectedText: selectedText,
        timestamp: new Date().toISOString()
      };
      console.log('[Content] ✓ Saved text and context for capture');

      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showHighlightButton(
        rect.left + (rect.width / 2) - 60,
        rect.top + window.scrollY
      );
    } else {
      if (selectedText.length > 0) {
        console.log('[Content] Text too short (' + selectedText.length + ' chars), need >10');
      }
      savedSelectedText = '';
      savedContext = null;
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

console.log('[Content] ✓ GetShitDone content script loaded on:', window.location.href);
