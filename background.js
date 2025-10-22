// Import Google integration modules
import { googleAuth } from './google-auth.js';
import { googleCalendar } from './google-calendar.js';
import { googleTasks } from './google-tasks.js';

let aiSession = null;
let summarizerSession = null;
let writerSession = null;
let multimodalAiSession = null;

async function cropImage(dataUrl, region) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(region.width, region.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(
        img,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
      );

      canvas.convertToBlob({ type: 'image/png' }).then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function initializeAI() {
  try {
    console.log('[AI Init] Starting AI initialization...');

    // Check if AI APIs are available
    if (typeof ai === 'undefined') {
      console.log('[AI Init] AI APIs not available - make sure Chrome AI flags are enabled');
      return false;
    }

    // Initialize Prompt API (LanguageModel)
    if ('languageModel' in ai) {
      console.log('[AI Init] Creating LanguageModel session with language [en]...');
      try {
        const capabilities = await ai.languageModel.capabilities();
        console.log('[AI Init] LanguageModel capabilities:', capabilities);

        if (capabilities.available === 'readily') {
          aiSession = await ai.languageModel.create({
            temperature: 0.7,
            topK: 3
          });
          console.log('[AI Init] ✓ Prompt API (LanguageModel) initialized successfully');
        } else {
          console.log('[AI Init] LanguageModel not readily available');
        }
      } catch (error) {
        console.error('[AI Init] LanguageModel initialization failed:', error);
      }
    } else {
      console.log('[AI Init] LanguageModel not available');
    }

    // Initialize Summarizer API
    if ('summarizer' in ai) {
      console.log('[AI Init] Creating Summarizer session...');
      try {
        const summarizerCapabilities = await ai.summarizer.capabilities();
        console.log('[AI Init] Summarizer capabilities:', summarizerCapabilities);

        if (summarizerCapabilities.available === 'readily') {
          summarizerSession = await ai.summarizer.create({
            type: 'key-points',
            format: 'plain-text',
            length: 'short'
          });
          console.log('[AI Init] ✓ Summarizer API initialized successfully');
        } else {
          console.log('[AI Init] Summarizer not readily available');
        }
      } catch (error) {
        console.error('[AI Init] Summarizer initialization failed:', error);
      }
    } else {
      console.log('[AI Init] Summarizer not available');
    }

    // Initialize Writer API
    if ('writer' in ai) {
      console.log('[AI Init] Creating Writer session...');
      try {
        const writerCapabilities = await ai.writer.capabilities();
        console.log('[AI Init] Writer capabilities:', writerCapabilities);

        if (writerCapabilities.available === 'readily') {
          writerSession = await ai.writer.create({
            tone: 'formal',
            format: 'plain-text',
            length: 'medium'
          });
          console.log('[AI Init] ✓ Writer API initialized successfully');
        } else {
          console.log('[AI Init] Writer not readily available');
        }
      } catch (error) {
        console.error('[AI Init] Writer initialization failed:', error);
      }
    } else {
      console.log('[AI Init] Writer not available');
    }

    // Initialize multimodal AI session for image/audio input
    if ('languageModel' in ai) {
      console.log('[AI Init] Creating multimodal AI session...');
      try {
        const multimodalCapabilities = await ai.languageModel.capabilities();
        if (multimodalCapabilities.available === 'readily') {
          multimodalAiSession = await ai.languageModel.create({
            temperature: 0.7,
            topK: 3,
            systemPrompt: 'You are a task extraction assistant. Extract actionable tasks from images and audio with deadlines, priorities, and context.'
          });
          console.log('[AI Init] ✓ Multimodal AI session initialized successfully');
        } else {
          console.log('[AI Init] Multimodal AI not readily available');
        }
      } catch (error) {
        console.error('[AI Init] Multimodal AI initialization failed:', error);
      }
    } else {
      console.log('[AI Init] Multimodal AI not available');
    }

    console.log('[AI Init] ========================================');
    console.log('[AI Init] Initialization complete:');
    console.log('[AI Init]   - LanguageModel (Prompt):', aiSession ? '✓ Ready' : '✗ Not available');
    console.log('[AI Init]   - Summarizer:', summarizerSession ? '✓ Ready' : '✗ Not available');
    console.log('[AI Init]   - Writer:', writerSession ? '✓ Ready' : '✗ Not available');
    console.log('[AI Init]   - Multimodal:', multimodalAiSession ? '✓ Ready' : '✗ Not available');
    console.log('[AI Init] ========================================');

    return true;
  } catch (error) {
    console.error('[AI Init] ✗ Complete failure during AI initialization:', error);
    return false;
  }
}

async function extractTaskFromText(text, context) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled) {
      return createFallbackTask(text, context);
    }

    if (!aiSession) {
      await initializeAI();
    }

    if (!aiSession) {
      return createFallbackTask(text, context);
    }

    const prompt = `Analyze the following highlighted text and extract a clear, actionable task.

Context:
- Page: ${context.title}
- URL: ${context.url}

Highlighted text:
"${text}"

Extract the following in JSON format:
{
  "task": "Clear, actionable task description",
  "priority": "high|medium|low",
  "estimatedDuration": number in minutes,
  "deadline": "inferred deadline or null",
  "project": "inferred project/category name",
  "tags": ["tag1", "tag2"]
}

Be concise and specific. If information is not explicit, make reasonable inferences.`;

    const response = await aiSession.prompt(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        return {
          ...extracted,
          source: 'ai',
          originalText: text,
          context: context
        };
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
    }

    return createFallbackTask(text, context);
  } catch (error) {
    console.error('Task extraction failed:', error);
    return createFallbackTask(text, context);
  }
}

