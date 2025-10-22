// Google Calendar API Client
// Handles Calendar API operations for creating, updating, and managing events

class GoogleCalendar {
    constructor() {
        this.baseUrl = 'https://www.googleapis.com/calendar/v3';
    }

    /**
     * Get access token for API calls
     * @returns {Promise<string>}
     */
    async getAccessToken() {
        const token = await googleAuth.getAccessToken();
        if (!token) {
            throw new Error('No access token available. Please authenticate first.');
        }
        return token;
    }

    /**
     * Make authenticated API request
     * @param {string} endpoint 
     * @param {Object} options 
     * @returns {Promise<Object>}
     */
    async makeRequest(endpoint, options = {}) {
        const token = await this.getAccessToken();

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Calendar API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        return response.json();
    }

    /**
     * List user's calendars
     * @returns {Promise<Array>}
     */
    async listCalendars() {
        try {
            console.log('[GoogleCalendar] Fetching calendars...');
            const response = await this.makeRequest('/users/me/calendarList');

            const calendars = response.items.map(cal => ({
                id: cal.id,
                summary: cal.summary,
                primary: cal.primary,
                accessRole: cal.accessRole,
                backgroundColor: cal.backgroundColor,
                foregroundColor: cal.foregroundColor
            }));

            console.log('[GoogleCalendar] ✓ Calendars fetched:', calendars.length);
            return calendars;
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to fetch calendars:', error);
            throw error;
        }
    }

    /**
     * Create Calendar event from extension task
     * @param {Object} task - Task object with task, estimatedDuration, priority, etc.
     * @param {string} calendarId - Calendar ID to create event in
     * @returns {Promise<Object>}
     */
    async createEvent(task, calendarId) {
        try {
            console.log('[GoogleCalendar] Creating event for task:', task.task);

            // Calculate start and end times based on priority and duration
            const startTime = new Date();
            const duration = task.estimatedDuration || 30; // minutes
            const endTime = new Date(startTime.getTime() + duration * 60000);

            // Format times for Google Calendar API
            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();

            const event = {
                summary: task.task,
                description: `Captured from: ${task.context?.url || 'Unknown'}\n\nOriginal text: ${task.originalText || task.task}\n\nPriority: ${task.priority || 'medium'}\nEstimated duration: ${task.estimatedDuration || 30} minutes`,
                start: {
                    dateTime: startTimeISO,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: endTimeISO,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 10 },
                        { method: 'email', minutes: 30 }
                    ]
                }
            };

            // Add priority-based color
            const colorId = this.getPriorityColorId(task.priority);
            if (colorId) {
                event.colorId = colorId;
            }

            const response = await this.makeRequest(`/calendars/${calendarId}/events`, {
                method: 'POST',
                body: JSON.stringify(event)
            });

            console.log('[GoogleCalendar] ✓ Event created:', response.id);
            return {
                id: response.id,
                summary: response.summary,
                start: response.start,
                end: response.end,
                htmlLink: response.htmlLink,
                selfLink: response.selfLink
            };
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to create event:', error);
            throw error;
        }
    }

    /**
     * Update event status
     * @param {string} eventId - Google Calendar event ID
     * @param {string} status - Event status (pending, in-progress, completed)
     * @param {string} calendarId - Calendar ID
     * @returns {Promise<Object>}
     */
    async updateEventStatus(eventId, status, calendarId) {
        try {
            console.log('[GoogleCalendar] Updating event status:', eventId, status);

            // Get current event
            const currentEvent = await this.makeRequest(`/calendars/${calendarId}/events/${eventId}`);

            let updates = {};

            switch (status) {
                case 'in-progress':
                    // Update title to show in progress
                    updates.summary = `🔄 ${currentEvent.summary}`;
                    break;
                case 'completed':
                    // Mark as completed
                    updates.summary = `✅ ${currentEvent.summary}`;
                    break;
                case 'pending':
                default:
                    // Reset to original
                    updates.summary = currentEvent.summary.replace(/^[🔄✅] /, '');
                    break;
            }

            const response = await this.makeRequest(`/calendars/${calendarId}/events/${eventId}`, {
                method: 'PUT',
                body: JSON.stringify({ ...currentEvent, ...updates })
            });

            console.log('[GoogleCalendar] ✓ Event updated');
            return response;
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to update event:', error);
            throw error;
        }
    }

    /**
     * Delete Calendar event
     * @param {string} eventId - Google Calendar event ID
     * @param {string} calendarId - Calendar ID
     * @returns {Promise<boolean>}
     */
    async deleteEvent(eventId, calendarId) {
        try {
            console.log('[GoogleCalendar] Deleting event:', eventId);

            await this.makeRequest(`/calendars/${calendarId}/events/${eventId}`, {
                method: 'DELETE'
            });

            console.log('[GoogleCalendar] ✓ Event deleted');
            return true;
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to delete event:', error);
            throw error;
        }
    }

    /**
     * Get event by ID
     * @param {string} eventId - Google Calendar event ID
     * @param {string} calendarId - Calendar ID
     * @returns {Promise<Object>}
     */
    async getEvent(eventId, calendarId) {
        try {
            const response = await this.makeRequest(`/calendars/${calendarId}/events/${eventId}`);
            return response;
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to get event:', error);
            throw error;
        }
    }

    /**
     * List events in a calendar
     * @param {string} calendarId - Calendar ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>}
     */
    async listEvents(calendarId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.timeMin) {
                params.append('timeMin', options.timeMin);
            }
            if (options.timeMax) {
                params.append('timeMax', options.timeMax);
            }
            if (options.maxResults) {
                params.append('maxResults', options.maxResults);
            }
            if (options.singleEvents !== undefined) {
                params.append('singleEvents', options.singleEvents);
            }
            if (options.orderBy) {
                params.append('orderBy', options.orderBy);
            }

            const queryString = params.toString();
            const endpoint = `/calendars/${calendarId}/events${queryString ? `?${queryString}` : ''}`;

            const response = await this.makeRequest(endpoint);
            return response.items || [];
        } catch (error) {
            console.error('[GoogleCalendar] ✗ Failed to list events:', error);
            throw error;
        }
    }

    /**
     * Get priority-based color ID for calendar events
     * @param {string} priority - Task priority (high, medium, low)
     * @returns {string|null}
     */
    getPriorityColorId(priority) {
        switch (priority) {
            case 'high':
                return '11'; // Red
            case 'medium':
                return '5';  // Yellow
            case 'low':
                return '10'; // Green
            default:
                return null;
        }
    }
}

// Create global instance
const googleCalendar = new GoogleCalendar();
