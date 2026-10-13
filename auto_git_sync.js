const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const WORKSPACE_DIR = __dirname;
let isPushing = false;
let debounceTimer = null;

function checkAndPush(reason = 'file change') {
  if (isPushing) return;
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    isPushing = true;
    exec('git status --porcelain', { cwd: WORKSPACE_DIR }, (statusErr, stdout) => {
      if (statusErr || !stdout.trim()) {
        isPushing = false;
        return;
      }

      console.log(`[Auto-Git-Sync] Changes detected (${reason}). Committing and pushing to GitHub...`);
      const commitMsg = `auto-sync: ${reason} (${new Date().toLocaleTimeString()})`;
      const cmd = `git add -A && git commit -m "${commitMsg}" && git push origin main`;

      exec(cmd, { cwd: WORKSPACE_DIR }, (err, out, stderr) => {
        isPushing = false;
        if (err) {
          console.error('[Auto-Git-Sync] Push error:', err.message);
        } else {
          console.log('[Auto-Git-Sync] ✅ Successfully pushed to GitHub! Render will auto-deploy.');
        }
      });
    });
  }, 6000); // Debounce 6 seconds
}

// Watch important directories and files
const watchTargets = ['public', 'data', 'server.js', 'tgstorage.js', 'GEMINI.md'];

watchTargets.forEach(target => {
  const fullPath = path.join(WORKSPACE_DIR, target);
  if (fs.existsSync(fullPath)) {
    try {
      fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Ignore temporary / git files
        if (filename.includes('.git') || filename.includes('node_modules') || filename.includes('.log')) return;
        checkAndPush(`${target}/${filename}`);
      });
    } catch (e) {
      console.error(`[Auto-Git-Sync] Could not watch ${target}:`, e.message);
    }
  }
});

console.log('[Auto-Git-Sync] 🚀 Auto-Git-Sync active: Watching project changes to automatically push to GitHub & Render.');

module.exports = { checkAndPush };