async function summarizeText(text) {
  try {
    if (summarizerSession) {
      return await summarizerSession.summarize(text);
    }

    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  } catch (error) {
    console.error('Summarization failed:', error);
    return text.substring(0, 100);
  }
}

function createFallbackTask(text, context) {
  const summary = text.length > 100 ? text.substring(0, 100) + '...' : text;

  return {
    task: summary,
    priority: 'medium',
    estimatedDuration: 30,
    deadline: null,
    project: context.title || 'General',
    tags: [],
    source: 'fallback',
    originalText: text,
    context: context
  };
}

async function saveTask(taskData) {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const task = {
    id: taskId,
    ...taskData,
    createdAt: new Date().toISOString(),
    status: 'pending',
    googleCalendarId: null,
    googleTaskId: null
  };

  const result = await chrome.storage.local.get(['tasks', 'settings']);
  const tasks = result.tasks || [];
  const settings = result.settings || { calendarEnabled: false };

  tasks.push(task);
  await chrome.storage.local.set({ tasks });

  // Sync to Google services if authenticated
  try {
    const isAuthenticated = await googleAuth.isUserAuthenticated();
    if (isAuthenticated) {
      console.log('[Save Task] Syncing to Google services...');
      await syncTaskToGoogle(task);
    } else {
      console.log('[Save Task] Not authenticated with Google, skipping sync');
    }
  } catch (error) {
    console.error('[Save Task] Google sync failed:', error);
  }

  return task;
}

async function syncTaskToGoogle(task) {
  try {
    console.log('[Google Sync] Starting sync for task:', task.task);
    
    const settings = await chrome.storage.local.get(['settings']);
    const { selectedCalendarId, selectedTaskListId, calendarEnabled } = settings.settings || {};
    
    let calendarEvent = null;
    let googleTask = null;
    
    // Create Calendar event if enabled
    if (calendarEnabled && selectedCalendarId) {
      try {
        console.log('[Google Sync] Creating Calendar event...');
        calendarEvent = await googleCalendar.createEvent(task, selectedCalendarId);
        console.log('[Google Sync] ✓ Calendar event created:', calendarEvent.id);
      } catch (error) {
        console.error('[Google Sync] ✗ Calendar event creation failed:', error);
      }
    }
    
    // Create Google Task
    if (selectedTaskListId) {
      try {
        console.log('[Google Sync] Creating Google Task...');
        googleTask = await googleTasks.createTask(task, selectedTaskListId);
        console.log('[Google Sync] ✓ Google Task created:', googleTask.id);
      } catch (error) {
        console.error('[Google Sync] ✗ Google Task creation failed:', error);
      }
    } else {
      // Use default task list
      try {
        console.log('[Google Sync] Using default task list...');
        googleTask = await googleTasks.createTask(task, '@default');
        console.log('[Google Sync] ✓ Google Task created in default list:', googleTask.id);
      } catch (error) {
        console.error('[Google Sync] ✗ Google Task creation failed:', error);
      }
    }
    
    // Update local task with Google IDs
    if (calendarEvent || googleTask) {
      const result = await chrome.storage.local.get(['tasks']);
      const tasks = result.tasks || [];
      const taskIndex = tasks.findIndex(t => t.id === task.id);
      
      if (taskIndex !== -1) {
        tasks[taskIndex].googleCalendarId = calendarEvent?.id || null;
        tasks[taskIndex].googleTaskId = googleTask?.id || null;
        await chrome.storage.local.set({ tasks });
        console.log('[Google Sync] ✓ Local task updated with Google IDs');
      }
    }
    
    console.log('[Google Sync] ✓ Sync completed');
  } catch (error) {
    console.error('[Google Sync] ✗ Sync failed:', error);
    throw error;
  }
}

