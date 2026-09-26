const { execSync } = require('child_process');
const os = require('os');

const ports = [5000, 5173];

console.log('🧹 Checking ports 5000 and 5173 for stale MailFlow processes...');

ports.forEach((port) => {
  try {
    if (os.platform() === 'win32') {
      const output = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = output.trim().split('\n');
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          console.log(`[clean-ports] Terminating stale process on port ${port} (PID: ${pid})...`);
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } catch (_) {}
        }
      });
    } else {
      const output = execSync(`lsof -t -i:${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const pids = output.trim().split('\n');
      pids.forEach((pid) => {
        if (pid && pid !== String(process.pid)) {
          console.log(`[clean-ports] Terminating stale process on port ${port} (PID: ${pid})...`);
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          } catch (_) {}
        }
      });
    }
  } catch (err) {
    // Port is free
  }
});

console.log('✅ Ports 5000 and 5173 checked and clean.');
