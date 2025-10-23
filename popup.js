let currentStatus = 'todo';
let draggedTaskId = null;

const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

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
    } else if (targetTab === 'summary') {
      loadProjectBreakdown();
    }
  });
});

// Status navigation handlers
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('status-nav-btn')) {
    const status = e.target.dataset.status;
    switchTaskView(status);
  }
});

async function migrateTasks() {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];
  let needsMigration = false;

  const migratedTasks = tasks.map(task => {
    if (!task.status) {
      task.status = 'todo';
      needsMigration = true;
    }
    if (!task.order) {
      task.order = new Date(task.createdAt).getTime();
      needsMigration = true;
    }
    return task;
  });

  if (needsMigration) {
    await chrome.storage.local.set({ tasks: migratedTasks });
    console.log('[Migration] Tasks migrated with status and order fields');
  }
}

async function loadTasks() {
  await migrateTasks();

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  // Update stats
  const todoTasks = tasks.filter(task => task.status === 'todo');
  const inProgressTasks = tasks.filter(task => task.status === 'in_progress');
  const doneTasks = tasks.filter(task => task.status === 'done');

  document.getElementById('todoCount').textContent = todoTasks.length;
  document.getElementById('inProgressCount').textContent = inProgressTasks.length;
  document.getElementById('doneCount').textContent = doneTasks.length;

  // Filter tasks by current status
  const currentTasks = tasks.filter(task => task.status === currentStatus);

  const taskList = document.getElementById('taskList');

  if (currentTasks.length === 0) {
    const emptyMessage = currentStatus === 'todo'
      ? 'No tasks to do. Highlight text on any webpage to get started!'
      : currentStatus === 'in_progress'
        ? 'No tasks in progress. Move tasks from Todo to get started!'
        : 'No completed tasks yet. Mark tasks as done to see them here!';

    taskList.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  // Sort by order
  currentTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

  taskList.innerHTML = currentTasks.map(task => renderTaskItem(task)).join('');

  // Add event listeners for all task interactions
  addTaskEventListeners();
}

function renderTaskItem(task) {
  const priorityColors = {
    high: '#ff4757',
    medium: '#ffa502',
    low: '#2ed573'
  };

  const statusIcons = {
    todo: '⭕',
    in_progress: '🔄',
    done: '✅'
  };

  return `
    <div class="task-item" data-task-id="${task.id}" draggable="true">
      <div class="task-header">
        <div class="task-status">
          <span class="status-icon">${statusIcons[task.status]}</span>
          <input type="checkbox" class="task-checkbox" ${task.status === 'done' ? 'checked' : ''}>
        </div>
        <div class="task-content">
          <div class="task-title" contenteditable="true" data-field="task">${escapeHtml(task.task)}</div>
          <div class="task-meta">
            <div class="task-field">
              <label>Priority:</label>
              <select class="task-priority" data-field="priority">
                <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
              </select>
            </div>
            <div class="task-field">
              <label>Duration:</label>
              <input type="number" class="task-duration" data-field="estimatedDuration" 
                     value="${task.estimatedDuration || 30}" min="5" max="480" step="5">
              <span>min</span>
            </div>
            <div class="task-field">
              <label>Project:</label>
              <input type="text" class="task-project" data-field="project" 
                     value="${escapeHtml(task.project || 'General')}" placeholder="Project name">
            </div>
            <div class="task-field">
              <label>Deadline:</label>
              <input type="date" class="task-deadline" data-field="deadline" 
                     value="${task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}">
            </div>
          </div>
        </div>
        <div class="task-actions">
          <button class="task-delete" data-task-id="${task.id}">🗑️</button>
          <div class="drag-handle">⋮⋮</div>
        </div>
      </div>
      <div class="task-priority-indicator" style="background-color: ${priorityColors[task.priority || 'medium']}"></div>
    </div>
  `;
}

function addTaskEventListeners() {
  // Checkbox status toggle
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const taskItem = e.target.closest('.task-item');
      const taskId = taskItem.dataset.taskId;
      const currentStatus = taskItem.closest('.task-item').dataset.taskId;
      toggleTaskStatus(taskId);
    });
  });

  // Inline editing
  document.querySelectorAll('[data-field]').forEach(field => {
    field.addEventListener('blur', (e) => {
      saveTaskEdit(e.target);
    });

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.matches('select, input[type="date"]')) {
        e.preventDefault();
        e.target.blur();
      }
    });
  });

  // Delete buttons
  document.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = e.target.dataset.taskId;
      deleteTask(taskId);
    });
  });

  // Drag and drop
  document.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
  });
}

