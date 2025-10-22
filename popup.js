const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(targetTab).classList.add('active');

    if (targetTab === 'today') {
      loadTasks();
    } else if (targetTab === 'settings') {
      loadSettings();
      checkAIStatus();
      checkGoogleAuthStatus();
    }
  });
});

async function loadTasks() {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const today = new Date().toDateString();
  const todayTasks = tasks.filter(task =>
    new Date(task.createdAt).toDateString() === today
  );

  document.getElementById('taskCount').textContent = todayTasks.length;

  const totalMinutes = todayTasks.reduce((sum, task) =>
    sum + (task.estimatedDuration || 30), 0
  );
  document.getElementById('timeTracked').textContent =
    `${Math.round(totalMinutes / 60 * 10) / 10}h`;

  const taskList = document.getElementById('taskList');

  if (todayTasks.length === 0) {
    taskList.innerHTML = '<p class="empty-state">No tasks captured yet. Highlight text on any webpage to get started!</p>';
    return;
  }

  taskList.innerHTML = todayTasks.reverse().map(task => {
    let mediaContent = '';

    if (task.imageDataUrl) {
      mediaContent = `<img src="${task.imageDataUrl}" class="task-image-thumbnail" alt="Task screenshot">`;
    }

    if (task.transcription) {
      mediaContent += `
        <div class="task-audio-indicator">🎤 Voice memo</div>
        <div class="task-transcription">${escapeHtml(task.transcription)}</div>
      `;
    }

    return `
      <div class="task-item" data-task-id="${task.id}">
        <div class="task-title">${escapeHtml(task.task)}</div>
        <div class="task-meta">
          <span>📁 ${escapeHtml(task.project || 'General')}</span>
          <span>⏱️ ${task.estimatedDuration || 30}min</span>
          <span>🎯 ${task.priority || 'medium'}</span>
          <span class="task-status">${getStatusIcon(task.status)} ${task.status || 'pending'}</span>
        </div>
        ${mediaContent}
        <div class="task-actions">
          <button class="status-btn ${task.status === 'pending' ? 'active' : ''}" data-status="pending">Pending</button>
          <button class="status-btn ${task.status === 'in-progress' ? 'active' : ''}" data-status="in-progress">In Progress</button>
          <button class="status-btn ${task.status === 'completed' ? 'active' : ''}" data-status="completed">Done</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners for status buttons
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = e.target.closest('.task-item').dataset.taskId;
      const newStatus = e.target.dataset.status;
      await updateTaskStatus(taskId, newStatus);
    });
  });
}

async function loadProjectBreakdown() {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const today = new Date().toDateString();
  const todayTasks = tasks.filter(task =>
    new Date(task.createdAt).toDateString() === today
  );

  const projectGroups = {};
  todayTasks.forEach(task => {
    const project = task.project || 'General';
    if (!projectGroups[project]) {
      projectGroups[project] = { tasks: [], minutes: 0 };
    }
    projectGroups[project].tasks.push(task);
    projectGroups[project].minutes += task.estimatedDuration || 30;
  });

  const breakdown = document.getElementById('projectBreakdown');

  if (Object.keys(projectGroups).length === 0) {
    breakdown.innerHTML = '<p class="empty-state">Project time tracking will appear here</p>';
    return;
  }

  breakdown.innerHTML = Object.keys(projectGroups).map(project => {
    const data = projectGroups[project];
    const hours = Math.round(data.minutes / 60 * 10) / 10;
    return `
      <div class="project-item">
        <span class="project-name">${escapeHtml(project)}</span>
        <span class="project-time">${hours}h</span>
      </div>
    `;
  }).join('');
}

document.getElementById('generateSummaryBtn').addEventListener('click', async () => {
  const button = document.getElementById('generateSummaryBtn');
  button.textContent = 'Generating...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'generateSummary' });

    if (response.success) {
      const summaryContent = document.getElementById('summaryContent');
      summaryContent.textContent = response.summary;

      document.getElementById('copySummaryBtn').style.display = 'inline-block';
      document.getElementById('exportMarkdownBtn').style.display = 'inline-block';

      await loadProjectBreakdown();
    }
  } catch (error) {
    console.error('Failed to generate summary:', error);
    alert('Failed to generate summary. Please try again.');
  } finally {
    button.textContent = 'Generate Summary';
    button.disabled = false;
  }
});

document.getElementById('copySummaryBtn').addEventListener('click', () => {
  const summary = document.getElementById('summaryContent').textContent;
  navigator.clipboard.writeText(summary);

  const button = document.getElementById('copySummaryBtn');
  const originalText = button.textContent;
  button.textContent = 'Copied!';
  setTimeout(() => {
    button.textContent = originalText;
  }, 2000);
});

document.getElementById('exportMarkdownBtn').addEventListener('click', () => {
  const summary = document.getElementById('summaryContent').textContent;
  const blob = new Blob([`# ${summary}`], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daily-summary-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('quickCaptureBtn').addEventListener('click', async () => {
  const input = document.getElementById('quickCaptureInput');
  const text = input.value.trim();

  if (!text) {
    return;
  }

  const button = document.getElementById('quickCaptureBtn');
  button.textContent = 'Capturing...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'quickCapture',
      data: { text }
    });

    if (response.success) {
      input.value = '';
      await loadTasks();
    }
  } catch (error) {
    console.error('Quick capture failed:', error);
  } finally {
    button.textContent = 'Capture Task';
    button.disabled = false;
  }
});

