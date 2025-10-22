import { getAuthToken, isSignedIn, revokeToken, getUserEmail } from './google-auth.js';
import { syncTask as syncToGoogleTasks } from './google-tasks.js';
import { syncTaskToCalendar } from './google-calendar.js';

let aiSession = null;
let summarizerSession = null;
let writerSession = null;

async function initializeAI() {
  console.log('[AI Init] Starting AI initialization...');
  
  try {
    // Initialize Prompt API using Chrome's global LanguageModel constructor
    try {
      console.log('[AI Init] Creating LanguageModel session with language [en]...');
      aiSession = await LanguageModel.create(['en']);
      console.log('[AI Init] ✓ Prompt API (LanguageModel) initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Prompt API (LanguageModel):', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Initialize Summarizer API using Chrome's global Summarizer constructor
    try {
      console.log('[AI Init] Creating Summarizer session...');
      summarizerSession = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'short'
      });
      console.log('[AI Init] ✓ Summarizer API initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Summarizer API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Initialize Writer API using Chrome's global Writer constructor
    try {
      console.log('[AI Init] Creating Writer session...');
      writerSession = await Writer.create({
        tone: 'formal',
        format: 'plain-text',
        length: 'medium'
      });
      console.log('[AI Init] ✓ Writer API initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Writer API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    const hasAnyAI = !!(aiSession || summarizerSession || writerSession);
    console.log('[AI Init] ========================================');
    console.log('[AI Init] Initialization complete:');
    console.log('[AI Init]   - LanguageModel (Prompt):', aiSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Summarizer:', summarizerSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Writer:', writerSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init] ========================================');
    return hasAnyAI;
  } catch (error) {
    console.error('[AI Init] ✗ Complete failure during AI initialization:', error);
    return false;
  }
}

async function extractTaskFromText(text, context) {
  console.log('[Task Extract] Starting extraction for text:', text.substring(0, 100));
  console.log('[Task Extract] Context:', context);
  
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };
    console.log('[Task Extract] Settings loaded:', settings);
    
    if (!settings.aiEnabled) {
      console.log('[Task Extract] AI disabled in settings, using fallback');
      return createFallbackTask(text, context);
    }
    
    if (!aiSession) {
      console.log('[Task Extract] No AI session, attempting to initialize...');
      await initializeAI();
    }

    if (!aiSession) {
      console.log('[Task Extract] Still no AI session after init, using fallback');
      return createFallbackTask(text, context);
    }

    console.log('[Task Extract] Using AI to extract task...');
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

    console.log('[Task Extract] Sending prompt to AI...');
    const response = await aiSession.prompt(prompt);
    console.log('[Task Extract] AI response received:', response);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        console.log('[Task Extract] ✓ Successfully parsed AI response:', extracted);
        return {
          ...extracted,
          source: 'ai',
          originalText: text,
          context: context
        };
      } else {
        console.warn('[Task Extract] No JSON found in AI response');
      }
    } catch (e) {
      console.error('[Task Extract] Failed to parse AI response:', e);
    }

    console.log('[Task Extract] Falling back to basic extraction');
    return createFallbackTask(text, context);
  } catch (error) {
    console.error('[Task Extract] ✗ Task extraction failed:', error);
    return createFallbackTask(text, context);
  }
}

async function summarizeText(text) {
  try {
    if (summarizerSession) {
      console.log('[Summarizer] Using AI to summarize text');
      return await summarizerSession.summarize(text);
    }
    
    console.log('[Summarizer] No AI available, using truncation');
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  } catch (error) {
    console.error('[Summarizer] Summarization failed:', error);
    return text.substring(0, 100);
  }
}

function createFallbackTask(text, context) {
  console.log('[Fallback] Creating fallback task');
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
  console.log('[Save Task] Saving task:', taskData);
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const task = {
    id: taskId,
    ...taskData,
    createdAt: new Date().toISOString(),
    completed: false,
    syncedToGoogle: false,
    status: 'todo',
    order: Date.now()
  };

  const result = await chrome.storage.local.get(['tasks', 'settings']);
  const tasks = result.tasks || [];
  const settings = result.settings || { googleSyncEnabled: true };
  
  tasks.push(task);
  await chrome.storage.local.set({ tasks });
  console.log('[Save Task] ✓ Task saved locally. Total tasks:', tasks.length);

  if (settings.googleSyncEnabled) {
    try {
      const signedIn = await isSignedIn();
      if (signedIn) {
        console.log('[Save Task] Syncing to Google services...');
        
        const results = await Promise.allSettled([
          syncToGoogleTasks(task),
          syncTaskToCalendar(task)
        ]);
        
        const tasksSuccess = results[0].status === 'fulfilled';
        const calendarSuccess = results[1].status === 'fulfilled';
        
        if (!tasksSuccess) {
          console.error('[Save Task] ✗ Google Tasks sync failed:', results[0].reason);
        }
        if (!calendarSuccess) {
          console.error('[Save Task] ✗ Google Calendar sync failed:', results[1].reason);
        }
        
        if (tasksSuccess && calendarSuccess) {
          task.syncedToGoogle = true;
          const updatedTasks = tasks.map(t => t.id === task.id ? task : t);
          await chrome.storage.local.set({ tasks: updatedTasks });
          console.log('[Save Task] ✓ Task synced to Google Tasks and Calendar');
        } else if (tasksSuccess || calendarSuccess) {
          console.log('[Save Task] ⚠ Partial sync success (Tasks:', tasksSuccess, 'Calendar:', calendarSuccess, ')');
        } else {
          console.log('[Save Task] ✗ Google sync failed completely');
        }
      } else {
        console.log('[Save Task] User not signed in to Google, skipping sync');
      }
    } catch (error) {
      console.error('[Save Task] ✗ Google sync failed:', error);
    }
  }

  return task;
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

    console.log('[Calendar] TODO: Google Calendar API integration - Event prepared:', event);
    
  } catch (error) {
    console.error('[Calendar] Failed to create calendar event:', error);
  }
}

