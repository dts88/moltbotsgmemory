import { execSync } from 'child_process';

async function main() {
  const target = process.argv[2];
  const text = process.argv.slice(3).join(' ');
  if (!target || !text) {
    console.error('Usage: node whatsapp-send.mjs <<targettarget> <<texttext>');
    process.exit(1);
  }
  console.log(`Target: ${target}`);
  console.log(`Message: ${text}`);
}

main();