async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {
    calendarEnabled: false,
    defaultDuration: 30,
    aiEnabled: true
  };

  document.getElementById('defaultDuration').value = settings.defaultDuration;
  document.getElementById('aiEnabled').checked = settings.aiEnabled;
}

async function saveSettings() {
  const settings = {
    calendarEnabled: false,
    defaultDuration: parseInt(document.getElementById('defaultDuration').value),
    aiEnabled: document.getElementById('aiEnabled').checked
  };

  await chrome.storage.local.set({ settings });
}

document.getElementById('defaultDuration').addEventListener('change', saveSettings);
document.getElementById('aiEnabled').addEventListener('change', saveSettings);

async function checkAIStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAI' });

    const statusDiv = document.getElementById('aiStatus');

    if (response.available) {
      statusDiv.className = 'ai-status available';
      statusDiv.innerHTML = `
        <p><strong>✓ Chrome AI Available</strong></p>
        <p>Prompt API: ${response.hasPrompt ? '✓' : '✗'}</p>
        <p>Summarizer API: ${response.hasSummarizer ? '✓' : '✗'}</p>
        <p>Writer API: ${response.hasWriter ? '✓' : '✗'}</p>
        <p>Multimodal AI: ${response.hasMultimodal ? '✓' : '✗'}</p>
      `;
    } else {
      statusDiv.className = 'ai-status unavailable';

      if (response.error) {
        statusDiv.innerHTML = `
          <p><strong>✗ Chrome AI Unavailable</strong></p>
          <p>Error: ${response.error}</p>
          <p><strong>To fix:</strong></p>
          <ol>
            <li>Use Chrome Canary or Chrome Dev</li>
            <li>Enable AI flags in chrome://flags</li>
            <li>Join Chrome Built-in AI Early Preview Program</li>
          </ol>
        `;
      } else {
        statusDiv.innerHTML = `
          <p><strong>✗ Chrome AI Unavailable</strong></p>
          <p>Prompt API: ${response.hasPrompt ? '✓' : '✗'}</p>
          <p>Summarizer API: ${response.hasSummarizer ? '✓' : '✗'}</p>
          <p>Writer API: ${response.hasWriter ? '✓' : '✗'}</p>
          <p>Multimodal AI: ${response.hasMultimodal ? '✓' : '✗'}</p>
          <p><strong>To enable:</strong> Enable AI flags in chrome://flags</p>
        `;
      }
    }
  } catch (error) {
    console.error('Failed to check AI status:', error);
    const statusDiv = document.getElementById('aiStatus');
    statusDiv.className = 'ai-status unavailable';
    statusDiv.innerHTML = `
      <p><strong>✗ AI Status Check Failed</strong></p>
      <p>Error: ${error.message}</p>
    `;
  }
}