async function toggleTaskStatus(taskId) {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Cycle through statuses: todo -> in_progress -> done -> todo
  const statusCycle = ['todo', 'in_progress', 'done'];
  const currentIndex = statusCycle.indexOf(task.status);
  const nextIndex = (currentIndex + 1) % statusCycle.length;
  task.status = statusCycle[nextIndex];

  await chrome.storage.local.set({ tasks });

  // Animate the change
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskItem) {
    taskItem.style.transform = 'scale(0.95)';
    taskItem.style.opacity = '0.7';

    setTimeout(() => {
      loadTasks(); // Reload to show updated status
    }, 150);
  }
}

async function saveTaskEdit(field) {
  const taskItem = field.closest('.task-item');
  const taskId = taskItem.dataset.taskId;
  const fieldName = field.dataset.field;
  let value = field.value;

  // Handle different field types
  if (fieldName === 'task') {
    value = field.textContent.trim();
  } else if (fieldName === 'estimatedDuration') {
    value = parseInt(value) || 30;
  } else if (fieldName === 'deadline') {
    value = value ? new Date(value).toISOString() : null;
  }

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task[fieldName] = value;
    await chrome.storage.local.set({ tasks });

    // Visual feedback
    field.style.backgroundColor = '#e8f5e8';
    setTimeout(() => {
      field.style.backgroundColor = '';
    }, 300);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskItem) {
    // Animate deletion
    taskItem.style.transform = 'translateX(-100%)';
    taskItem.style.opacity = '0';

    setTimeout(async () => {
      // Remove from local storage
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      await chrome.storage.local.set({ tasks: updatedTasks });

      // Delete from Google services if synced
      if (task.syncedToGoogle) {
        try {
          await chrome.runtime.sendMessage({
            action: 'deleteFromGoogle',
            data: { taskId: taskId, task: task }
          });
          console.log('[Delete] Task removed from Google services');
        } catch (error) {
          console.error('[Delete] Failed to remove from Google services:', error);
        }
      }

      loadTasks();
    }, 300);
  }
}

function switchTaskView(status) {
  currentStatus = status;

  // Update nav buttons
  document.querySelectorAll('.status-nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-status="${status}"]`).classList.add('active');

  // Animate content transition
  const taskList = document.getElementById('taskList');
  taskList.style.opacity = '0';
  taskList.style.transform = 'translateY(10px)';

  setTimeout(() => {
    loadTasks();
    taskList.style.opacity = '1';
    taskList.style.transform = 'translateY(0)';
  }, 150);
}

// Drag and Drop Implementation
function handleDragStart(e) {
  draggedTaskId = e.target.dataset.taskId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const taskItem = e.target.closest('.task-item');
  if (taskItem && taskItem.dataset.taskId !== draggedTaskId) {
    taskItem.classList.add('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();

  const targetTaskItem = e.target.closest('.task-item');
  if (!targetTaskItem || !draggedTaskId) return;

  const targetTaskId = targetTaskItem.dataset.taskId;

  if (targetTaskId === draggedTaskId) return;

  // Remove drag classes
  document.querySelectorAll('.task-item').forEach(item => {
    item.classList.remove('drag-over');
  });

  // Reorder tasks
  reorderTasks(draggedTaskId, targetTaskId);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  draggedTaskId = null;
}

async function reorderTasks(draggedId, targetId) {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const draggedTask = tasks.find(t => t.id === draggedId);
  const targetTask = tasks.find(t => t.id === targetId);

  if (!draggedTask || !targetTask) return;

  // Update order values
  const draggedOrder = draggedTask.order;
  const targetOrder = targetTask.order;

  draggedTask.order = targetOrder;
  targetTask.order = draggedOrder;

  await chrome.storage.local.set({ tasks });

  // Animate the reorder
  const draggedElement = document.querySelector(`[data-task-id="${draggedId}"]`);
  if (draggedElement) {
    draggedElement.style.transform = 'scale(1.02)';
    setTimeout(() => {
      loadTasks();
    }, 100);
  }
}

// Quick capture functionality
document.getElementById('quickCaptureBtn').addEventListener('click', async () => {
  const input = document.getElementById('quickCaptureInput');
  const text = input.value.trim();

  if (!text) return;

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

      // Animate new task
      const newTask = document.querySelector(`[data-task-id="${response.task.id}"]`);
      if (newTask) {
        newTask.style.transform = 'scale(0.8)';
        newTask.style.opacity = '0';
        setTimeout(() => {
          newTask.style.transform = 'scale(1)';
          newTask.style.opacity = '1';
        }, 50);
      }
    }
  } catch (error) {
    console.error('Quick capture failed:', error);
  } finally {
    button.textContent = 'Capture Task';
    button.disabled = false;
  }
});

// Summary functionality (unchanged)
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

async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {
    googleSyncEnabled: true,
    defaultDuration: 30,
    aiEnabled: true
  };

  document.getElementById('googleSyncEnabled').checked = settings.googleSyncEnabled !== false;
  document.getElementById('defaultDuration').value = settings.defaultDuration;
  document.getElementById('aiEnabled').checked = settings.aiEnabled;

  await checkGoogleAuthStatus();
}

