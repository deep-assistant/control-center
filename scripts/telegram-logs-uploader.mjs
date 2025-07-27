#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join, basename } from 'path';

// Dynamic import of dotenv, node-telegram-bot-api, and lodash
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());
const { config } = await use('dotenv');
const TelegramBot = await use('node-telegram-bot-api');
const _ = await use('lodash@latest');

// Load environment variables from .env file if it exists (for local development)
// In GitHub Actions, environment variables are already set from repository secrets
if (existsSync('.env')) {
  console.log('📋 Loading .env file for local development');
  config();
} else {
  console.log('🔧 Running in CI/GitHub Actions - using repository secrets');
}

// Check required environment variables (except chat/topic IDs which we'll auto-detect)
const requiredVars = [
  'SYSTEM_TELEGRAM_BOT_TOKEN',
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
const SERVICE_NAME = process.env.LOGS_SERVICE_NAME;
const LOG_FILE_PATH = process.env.LOGS_FILE_PATH;

// These will be auto-detected or used from env
let CHAT_ID = process.env.DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_CHAT_ID;
let TOPIC_ID = process.env.DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_LOGS_TOPIC_ID;

// Initialize Telegram bot
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

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

// Function to upload logs after we have valid chat/topic IDs
async function uploadLogs(chatId, topicId) {
  let tempLogPath = null;
  
  try {
    console.log(`📦 Uploading ${SERVICE_NAME} logs...`);
    
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
    
    const sendOptions = {
      caption: caption,
      parse_mode: 'Markdown'
    };
    
    // Add topic ID if provided
    if (topicId) {
      sendOptions.message_thread_id = parseInt(topicId);
    }
    
    const result = await bot.sendDocument(chatId, tempLogPath, sendOptions);
    
    console.log('✅ Successfully uploaded logs to Telegram!');
    console.log(`📱 Message ID: ${result.message_id}`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error uploading logs: ${error.message}`);
    throw error;
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

// Function to check if we have valid chat/topic IDs
function hasValidIds() {
  return !_.isNil(CHAT_ID) && 
         !_.isNil(TOPIC_ID) && 
         _.isNumber(_.toNumber(CHAT_ID)) && 
         _.isNumber(_.toNumber(TOPIC_ID));
}

// Main execution
async function main() {
  try {
    // If we already have valid IDs, upload directly
    if (hasValidIds()) {
      console.log('📋 Using configured Chat ID and Topic ID from environment');
      await uploadLogs(CHAT_ID, TOPIC_ID);
      process.exit(0);
    }
    
    // Otherwise, wait for /logs command to auto-detect IDs
    console.log('🤖 Starting Telegram bot to auto-detect Chat ID and Topic ID...');
    console.log('📝 Please send /logs command in the desired group topic to configure the bot');
    console.log('⏳ Waiting for /logs command...');
    
    // Enable polling to listen for messages
    bot.startPolling();
    
    // Listen for /logs command
    bot.onText(/\/logs/, async (msg) => {
      const detectedChatId = msg.chat.id.toString();
      const detectedTopicId = msg.message_thread_id ? msg.message_thread_id.toString() : null;
      
      console.log('\\n🎯 Auto-detected IDs:');
      console.log(`📬 CHAT_ID: ${detectedChatId}`);
      console.log(`🧵 TOPIC_ID: ${detectedTopicId || 'Not in a topic (regular group chat)'}`);
      console.log('\\n📝 Add these to your .env file:');
      console.log(`DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_CHAT_ID=${detectedChatId}`);
      console.log(`DEEP_ASSISTANT_HEADQUATERS_TELEGRAM_LOGS_TOPIC_ID=${detectedTopicId || ''}`);
      
      try {
        // Send confirmation message
        await bot.sendMessage(detectedChatId, 
          `✅ **Bot Configuration Detected**\\n\\n` +
          `📬 Chat ID: \`${detectedChatId}\`\\n` +
          `🧵 Topic ID: \`${detectedTopicId || 'None (regular chat)'}\`\\n\\n` +
          `🔄 Now uploading ${SERVICE_NAME} logs...`,
          {
            parse_mode: 'Markdown',
            message_thread_id: detectedTopicId
          }
        );
        
        // Upload logs to the detected location
        await uploadLogs(detectedChatId, detectedTopicId);
        
      } catch (error) {
        console.error(`❌ Error during upload: ${error.message}`);
        
        // Send error message to user
        try {
          await bot.sendMessage(detectedChatId, 
            `❌ **Error uploading logs**\\n\\n` +
            `🚫 ${error.message}\\n\\n` +
            `Please check the server configuration and try again.`,
            {
              parse_mode: 'Markdown',
              message_thread_id: detectedTopicId
            }
          );
        } catch (sendError) {
          console.error(`Failed to send error message: ${sendError.message}`);
        }
      }
      
      // Stop the bot after processing
      bot.stopPolling();
      process.exit(0);
    });
    
    // Handle other messages
    bot.on('message', (msg) => {
      if (!msg.text || !msg.text.startsWith('/logs')) {
        console.log(`📨 Received message from ${msg.chat.id} (${msg.chat.title || msg.chat.first_name}): ${msg.text || '[non-text message]'}`);
        console.log('   ⏳ Still waiting for /logs command...');
      }
    });
    
    // Handle polling errors
    bot.on('polling_error', (error) => {
      console.error(`❌ Polling error: ${error.message}`);
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();