# GetShitDone - Chrome AI Extension

**AI-Powered Productivity Extension for Google Chrome Built-in AI Challenge 2025**

## Overview

GetShitDone is a Chrome extension that revolutionizes knowledge work tracking by automatically converting highlighted text into structured tasks with intelligent time tracking and daily work summaries. Built entirely using Chrome's built-in AI APIs (Prompt, Summarizer, Writer), the extension operates locally for privacy and speed.

## Features

- **🎯 Smart Highlight Capture**: Highlight text anywhere and instantly create tasks
- **🤖 AI Task Extraction**: Uses Chrome's Prompt API to infer tasks, priorities, deadlines, and durations
- **📝 Automatic Summarization**: Chrome's Summarizer API condenses content into clear descriptions
- **📊 Daily Work Reports**: Writer API generates professional summaries with project groupings
- **⏱️ Time Tracking**: Automatic time tracking per project and task
- **📅 Google Calendar Sync**: Create time-blocked calendar events (hybrid AI approach)
- **💾 Local Storage**: All data stays on your device using Chrome Storage API

## Technology Stack

### Chrome Built-in AI APIs
- **Prompt API**: Task reasoning, deadline inference, priority detection
- **Summarizer API**: Content condensation and key point extraction
- **Writer API**: Professional daily summary generation

### Chrome Extension APIs
- Manifest V3 with service workers
- Content scripts for highlight detection
- Chrome Storage for local data persistence
- Google Calendar API integration

## Installation

### Prerequisites

1. **Chrome Canary or Chrome Dev** (required for AI APIs)
2. **Join the Chrome Built-in AI Early Preview Program**: https://developer.chrome.com/docs/ai/join-epp
3. Enable AI flags in `chrome://flags`:
   - Prompt API for Gemini Nano
   - Summarization API for Gemini Nano
   - Writer API for Gemini Nano

### Loading the Extension

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension directory
6. The GetShitDone icon should appear in your toolbar

## Usage

### Capture Tasks from Highlights

1. Browse any webpage (email, article, document)
2. Highlight text containing a task or action item
3. Click the "✨ Capture Task" button that appears
4. AI automatically extracts task details and saves them
5. View captured tasks by clicking the extension icon

### Quick Capture

1. Click the extension icon
2. Navigate to the "Today" tab
3. Type or paste text in the Quick Capture box
4. Click "Capture Task"

### Generate Daily Summaries

1. Open the extension popup
2. Navigate to the "Summary" tab
3. Click "Generate Summary"
4. View your professional work report
5. Copy to clipboard or export as Markdown

### Settings

- **Google Calendar**: Connect to auto-create calendar events
- **Default Duration**: Set default task duration (15-480 minutes)
- **AI Settings**: Enable/disable AI features
- **Data Management**: Clear all stored data

## Project Structure

```
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker with AI processing logic
├── content.js          # Highlight capture and UI injection
├── popup.html          # Extension popup interface
├── popup.js            # Popup functionality and data display
├── popup.css           # Popup styling
├── icons/              # Extension icons (16px, 48px, 128px)
└── README.md           # This file
```

## Hackathon Prize Categories

This extension is designed for:

- **Most Helpful - Chrome Extension** ($14,000): Automates the entire knowledge work tracking workflow
- **Best Hybrid AI Application** ($9,000): Combines local Chrome AI with Google Calendar cloud API
- **Best Multimodal AI Application** ($9,000): Architecture ready for image/audio input expansion

## Development

### Extension Development

1. Make changes to extension files
2. Go to `chrome://extensions`
3. Click the refresh icon on the GetShitDone extension
4. Test your changes

## Privacy & Security

- All AI processing happens locally using Chrome's built-in models
- No data is sent to external servers (except Google Calendar with user permission)
- Tasks and summaries are stored locally using Chrome Storage API
- No API keys required for AI features

## Future Enhancements

- Snapshot capture with OCR for visual content
- Multimodal AI using Prompt API's image/audio input
- Task manager integrations (Notion, Linear, Asana)
- Weekly aggregation with focus distribution analytics
- Chrome Proofreader API for summary refinement
- Intelligent work recommendations

## Resources

- [Chrome Built-in AI Documentation](https://developer.chrome.com/docs/ai/built-in-apis)
- [Google Chrome AI Challenge 2025](https://googlechromeai2025.devpost.com/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

## License

MIT License - Built for educational purposes and the Google Chrome Built-in AI Challenge 2025

---

**Built with ✨ and Chrome's Built-in AI**
