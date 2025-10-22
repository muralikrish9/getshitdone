// Google Tasks API Client
// Handles Tasks API operations for creating, updating, and managing tasks

class GoogleTasks {
    constructor() {
        this.baseUrl = 'https://www.googleapis.com/tasks/v1';
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
            throw new Error(`Tasks API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        return response.json();
    }

    /**
     * List user's task lists
     * @returns {Promise<Array>}
     */
    async listTaskLists() {
        try {
            console.log('[GoogleTasks] Fetching task lists...');
            const response = await this.makeRequest('/users/@me/lists');

            const taskLists = response.items.map(list => ({
                id: list.id,
                title: list.title,
                updated: list.updated,
                selfLink: list.selfLink
            }));

            console.log('[GoogleTasks] ✓ Task lists fetched:', taskLists.length);
            return taskLists;
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to fetch task lists:', error);
            throw error;
        }
    }

    /**
     * Create Google Task from extension task
     * @param {Object} task - Task object with task, estimatedDuration, priority, etc.
     * @param {string} taskListId - Task list ID to create task in
     * @returns {Promise<Object>}
     */
    async createTask(task, taskListId) {
        try {
            console.log('[GoogleTasks] Creating task:', task.task);
            console.log('[GoogleTasks] Task list ID:', taskListId);

            // Validate required fields
            if (!task.task || task.task.trim() === '') {
                throw new Error('Task title cannot be empty');
            }

            if (!taskListId) {
                throw new Error('Task list ID is required');
            }

            // Clean and prepare task data
            const googleTask = {
                title: task.task.trim(),
                notes: this.buildTaskNotes(task),
                status: 'needsAction'
            };

            // Add due date if available
            if (task.deadline) {
                try {
                    const dueDate = new Date(task.deadline);
                    if (!isNaN(dueDate.getTime())) {
                        googleTask.due = dueDate.toISOString();
                    }
                } catch (dateError) {
                    console.warn('[GoogleTasks] Invalid deadline date:', task.deadline);
                }
            }

            // Clean payload to remove undefined/null values
            const cleanPayload = this.cleanPayload(googleTask);

            console.log('[GoogleTasks] Sending payload:', cleanPayload);
            console.log('[GoogleTasks] Endpoint:', `/lists/${taskListId}/tasks`);
            console.log('[GoogleTasks] Method: POST`);

            const response = await this.makeRequest(`/lists/${taskListId}/tasks`, {
                method: 'POST',
                body: JSON.stringify(cleanPayload)
            });

            console.log('[GoogleTasks] ✓ Task created:', response.id);
            return {
                id: response.id,
                title: response.title,
                status: response.status,
                due: response.due,
                notes: response.notes,
                selfLink: response.selfLink
            };
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to create task:', error);
            throw error;
        }
    }

    /**
     * Update task status
     * @param {string} taskId - Google Tasks task ID
     * @param {string} status - Task status (pending, in-progress, completed)
     * @param {string} taskListId - Task list ID
     * @returns {Promise<Object>}
     */
    async updateTaskStatus(taskId, status, taskListId) {
        try {
            console.log('[GoogleTasks] Updating task status:', taskId, status);

            // Get current task
            const currentTask = await this.makeRequest(`/lists/${taskListId}/tasks/${taskId}`);

            let updates = {};

            switch (status) {
                case 'in-progress':
                    updates.status = 'needsAction';
                    // Add in-progress indicator to title
                    if (!currentTask.title.startsWith('🔄')) {
                        updates.title = `🔄 ${currentTask.title}`;
                    }
                    break;
                case 'completed':
                    updates.status = 'completed';
                    // Add completed indicator to title
                    if (!currentTask.title.startsWith('✅')) {
                        updates.title = `✅ ${currentTask.title}`;
                    }
                    break;
                case 'pending':
                default:
                    updates.status = 'needsAction';
                    // Remove status indicators
                    updates.title = currentTask.title.replace(/^[🔄✅] /, '');
                    break;
            }

            const response = await this.makeRequest(`/lists/${taskListId}/tasks/${taskId}`, {
                method: 'PUT',
                body: JSON.stringify({ ...currentTask, ...updates })
            });

            console.log('[GoogleTasks] ✓ Task updated');
            return response;
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to update task:', error);
            throw error;
        }
    }

    /**
     * Patch task with minimal updates
     * @param {string} taskId - Google Tasks task ID
     * @param {Object} updates - Fields to update
     * @param {string} taskListId - Task list ID
     * @returns {Promise<Object>}
     */
    async patchTask(taskId, updates, taskListId) {
        try {
            console.log('[GoogleTasks] Patching task:', taskId, updates);

            const response = await this.makeRequest(`/lists/${taskListId}/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });

            console.log('[GoogleTasks] ✓ Task patched');
            return response;
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to patch task:', error);
            throw error;
        }
    }

    /**
     * Delete Google Task
     * @param {string} taskId - Google Tasks task ID
     * @param {string} taskListId - Task list ID
     * @returns {Promise<boolean>}
     */
    async deleteTask(taskId, taskListId) {
        try {
            console.log('[GoogleTasks] Deleting task:', taskId);

            await this.makeRequest(`/lists/${taskListId}/tasks/${taskId}`, {
                method: 'DELETE'
            });

            console.log('[GoogleTasks] ✓ Task deleted');
            return true;
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to delete task:', error);
            throw error;
        }
    }

    /**
     * Get task by ID
     * @param {string} taskId - Google Tasks task ID
     * @param {string} taskListId - Task list ID
     * @returns {Promise<Object>}
     */
    async getTask(taskId, taskListId) {
        try {
            const response = await this.makeRequest(`/lists/${taskListId}/tasks/${taskId}`);
            return response;
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to get task:', error);
            throw error;
        }
    }

    /**
     * List tasks in a task list
     * @param {string} taskListId - Task list ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>}
     */
    async listTasks(taskListId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.maxResults) {
                params.append('maxResults', options.maxResults);
            }
            if (options.showCompleted !== undefined) {
                params.append('showCompleted', options.showCompleted);
            }
            if (options.showDeleted !== undefined) {
                params.append('showDeleted', options.showDeleted);
            }
            if (options.showHidden !== undefined) {
                params.append('showHidden', options.showHidden);
            }

            const queryString = params.toString();
            const endpoint = `/lists/${taskListId}/tasks${queryString ? `?${queryString}` : ''}`;

            const response = await this.makeRequest(endpoint);
            return response.items || [];
        } catch (error) {
            console.error('[GoogleTasks] ✗ Failed to list tasks:', error);
            throw error;
        }
    }

    /**
     * Build task notes from extension task data
     * @param {Object} task - Extension task object
     * @returns {string}
     */
    buildTaskNotes(task) {
        const notes = [];

        if (task.originalText && task.originalText !== task.task) {
            notes.push(`Original text: ${task.originalText}`);
        }

        if (task.context?.url) {
            notes.push(`Source: ${task.context.url}`);
        }

        if (task.priority) {
            notes.push(`Priority: ${task.priority}`);
        }

        if (task.estimatedDuration) {
            notes.push(`Estimated duration: ${task.estimatedDuration} minutes`);
        }

        if (task.project) {
            notes.push(`Project: ${task.project}`);
        }

        if (task.deadline) {
            notes.push(`Deadline: ${new Date(task.deadline).toLocaleDateString()}`);
        }

        return notes.join('\n');
    }

    /**
     * Clean payload to remove undefined/null values
     * @param {Object} payload - Object to clean
     * @returns {Object}
     */
    cleanPayload(payload) {
        const cleaned = {};
        for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined && value !== null && value !== '') {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
}

// Create global instance
const googleTasks = new GoogleTasks();
