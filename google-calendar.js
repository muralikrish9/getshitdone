import { getAuthToken } from './google-auth.js';

console.log('[Google Calendar] Module loaded');

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export async function getCalendars() {
  try {
    const token = await getAuthToken(false);
    const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[Google Calendar] ✓ Found', data.items?.length || 0, 'calendars');
    return data.items || [];
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to fetch calendars:', error);
    return [];
  }
}

export async function createEvent(calendarId, eventData) {
  try {
    const token = await getAuthToken(false);
    
    console.log('[Google Calendar] Creating event:', eventData.summary);
    
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/${calendarId}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[Google Calendar] ✓ Event created:', data.id);
    return data;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to create event:', error);
    throw error;
  }
}

export async function syncTaskToCalendar(task) {
  try {
    console.log('[Google Calendar] Syncing task to calendar:', task.task);
    
    const startTime = new Date();
    const duration = task.estimatedDuration || 30;
    const endTime = new Date(startTime.getTime() + duration * 60000);
    
    const event = {
      summary: `📝 ${task.task}`,
      description: `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}\n\nPriority: ${task.priority}\nProject: ${task.project || 'General'}\n\nTags: ${task.tags?.join(', ') || 'None'}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      colorId: task.priority === 'high' ? '11' : task.priority === 'medium' ? '5' : '2',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 }
        ]
      }
    };
    
    if (task.deadline) {
      event.description += `\n\nDeadline: ${task.deadline}`;
    }
    
    const calendarEvent = await createEvent('primary', event);
    
    console.log('[Google Calendar] ✓ Task synced to calendar');
    return calendarEvent;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to sync task to calendar:', error);
    throw error;
  }
}

export async function deleteEvent(eventId) {
  try {
    const token = await getAuthToken(false);
    
    console.log('[Google Calendar] Deleting event:', eventId);
    
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
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
    
    console.log('[Google Calendar] ✓ Event deleted successfully');
    return true;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to delete event:', error);
    throw error;
  }
}