// Google Authentication Functions
async function checkGoogleAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getGoogleAuthStatus' });
    isGoogleAuthenticated = response.isAuthenticated;
    googleUserInfo = response.userInfo;
    updateGoogleAuthUI();
    if (isGoogleAuthenticated) {
      await loadGoogleSettings();
    }
  } catch (error) {
    console.error('Failed to check Google auth status:', error);
    updateGoogleAuthUI();
  }
}

function updateGoogleAuthUI() {
  const authStatus = document.getElementById('googleAuthStatus');
  const connectBtn = document.getElementById('connectGoogleBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const googleSettings = document.getElementById('googleSettings');
  
  if (isGoogleAuthenticated && googleUserInfo) {
    authStatus.innerHTML = `
      <p><strong>✓ Connected to Google</strong></p>
      <p>Signed in as: ${googleUserInfo.email || googleUserInfo.name}</p>
    `;
    connectBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    googleSettings.style.display = 'block';
  } else {
    authStatus.innerHTML = `
      <p><strong>✗ Not Connected to Google</strong></p>
      <p>Connect to sync tasks with Calendar & Tasks.</p>
    `;
    connectBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
    googleSettings.style.display = 'none';
  }
}

document.getElementById('connectGoogleBtn').addEventListener('click', async () => {
  const btn = document.getElementById('connectGoogleBtn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authenticateGoogle' });
    if (response.success) {
      isGoogleAuthenticated = true;
      googleUserInfo = response.userInfo;
      updateGoogleAuthUI();
      await loadGoogleSettings();
    } else {
      alert('Failed to connect to Google: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Google authentication failed:', error);
    alert('Failed to connect to Google. Please try again.');
  } finally {
    btn.textContent = 'Connect Google Account';
    btn.disabled = false;
  }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'signOutGoogle' });
    if (response.success) {
      isGoogleAuthenticated = false;
      googleUserInfo = null;
      updateGoogleAuthUI();
    }
  } catch (error) {
    console.error('Google sign out failed:', error);
  }
});

// Google settings change handlers
document.getElementById('calendarSelect').addEventListener('change', saveGooglePreferences);
document.getElementById('taskListSelect').addEventListener('change', saveGooglePreferences);
document.getElementById('calendarEnabled').addEventListener('change', saveGooglePreferences);

async function saveGooglePreferences() {
  const settings = {
    selectedCalendarId: document.getElementById('calendarSelect').value,
    selectedTaskListId: document.getElementById('taskListSelect').value,
    calendarEnabled: document.getElementById('calendarEnabled').checked
  };
  await chrome.storage.local.set({ settings });
}

// Task Status Functions
function getStatusIcon(status) {
  switch (status) {
    case 'pending': return '⏳';
    case 'in-progress': return '🔄';
    case 'completed': return '✅';
    default: return '⏳';
  }
}

async function updateTaskStatus(taskId, newStatus) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'updateTaskStatus', 
      data: { taskId, newStatus } 
    });
    
    if (response.success) {
      // Update UI immediately
      const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
      if (taskItem) {
        // Update status display
        const statusSpan = taskItem.querySelector('.task-status');
        statusSpan.textContent = `${getStatusIcon(newStatus)} ${newStatus}`;
        
        // Update button states
        taskItem.querySelectorAll('.status-btn').forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.status === newStatus) {
            btn.classList.add('active');
          }
        });
      }
    } else {
      alert('Failed to update task status: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to update task status:', error);
    alert('Failed to update task status. Please try again.');
  }
}

