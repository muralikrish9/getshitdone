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

  taskList.innerHTML = todayTasks.reverse().map(task => `
    <div class="task-item">
      <div class="task-title">${escapeHtml(task.task)}</div>
      <div class="task-meta">
        <span>📁 ${escapeHtml(task.project || 'General')}</span>
        <span>⏱️ ${task.estimatedDuration || 30}min</span>
        <span>🎯 ${task.priority || 'medium'}</span>
      </div>
    </div>
  `).join('');
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

loadTasks();