async function saveSettings() {
  const settings = {
    googleSyncEnabled: document.getElementById('googleSyncEnabled').checked,
    defaultDuration: parseInt(document.getElementById('defaultDuration').value),
    aiEnabled: document.getElementById('aiEnabled').checked
  };

  await chrome.storage.local.set({ settings });
}

async function checkGoogleAuthStatus() {
  const statusText = document.getElementById('googleAuthStatus');
  statusText.textContent = 'Checking Google account status...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkGoogleAuth' });

    const signedOutView = document.getElementById('signedOutView');
    const signedInView = document.getElementById('signedInView');

    if (response.signedIn) {
      signedOutView.style.display = 'none';
      signedInView.style.display = 'block';
      document.getElementById('googleEmail').textContent = response.email || 'Unknown';
      statusText.textContent = '✓ Google account connected. Tasks will sync to Google Tasks and Calendar.';
      statusText.style.color = '#4caf50';
    } else {
      signedOutView.style.display = 'block';
      signedInView.style.display = 'none';
      const manifest = chrome.runtime.getManifest();
      const extensionId = chrome.runtime.id;
      const clientId = manifest.oauth2?.client_id || 'N/A';
      statusText.textContent = `Sign in to sync tasks to Google Tasks and Calendar. If sign-in fails, ensure Google Cloud OAuth Client matches Extension ID.\nExtension ID: ${extensionId}\nOAuth Client ID: ${clientId}`;
      statusText.style.color = '#666';
    }
  } catch (error) {
    console.error('Failed to check Google auth status:', error);
    statusText.textContent = '✗ Failed to check Google account status.';
    statusText.style.color = '#f44336';
  }
}

async function handleGoogleSignIn() {
  const button = document.getElementById('googleSignInBtn');
  button.textContent = 'Signing in...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleSignIn' });

    if (response.success) {
      await checkGoogleAuthStatus();
      alert('Successfully signed in to Google!');
    } else {
      alert('Failed to sign in: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Google sign in failed:', error);
    alert('Failed to sign in to Google. Please try again.');
  } finally {
    button.textContent = 'Sign in with Google';
    button.disabled = false;
  }
}

async function handleGoogleSignOut() {
  if (!confirm('Are you sure you want to sign out of Google? Future tasks will not sync until you sign in again.')) {
    return;
  }

  const button = document.getElementById('googleSignOutBtn');
  button.textContent = 'Signing out...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleSignOut' });

    if (response.success) {
      await checkGoogleAuthStatus();
      alert('Successfully signed out of Google.');
    } else {
      alert('Failed to sign out: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Google sign out failed:', error);
    alert('Failed to sign out. Please try again.');
  } finally {
    button.textContent = 'Sign Out';
    button.disabled = false;
  }
}

document.getElementById('googleSignInBtn').addEventListener('click', handleGoogleSignIn);
document.getElementById('googleSignOutBtn').addEventListener('click', handleGoogleSignOut);
document.getElementById('googleSyncEnabled').addEventListener('change', saveSettings);
document.getElementById('defaultDuration').addEventListener('change', saveSettings);
document.getElementById('aiEnabled').addEventListener('change', saveSettings);

async function checkAIStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'checkAI' });

  const statusDiv = document.getElementById('aiStatus');

  if (response.available) {
    statusDiv.className = 'ai-status available';
    statusDiv.innerHTML = `
      <p><strong>✓ Chrome AI Available</strong></p>
      <p>Prompt API: ${response.hasPrompt ? '✓' : '✗'}</p>
      <p>Summarizer API: ${response.hasSummarizer ? '✓' : '✗'}</p>
      <p>Writer API: ${response.hasWriter ? '✓' : '✗'}</p>
    `;
  } else {
    statusDiv.className = 'ai-status unavailable';
    statusDiv.innerHTML = `
      <p><strong>✗ Chrome AI Not Available</strong></p>
      <p>Make sure you're using Chrome Canary or Dev with AI features enabled.</p>
      <p><a href="https://developer.chrome.com/docs/ai/join-epp" target="_blank">Join Early Preview Program</a></p>
    `;
  }
}

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        googleSyncEnabled: true,
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

// Initialize
loadTasks();