async function loadGoogleSettings() {
  try {
    // Load calendars
    const calendarsResponse = await chrome.runtime.sendMessage({ action: 'getGoogleCalendars' });
    if (calendarsResponse.success) {
      const calendarSelect = document.getElementById('calendarSelect');
      calendarSelect.innerHTML = calendarsResponse.calendars.map(cal => 
        `<option value="${cal.id}">${cal.summary}${cal.primary ? ' (Primary)' : ''}</option>`
      ).join('');
      calendarSelect.disabled = false;
    }
    
    // Load task lists
    const taskListsResponse = await chrome.runtime.sendMessage({ action: 'getGoogleTaskLists' });
    if (taskListsResponse.success) {
      const taskListSelect = document.getElementById('taskListSelect');
      taskListSelect.innerHTML = taskListsResponse.taskLists.map(list => 
        `<option value="${list.id}">${list.title}</option>`
      ).join('');
      taskListSelect.disabled = false;
    }
    
    // Load saved preferences
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    document.getElementById('calendarEnabled').checked = settings.calendarEnabled || false;
    if (settings.selectedCalendarId) {
      calendarSelect.value = settings.selectedCalendarId;
    }
    if (settings.selectedTaskListId) {
      taskListSelect.value = settings.selectedTaskListId;
    }
  } catch (error) {
    console.error('Failed to load Google settings:', error);
  }
}

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        calendarEnabled: false,
        defaultDuration: 30,
        aiEnabled: true
      }
    });
    await loadTasks();
    alert('All data cleared.');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Screenshot button handler
document.getElementById('screenshotBtn').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script to start screenshot capture
    chrome.tabs.sendMessage(tab.id, { action: 'startScreenshotCapture' }, async (response) => {
      if (chrome.runtime.lastError) {
        // Content script not injected yet, inject it
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });

        // Try again
        chrome.tabs.sendMessage(tab.id, { action: 'startScreenshotCapture' }, handleScreenshotResponse);
      } else {
        handleScreenshotResponse(response);
      }
    });

    window.close(); // Close popup to allow screenshot selection
  } catch (error) {
    console.error('Screenshot initiation failed:', error);
    alert('Failed to start screenshot capture. Please try again.');
  }
});

async function handleScreenshotResponse(response) {
  if (response && response.success) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const context = {
      title: tab.title,
      url: tab.url,
      timestamp: new Date().toISOString()
    };

    chrome.runtime.sendMessage({
      action: 'processScreenshot',
      imageData: response.imageData,
      context: context
    }, (processResponse) => {
      if (processResponse && processResponse.success) {
        console.log('Screenshot tasks created:', processResponse.tasks.length);
      }
    });
  }
}

// Audio recording handlers
document.getElementById('audioBtn').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

      // Convert blob to base64 data URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const audioData = reader.result;

        const context = {
          source: 'Voice memo',
          timestamp: new Date().toISOString()
        };

        const response = await chrome.runtime.sendMessage({
          action: 'processAudio',
          audioData: audioData,
          context: context
        });

        if (response && response.success) {
          await loadTasks();
          alert(`Voice memo captured! ${response.tasks.length} task(s) created.`);
        }
      };
      reader.readAsDataURL(audioBlob);

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      clearInterval(recordingInterval);
    };

    mediaRecorder.start();
    recordingStartTime = Date.now();

    // Show recording UI
    document.getElementById('audioRecorder').style.display = 'block';
    document.getElementById('audioBtn').style.display = 'none';

    // Update recording time
    recordingInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      document.getElementById('recordingTime').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);

  } catch (error) {
    console.error('Audio recording failed:', error);
    alert('Failed to access microphone. Please grant permission and try again.');
  }
});

document.getElementById('stopRecordingBtn').addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    document.getElementById('audioRecorder').style.display = 'none';
    document.getElementById('audioBtn').style.display = 'inline-block';
  }
});

loadTasks();