async function createCalendarEvent(task, settings) {
  try {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + (task.estimatedDuration || 30) * 60000);

    const event = {
      summary: task.task,
      description: `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    console.log('TODO: Google Calendar API integration - Event prepared:', event);

  } catch (error) {
    console.error('Failed to create calendar event:', error);
  }
}

async function extractTaskFromImage(imageDataUrl, context) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled || !multimodalAiSession) {
      return createFallbackImageTask(context);
    }

    // Convert data URL to blob for Prompt API
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();

    const prompt = `Analyze this screenshot and extract any tasks, action items, or work to be done.

Context:
- Page: ${context.title}
- URL: ${context.url}

Look for:
- Task descriptions or action items
- Deadlines or dates mentioned
- Priority indicators
- Project or category information

Extract the following in JSON format:
{
  "tasks": [
    {
      "task": "Clear, actionable task description",
      "priority": "high|medium|low",
      "estimatedDuration": number in minutes,
      "deadline": "inferred deadline or null",
      "project": "inferred project/category name",
      "tags": ["tag1", "tag2"]
    }
  ]
}

If no clear tasks are found, describe what you see and suggest potential action items.`;

    const aiResponse = await multimodalAiSession.prompt(prompt, {
      image: blob
    });

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        if (extracted.tasks && extracted.tasks.length > 0) {
          return extracted.tasks.map(task => ({
            ...task,
            source: 'image-ai',
            imageDataUrl: imageDataUrl,
            context: context
          }));
        }
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
    }

    return [createFallbackImageTask(context, imageDataUrl)];
  } catch (error) {
    console.error('Image task extraction failed:', error);
    return [createFallbackImageTask(context, imageDataUrl)];
  }
}

function createFallbackImageTask(context, imageDataUrl) {
  return {
    task: `Review screenshot from ${context.title}`,
    priority: 'medium',
    estimatedDuration: 15,
    deadline: null,
    project: context.title || 'General',
    tags: ['screenshot'],
    source: 'fallback',
    imageDataUrl: imageDataUrl,
    context: context
  };
}

async function extractTaskFromAudio(audioBlob, context) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled || !multimodalAiSession) {
      return createFallbackAudioTask(context);
    }

    const prompt = `Transcribe and analyze this audio recording to extract tasks and action items.

Context:
- Recorded at: ${new Date().toLocaleString()}
- Source: ${context.source || 'Voice memo'}

Extract the following in JSON format:
{
  "transcription": "Full transcription of the audio",
  "tasks": [
    {
      "task": "Clear, actionable task description",
      "priority": "high|medium|low",
      "estimatedDuration": number in minutes,
      "deadline": "inferred deadline or null",
      "project": "inferred project/category name",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Identify all action items, meetings mentioned, deadlines, and key points.`;

    const aiResponse = await multimodalAiSession.prompt(prompt, {
      audio: audioBlob
    });

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        if (extracted.tasks && extracted.tasks.length > 0) {
          return extracted.tasks.map(task => ({
            ...task,
            source: 'audio-ai',
            transcription: extracted.transcription,
            context: context
          }));
        }
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
    }

    return [createFallbackAudioTask(context)];
  } catch (error) {
    console.error('Audio task extraction failed:', error);
    return [createFallbackAudioTask(context)];
  }
}

function createFallbackAudioTask(context) {
  return {
    task: `Review voice memo from ${new Date().toLocaleString()}`,
    priority: 'medium',
    estimatedDuration: 10,
    deadline: null,
    project: 'Voice Notes',
    tags: ['audio', 'voice-memo'],
    source: 'fallback',
    context: context
  };
}

async function generateDailySummary() {
  try {
    const result = await chrome.storage.local.get(['tasks']);
    const tasks = result.tasks || [];

    const today = new Date().toDateString();
    const todayTasks = tasks.filter(task =>
      new Date(task.createdAt).toDateString() === today
    );

    if (todayTasks.length === 0) {
      return 'No tasks captured today.';
    }

    const projectGroups = {};
    todayTasks.forEach(task => {
      const project = task.project || 'General';
      if (!projectGroups[project]) {
        projectGroups[project] = [];
      }
      projectGroups[project].push(task);
    });

    let summaryText = `Daily Work Summary - ${new Date().toLocaleDateString()}\n\n`;

    let totalMinutes = 0;
    Object.keys(projectGroups).forEach(project => {
      const projectTasks = projectGroups[project];
      const projectMinutes = projectTasks.reduce((sum, task) => sum + (task.estimatedDuration || 30), 0);
      totalMinutes += projectMinutes;

      summaryText += `${project} (${Math.round(projectMinutes / 60 * 10) / 10}h):\n`;
      projectTasks.forEach(task => {
        summaryText += `  - ${task.task}\n`;
      });
      summaryText += '\n';
    });

    summaryText += `\nTotal time: ${Math.round(totalMinutes / 60 * 10) / 10} hours\n`;
    summaryText += `Tasks captured: ${todayTasks.length}`;

    if (writerSession) {
      try {
        const enhancedPrompt = `Create a professional daily work summary based on this data:\n\n${summaryText}`;
        const enhanced = await writerSession.write(enhancedPrompt);
        return enhanced || summaryText;
      } catch (e) {
        console.error('Writer API failed, using fallback:', e);
        return summaryText;
      }
    }

    return summaryText;
  } catch (error) {
    console.error('Failed to generate summary:', error);
    return 'Failed to generate summary.';
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.action);

  if (message.action === 'captureScreenshot') {
    (async () => {
      try {
        console.log('[Background] Capturing screenshot with region:', message.region);

        // Capture visible tab
        const screenshot = await chrome.tabs.captureVisibleTab(null, {
          format: 'png'
        });

        // Crop the screenshot to the selected region
        const croppedImage = await cropImage(screenshot, message.region);

        sendResponse({ success: true, imageData: croppedImage });
      } catch (error) {
        console.error('[Background] Screenshot capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'processScreenshot') {
    (async () => {
      try {
        console.log('[Background] Processing screenshot with AI...');
        const tasks = await extractTaskFromImage(message.imageData, message.context);

        const savedTasks = [];
        for (const taskData of tasks) {
          const task = await saveTask(taskData);
          savedTasks.push(task);
        }

        console.log('[Background] Screenshot tasks saved:', savedTasks.length);
        sendResponse({ success: true, tasks: savedTasks });
      } catch (error) {
        console.error('[Background] Screenshot processing failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'processAudio') {
    (async () => {
      try {
        console.log('[Background] Processing audio with AI...');

        // Convert base64 audio data to blob
        const response = await fetch(message.audioData);
        const audioBlob = await response.blob();

        const tasks = await extractTaskFromAudio(audioBlob, message.context);

        const savedTasks = [];
        for (const taskData of tasks) {
          const task = await saveTask(taskData);
          savedTasks.push(task);
        }

        console.log('[Background] Audio tasks saved:', savedTasks.length);
        sendResponse({ success: true, tasks: savedTasks });
      } catch (error) {
        console.error('[Background] Audio processing failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'captureTask') {
    (async () => {
      try {
        console.log('[Background] Processing task capture...');
        const extracted = await extractTaskFromText(
          message.data.selectedText,
          message.data
        );

        console.log('[Background] Task extracted:', extracted);
        const task = await saveTask(extracted);

        console.log('[Background] Task saved, sending response');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] Capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'generateSummary') {
    (async () => {
      try {
        const summary = await generateDailySummary();
        sendResponse({ success: true, summary });
      } catch (error) {
        console.error('Summary generation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'checkAI') {
    (async () => {
      try {
        // Check if AI APIs are available at all
        if (typeof ai === 'undefined') {
          sendResponse({
            available: false,
            hasPrompt: false,
            hasSummarizer: false,
            hasWriter: false,
            hasMultimodal: false,
            error: 'AI APIs not available. Make sure Chrome AI flags are enabled.'
          });
          return;
        }

        const available = await initializeAI();
        sendResponse({
          available,
          hasPrompt: !!aiSession,
          hasSummarizer: !!summarizerSession,
          hasWriter: !!writerSession,
          hasMultimodal: !!multimodalAiSession
        });
      } catch (error) {
        console.error('[Background] AI check failed:', error);
        sendResponse({
          available: false,
          hasPrompt: false,
          hasSummarizer: false,
          hasWriter: false,
          hasMultimodal: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.action === 'quickCapture') {
    (async () => {
      try {
        const extracted = await extractTaskFromText(
          message.data.text,
          { title: 'Quick Capture', url: 'manual', timestamp: new Date().toISOString() }
        );

        const task = await saveTask(extracted);
        sendResponse({ success: true, task });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Google Authentication handlers
  if (message.action === 'authenticateGoogle') {
    (async () => {
      try {
        const result = await googleAuth.authenticate();
        sendResponse(result);
      } catch (error) {
        console.error('[Background] Google authentication failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'getGoogleAuthStatus') {
    (async () => {
      try {
        const isAuthenticated = await googleAuth.isUserAuthenticated();
        const userInfo = await googleAuth.getUserInfo();
        sendResponse({
          isAuthenticated,
          userInfo: isAuthenticated ? userInfo : null
        });
      } catch (error) {
        console.error('[Background] Google auth status check failed:', error);
        sendResponse({ isAuthenticated: false, userInfo: null });
      }
    })();
    return true;
  }

  if (message.action === 'signOutGoogle') {
    (async () => {
      try {
        await googleAuth.signOut();
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] Google sign out failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Google Calendar handlers
  if (message.action === 'getGoogleCalendars') {
    (async () => {
      try {
        const calendars = await googleCalendar.listCalendars();
        sendResponse({ success: true, calendars });
      } catch (error) {
        console.error('[Background] Failed to get calendars:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Google Tasks handlers
  if (message.action === 'getGoogleTaskLists') {
    (async () => {
      try {
        const taskLists = await googleTasks.listTaskLists();
        sendResponse({ success: true, taskLists });
      } catch (error) {
        console.error('[Background] Failed to get task lists:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Task status update handler
  if (message.action === 'updateTaskStatus') {
    (async () => {
      try {
        const { taskId, newStatus } = message.data;
        
        // Update local task
        const result = await chrome.storage.local.get(['tasks']);
        const tasks = result.tasks || [];
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        
        if (taskIndex !== -1) {
          tasks[taskIndex].status = newStatus;
          await chrome.storage.local.set({ tasks });
          
          // Update Google services if authenticated
          const isAuthenticated = await googleAuth.isUserAuthenticated();
          if (isAuthenticated) {
            const task = tasks[taskIndex];
            const settings = await chrome.storage.local.get(['settings']);
            const { selectedCalendarId, selectedTaskListId, calendarEnabled } = settings.settings || {};
            
            // Update Calendar event
            if (calendarEnabled && selectedCalendarId && task.googleCalendarId) {
              try {
                await googleCalendar.updateEventStatus(task.googleCalendarId, newStatus, selectedCalendarId);
                console.log('[Background] ✓ Calendar event updated');
              } catch (error) {
                console.error('[Background] ✗ Calendar update failed:', error);
              }
            }
            
            // Update Google Task
            if (task.googleTaskId) {
              try {
                const taskListId = selectedTaskListId || '@default';
                await googleTasks.updateTaskStatus(task.googleTaskId, newStatus, taskListId);
                console.log('[Background] ✓ Google Task updated');
              } catch (error) {
                console.error('[Background] ✗ Google Task update failed:', error);
              }
            }
          }
          
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Task not found' });
        }
      } catch (error) {
        console.error('[Background] Task status update failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'captureScreenshot') {
    try {
      // Inject content script if not already injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Start screenshot capture
      chrome.tabs.sendMessage(tab.id, { action: 'startScreenshotCapture' }, async (response) => {
        if (response && response.success) {
          // Process the screenshot
          const context = {
            title: tab.title,
            url: tab.url,
            timestamp: new Date().toISOString()
          };

          const processResponse = await chrome.runtime.sendMessage({
            action: 'processScreenshot',
            imageData: response.imageData,
            context: context
          });

          if (processResponse.success) {
            console.log('Screenshot tasks created:', processResponse.tasks.length);
          }
        }
      });
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    }
  } else if (info.menuItemId === 'captureAudio') {
    // Open popup to audio recording tab
    chrome.action.openPopup();
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('GetShitDone event:', details.reason);
  await initializeAI();

  // Create context menus
  chrome.contextMenus.create({
    id: 'captureScreenshot',
    title: '📸 Capture Screenshot as Task',
    contexts: ['page', 'selection', 'link', 'image']
  });

  chrome.contextMenus.create({
    id: 'captureAudio',
    title: '🎤 Record Voice Task',
    contexts: ['page']
  });

  if (details.reason === 'install') {
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        calendarEnabled: false,
        defaultDuration: 30,
        aiEnabled: true
      }
    });
    console.log('Initial storage setup complete');
  } else if (details.reason === 'update') {
    const result = await chrome.storage.local.get(['settings']);
    if (!result.settings) {
      await chrome.storage.local.set({
        settings: {
          calendarEnabled: false,
          defaultDuration: 30,
          aiEnabled: true
        }
      });
    }
    console.log('Extension updated, preserving existing data');
  }
});

initializeAI();
