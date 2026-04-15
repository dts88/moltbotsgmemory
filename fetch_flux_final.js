const { spawnSync } = require('child_process');
const fs = require('fs');

const env = { ...process.env };
try {
  const envContent = fs.readFileSync('.twitter-env', 'utf8');
  envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    }
  });
} catch (e) {}

const result = spawnSync('node', [
  './node_modules/@steipete/bird/dist/index.js',
  'user-tweets',
  '@FluxOfficials',
  '-n', '5',
  '--json',
  '--plain'
], {
  env: env,
  encoding: 'utf8'
});

if (result.error) {
  console.error('Spawn Error:', result.error);
} else {
  console.log(result.stdout);
  if (result.stderr) console.error('Stderr:', result.stderr);
}
