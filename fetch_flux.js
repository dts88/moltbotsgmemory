const { readFileSync } = require('fs');
const { execSync } = require('child_process');

// Load env
const env = {};
const envContent = readFileSync('.twitter-env', 'utf8');
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) env[key] = value;
  }
});

// Use the package entry point (assumed to be dist/index.js)
// We'll try to call it via node directly, ensuring env is passed
try {
  const cmd = `node ./node_modules/@steipete/bird/dist/index.js user-tweets @FluxOfficials -n 5 --json --plain`;
  const result = execSync(cmd, { env: { ...process.env, ...env } });
  console.log(result.toString());
} catch (e) {
  console.error(e.message);
}
