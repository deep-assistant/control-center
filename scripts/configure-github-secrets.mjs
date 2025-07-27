#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Dynamic import of dotenv
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());
const { config } = await use('dotenv');

// Load environment variables
if (!existsSync('.env')) {
  console.error('❌ .env file not found. Please copy .env.example to .env and fill in the values.');
  process.exit(1);
}

config();

// List of required secrets
const requiredSecrets = [
  'API_GATEWAY_SERVER_USER',
  'API_GATEWAY_SERVER_PASSWORD',
  'API_GATEWAY_SERVER_HOST',
  'API_GATEWAY_SERVER_PORT',
  'API_GATEWAY_SERVER_ROOT_PATH',
  'API_GATEWAY_SERVER_DOCKER_COMPOSE_PATH',
  'TELEGRAM_BOT_SERVER_USER',
  'TELEGRAM_BOT_SERVER_PASSWORD',
  'TELEGRAM_BOT_SERVER_HOST',
  'TELEGRAM_BOT_SERVER_PORT',
  'TELEGRAM_BOT_SERVER_ROOT_PATH',
  'TELEGRAM_BOT_SERVER_DOCKER_COMPOSE_PATH'
];

// Check if all required secrets are set
const missingSecrets = requiredSecrets.filter(secret => !process.env[secret]);
if (missingSecrets.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingSecrets.forEach(secret => console.error(`   - ${secret}`));
  console.error('\nPlease set these in your .env file.');
  process.exit(1);
}

// Check GitHub CLI
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.error('❌ GitHub CLI (gh) is not installed.');
  console.log('Please install it first: https://cli.github.com/');
  process.exit(1);
}

// Check GitHub authentication
try {
  execSync('gh auth status', { stdio: 'ignore' });
} catch {
  console.error('❌ You are not authenticated with GitHub CLI.');
  console.log('Please run: gh auth login');
  process.exit(1);
}

// Get repository info
let repo;
try {
  const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  if (match) {
    repo = `${match[1]}/${match[2]}`;
  } else {
    throw new Error('Could not parse repository info');
  }
} catch {
  console.error('❌ Could not determine repository. Make sure you are in a git repository with a GitHub remote.');
  process.exit(1);
}

console.log('🔧 Configuring GitHub Secrets');
console.log(`📦 Repository: ${repo}\n`);

// Set all secrets
for (const secret of requiredSecrets) {
  try {
    execSync(`echo "${process.env[secret]}" | gh secret set ${secret} --repo ${repo}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });
    console.log(`✅ Set secret: ${secret}`);
  } catch (error) {
    console.error(`❌ Failed to set secret ${secret}: ${error.message}`);
    process.exit(1);
  }
}

console.log('\n✅ All secrets configured successfully!');

// Verify secrets were set
console.log('\n🔍 Verifying secrets...');
try {
  const secretsList = execSync(`gh secret list --repo ${repo}`, { encoding: 'utf-8' });
  const lines = secretsList.trim().split('\n');
  
  const configuredSecrets = lines
    .map(line => line.split('\t')[0])
    .filter(secret => requiredSecrets.includes(secret));
  
  if (configuredSecrets.length === requiredSecrets.length) {
    console.log('✅ All required secrets are configured:');
    configuredSecrets.forEach(secret => console.log(`   ✓ ${secret}`));
  } else {
    const missing = requiredSecrets.filter(s => !configuredSecrets.includes(s));
    console.log('⚠️  Some secrets might be missing:');
    missing.forEach(secret => console.log(`   ✗ ${secret}`));
  }
} catch (error) {
  console.warn('⚠️  Could not verify secrets:', error.message);
}

console.log('\n📝 You can now trigger the workflow: Actions → Restart API Gateway → Run workflow');