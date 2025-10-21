let aiSession = null;
let summarizerSession = null;
let writerSession = null;

async function initializeAI() {
  try {
    if ('ai' in self && 'languageModel' in self.ai) {
      const capabilities = await self.ai.languageModel.capabilities();
      console.log('AI capabilities:', capabilities);
      
      if (capabilities.available === 'readily') {
        aiSession = await self.ai.languageModel.create({
          temperature: 0.7,
          topK: 3
        });
        console.log('Prompt API initialized');
      }
    }

    if ('ai' in self && 'summarizer' in self.ai) {
      const summarizerCapabilities = await self.ai.summarizer.capabilities();
      if (summarizerCapabilities.available === 'readily') {
        summarizerSession = await self.ai.summarizer.create({
          type: 'key-points',
          format: 'plain-text',
          length: 'short'
        });
        console.log('Summarizer API initialized');
      }
    }

    if ('ai' in self && 'writer' in self.ai) {
      const writerCapabilities = await self.ai.writer.capabilities();
      if (writerCapabilities.available === 'readily') {
        writerSession = await self.ai.writer.create({
          tone: 'formal',
          format: 'plain-text',
          length: 'medium'
        });
        console.log('Writer API initialized');
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to initialize AI:', error);
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
    completed: false
  };

  const result = await chrome.storage.local.get(['tasks', 'settings']);
  const tasks = result.tasks || [];
  const settings = result.settings || { calendarEnabled: false };
  
  tasks.push(task);
  await chrome.storage.local.set({ tasks });

  if (settings.calendarEnabled && settings.calendarToken) {
    await createCalendarEvent(task, settings);
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

    console.log('TODO: Google Calendar API integration - Event prepared:', event);
    
  } catch (error) {
    console.error('Failed to create calendar event:', error);
  }
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
  if (message.action === 'captureTask') {
    (async () => {
      try {
        const extracted = await extractTaskFromText(
          message.data.selectedText,
          message.data
        );
        
        const task = await saveTask(extracted);
        
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('Capture failed:', error);
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
      const available = await initializeAI();
      sendResponse({ 
        available,
        hasPrompt: !!aiSession,
        hasSummarizer: !!summarizerSession,
        hasWriter: !!writerSession
      });
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
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('GetShitDone event:', details.reason);
  await initializeAI();
  
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
