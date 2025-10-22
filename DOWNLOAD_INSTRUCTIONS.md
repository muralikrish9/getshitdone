# How to Download Your GetShitDone Chrome Extension

## Option 1: Download Individual Files from Replit

1. **In the Replit file explorer (left sidebar):**
   - Right-click on any file → **Download**
   - Repeat for all extension files

2. **Required files for the extension:**
   - `manifest.json`
   - `background.js`
   - `content.js`
   - `popup.html`
   - `popup.js`
   - `popup.css`
   - `icons/` folder (with all PNG files inside)
   - `README.md` (optional documentation)

3. **Create a folder on your computer** called `GetShitDone` and place all downloaded files there

## Option 2: Download Archive File

1. Look for **`GetShitDone-Extension.tar.gz`** in your file explorer
2. Right-click → Download
3. Extract the archive on your computer

## Option 3: Use Git/GitHub (Recommended)

This is the best method for hackathon submission since you need a public GitHub repo anyway!

### Step 1: Initialize Git (in Replit Shell)
```bash
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
git init
git add manifest.json background.js content.js popup.html popup.js popup.css icons/ README.md .gitignore
git commit -m "Initial commit: GetShitDone Chrome Extension for AI Challenge 2025"
```

### Step 2: Create GitHub Repository
1. Go to https://github.com/new
2. Create a new **public** repository named `getshitdone-chrome-extension`
3. **DO NOT** initialize with README, .gitignore, or license
4. Copy the repository URL

### Step 3: Push to GitHub
```bash
git remote add origin https://github.com/YOUR-USERNAME/getshitdone-chrome-extension.git
git branch -M main
git push -u origin main
```

### Step 4: Download from GitHub
1. Go to your repository on GitHub
2. Click **Code** → **Download ZIP**
3. Extract on your computer

## Option 4: Download via Shell (Advanced)

If you have access to your local terminal, you can use `scp`:

```bash
scp -r replit_username@replit_server:/path/to/workspace ./GetShitDone
```

---

## Next Steps: Load Extension in Chrome

Once downloaded:

1. Open Chrome Canary or Chrome Dev
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select your `GetShitDone` folder
6. The extension should appear in your toolbar!

## For Hackathon Submission

You'll need:
- ✅ Public GitHub repository (Option 3 recommended)
- ✅ Demo video (< 3 minutes)
- ✅ Text description of features
- ✅ Accessible working application

Good luck with the Google Chrome Built-in AI Challenge 2025! 🚀