async function generateDailySummary() {
  console.log('[Summary] Generating daily summary...');
  
  try {
    const result = await chrome.storage.local.get(['tasks']);
    const tasks = result.tasks || [];
    
    const today = new Date().toDateString();
    const todayTasks = tasks.filter(task => 
      new Date(task.createdAt).toDateString() === today
    );

    console.log('[Summary] Today tasks count:', todayTasks.length);

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
        console.log('[Summary] Using Writer API to enhance summary...');
        const enhancedPrompt = `Create a professional daily work summary based on this data:\n\n${summaryText}`;
        const enhanced = await writerSession.write(enhancedPrompt);
        console.log('[Summary] ✓ Writer API enhanced the summary');
        return enhanced || summaryText;
      } catch (e) {
        console.error('[Summary] Writer API failed, using fallback:', e);
        return summaryText;
      }
    }

    console.log('[Summary] No Writer API available, returning basic summary');
    return summaryText;
  } catch (error) {
    console.error('[Summary] ✗ Failed to generate summary:', error);
    return 'Failed to generate summary.';
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] ========================================');
  console.log('[Background] Received message:', message.action);
  console.log('[Background] Message data:', message.data);
  console.log('[Background] Sender:', sender);
  
  if (message.action === 'captureTask') {
    console.log('[Background] >>> Starting captureTask handler');
    (async () => {
      try {
        console.log('[Background] Processing task capture...');
        console.log('[Background] Selected text:', message.data.selectedText);
        console.log('[Background] Context:', message.data);
        
        const extracted = await extractTaskFromText(
          message.data.selectedText,
          message.data
        );
        
        console.log('[Background] Task extracted:', extracted);
        const task = await saveTask(extracted);
        
        console.log('[Background] ✓ Task saved successfully, sending response');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] ✗ Capture failed with error:', error);
        console.error('[Background] Error stack:', error.stack);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'generateSummary') {
    console.log('[Background] >>> Starting generateSummary handler');
    (async () => {
      try {
        const summary = await generateDailySummary();
        console.log('[Background] ✓ Summary generated');
        sendResponse({ success: true, summary });
      } catch (error) {
        console.error('[Background] ✗ Summary generation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'checkAI') {
    console.log('[Background] >>> Starting checkAI handler');
    (async () => {
      const available = await initializeAI();
      const status = { 
        available,
        hasPrompt: !!aiSession,
        hasSummarizer: !!summarizerSession,
        hasWriter: !!writerSession
      };
      console.log('[Background] AI Status:', status);
      sendResponse(status);
    })();
    return true;
  }

  if (message.action === 'quickCapture') {
    console.log('[Background] >>> Starting quickCapture handler');
    (async () => {
      try {
        const extracted = await extractTaskFromText(
          message.data.text,
          { title: 'Quick Capture', url: 'manual', timestamp: new Date().toISOString() }
        );
        
        const task = await saveTask(extracted);
        console.log('[Background] ✓ Quick capture successful');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] ✗ Quick capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'googleSignIn') {
    console.log('[Background] >>> Starting Google Sign In');
    (async () => {
      try {
        const token = await getAuthToken(true);
        const email = await getUserEmail();
        console.log('[Background] ✓ Google sign in successful');
        sendResponse({ success: true, email });
      } catch (error) {
        console.error('[Background] ✗ Google sign in failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'googleSignOut') {
    console.log('[Background] >>> Starting Google Sign Out');
    (async () => {
      try {
        await revokeToken();
        console.log('[Background] ✓ Google sign out successful');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Background] ✗ Google sign out failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'checkGoogleAuth') {
    console.log('[Background] >>> Checking Google auth status');
    (async () => {
      try {
        const signedIn = await isSignedIn();
        let email = null;
        if (signedIn) {
          email = await getUserEmail();
        }
        console.log('[Background] Google auth status:', signedIn ? 'Signed in' : 'Not signed in');
        sendResponse({ signedIn, email });
      } catch (error) {
        console.error('[Background] ✗ Failed to check Google auth:', error);
        sendResponse({ signedIn: false, email: null });
      }
    })();
    return true;
  }
  
  console.log('[Background] ⚠ Unknown action received:', message.action);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Install] ========================================');
  console.log('[Install] GetShitDone event:', details.reason);
  
  await initializeAI();
  
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        googleSyncEnabled: true,
        defaultDuration: 30,
        aiEnabled: true
      }
    });
    console.log('[Install] ✓ Initial storage setup complete');
  } else if (details.reason === 'update') {
    const result = await chrome.storage.local.get(['settings']);
    if (!result.settings) {
      await chrome.storage.local.set({
        settings: {
          googleSyncEnabled: true,
          defaultDuration: 30,
          aiEnabled: true
        }
      });
    } else if (result.settings.googleSyncEnabled === undefined) {
      result.settings.googleSyncEnabled = true;
      await chrome.storage.local.set({ settings: result.settings });
    }
    console.log('[Install] ✓ Extension updated, preserving existing data');
  }
});

// Initialize on service worker startup
console.log('[Background] Service worker started, initializing AI...');
initializeAI();
