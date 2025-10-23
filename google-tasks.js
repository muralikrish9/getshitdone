import { getAuthToken } from './google-auth.js';

console.log('[Google Tasks] Module loaded');

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

export async function getTaskLists() {
  try {
    const token = await getAuthToken(false);
    const response = await fetch(`${TASKS_API_BASE}/users/@me/lists`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[Google Tasks] ✓ Found', data.items?.length || 0, 'task lists');
    return data.items || [];
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to fetch task lists:', error);
    return [];
  }
}

export async function createTask(taskListId, taskTitle, taskNotes, dueDate = null) {
  try {
    const token = await getAuthToken(false);
    
    const taskData = {
      title: taskTitle,
      notes: taskNotes
    };
    
    if (dueDate) {
      taskData.due = new Date(dueDate).toISOString();
    }
    
    console.log('[Google Tasks] Creating task:', taskTitle);
    
    const response = await fetch(
      `${TASKS_API_BASE}/lists/${taskListId}/tasks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskData)
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[Google Tasks] ✓ Task created:', data.id);
    return data;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to create task:', error);
    throw error;
  }
}

export async function getOrCreateDefaultList() {
  try {
    const lists = await getTaskLists();
    
    const getShitDoneList = lists.find(list => list.title === 'GetShitDone Tasks');
    if (getShitDoneList) {
      console.log('[Google Tasks] Using existing GetShitDone list');
      return getShitDoneList.id;
    }
    
    const defaultList = lists.find(list => list.title === 'My Tasks' || list.title === 'Tasks');
    if (defaultList) {
      console.log('[Google Tasks] Using default task list');
      return defaultList.id;
    }
    
    if (lists.length > 0) {
      console.log('[Google Tasks] Using first available list');
      return lists[0].id;
    }
    
    throw new Error('No task lists found');
  } catch (error) {
    console.error('[Google Tasks] Failed to get default list:', error);
    throw error;
  }
}

export async function syncTask(task) {
  try {
    console.log('[Google Tasks] Syncing task:', task.task);
    
    const listId = await getOrCreateDefaultList();
    
    const notes = `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}\n\nPriority: ${task.priority}\nEstimated duration: ${task.estimatedDuration || 30} minutes\nProject: ${task.project || 'General'}`;
    
    const googleTask = await createTask(
      listId,
      task.task,
      notes,
      task.deadline
    );
    
    console.log('[Google Tasks] ✓ Task synced successfully');
    return googleTask;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to sync task:', error);
    throw error;
  }
}

export async function deleteTask(taskId) {
  try {
    const token = await getAuthToken(false);
    
    console.log('[Google Tasks] Deleting task:', taskId);
    
    const response = await fetch(
      `${TASKS_API_BASE}/lists/@default/tasks/${taskId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('[Google Tasks] ✓ Task deleted successfully');
    return true;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to delete task:', error);
    throw error;
  }
}
