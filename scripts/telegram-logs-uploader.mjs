#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join, basename } from 'path';

// Dynamic import of dotenv and node-telegram-bot-api
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());
const { config } = await use('dotenv');
const TelegramBot = await use('node-telegram-bot-api');

// Load environment variables
if (!existsSync('.env')) {
  console.error('❌ .env file not found. Please copy .env.example to .env and fill in the values.');
  process.exit(1);
}

config();

// Check required environment variables
const requiredVars = [
  'SYSTEM_TELEGRAM_BOT_TOKEN',
  'DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_CHAT_ID',
  'DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_LOGS_TOPIC_ID',
  'LOGS_SERVICE_NAME',
  'LOGS_FILE_PATH'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease set these in your .env file.');
  process.exit(1);
}

const BOT_TOKEN = process.env.SYSTEM_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_CHAT_ID;
const TOPIC_ID = process.env.DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_LOGS_TOPIC_ID;
const SERVICE_NAME = process.env.LOGS_SERVICE_NAME;
const LOG_FILE_PATH = process.env.LOGS_FILE_PATH;

console.log(`📦 Uploading ${SERVICE_NAME} logs...`);

// Initialize Telegram bot
const bot = new TelegramBot(BOT_TOKEN);

// Function to download logs from server
function downloadLogsFromServer(serverConfig, logFileName) {
  const tempLogPath = join(process.cwd(), 'temp_' + basename(logFileName));
  
  try {
    console.log(`📥 Downloading logs from ${serverConfig.host}...`);
    
    const downloadCommand = `sshpass -p '${serverConfig.password}' scp -P ${serverConfig.port} -o StrictHostKeyChecking=no ${serverConfig.user}@${serverConfig.host}:${logFileName} ${tempLogPath}`;
    
    execSync(downloadCommand, { stdio: 'pipe' });
    
    if (!existsSync(tempLogPath)) {
      throw new Error('Failed to download log file');
    }
    
    console.log(`✅ Downloaded logs to: ${tempLogPath}`);
    return tempLogPath;
  } catch (error) {
    throw new Error(`Failed to download logs: ${error.message}`);
  }
}

// Main execution
async function main() {
  let tempLogPath = null;
  
  try {
    // Determine server configuration based on service
    let serverConfig;
    if (SERVICE_NAME === 'api-gateway') {
      serverConfig = {
        user: process.env.API_GATEWAY_SERVER_USER,
        password: process.env.API_GATEWAY_SERVER_PASSWORD,
        host: process.env.API_GATEWAY_SERVER_HOST,
        port: process.env.API_GATEWAY_SERVER_PORT
      };
    } else if (SERVICE_NAME === 'telegram-bot') {
      serverConfig = {
        user: process.env.TELEGRAM_BOT_SERVER_USER,
        password: process.env.TELEGRAM_BOT_SERVER_PASSWORD,
        host: process.env.TELEGRAM_BOT_SERVER_HOST,
        port: process.env.TELEGRAM_BOT_SERVER_PORT
      };
    } else {
      throw new Error(`Unknown service: ${SERVICE_NAME}. Supported services: api-gateway, telegram-bot`);
    }
    
    // Validate server config
    const requiredServerVars = ['user', 'password', 'host', 'port'];
    const missingServerVars = requiredServerVars.filter(key => !serverConfig[key]);
    if (missingServerVars.length > 0) {
      throw new Error(`Missing server configuration for ${SERVICE_NAME}: ${missingServerVars.join(', ')}`);
    }
    
    // Download logs from server
    tempLogPath = downloadLogsFromServer(serverConfig, LOG_FILE_PATH);
    
    // Create caption
    const timestamp = new Date().toISOString();
    const caption = `🔧 **${SERVICE_NAME.toUpperCase()} LOGS**\\n` +
                   `📅 Downloaded: ${timestamp}\\n` +
                   `🖥️ Server: ${serverConfig.host}\\n` +
                   `📦 File: ${basename(LOG_FILE_PATH)}`;
    
    // Upload to Telegram using modern API
    console.log(`📤 Uploading to Telegram...`);
    
    const result = await bot.sendDocument(CHAT_ID, tempLogPath, {
      caption: caption,
      parse_mode: 'Markdown',
      message_thread_id: parseInt(TOPIC_ID)
    });
    
    console.log('✅ Successfully uploaded logs to Telegram!');
    console.log(`📱 Message ID: ${result.message_id}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    // Clean up temporary file
    if (tempLogPath && existsSync(tempLogPath)) {
      try {
        unlinkSync(tempLogPath);
        console.log('🗑️ Cleaned up temporary file');
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup temporary file: ${cleanupError.message}`);
      }
    }
  }
}

main();