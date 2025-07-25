# GitHub Actions Workflows

## Restart API Gateway Workflow

This workflow allows you to manually restart the api-gateway service on your server using Docker Compose.

### Required Secrets

Configure the following secrets in your GitHub repository settings:

1. **API_GATEWAY_SERVER_USER** - SSH username for server access
   - Example: `ubuntu`, `deploy`, or your server username

2. **API_GATEWAY_SERVER_PASSWORD** - SSH password for authentication
   - Example: `your-secure-password`

3. **API_GATEWAY_SERVER_HOST** - Server hostname or IP address
   - Example: `api.example.com` or `192.168.1.100`

4. **API_GATEWAY_SERVER_PORT** - SSH port number
   - Example: `22` (default SSH port) or custom port like `2222`

5. **API_GATEWAY_SERVER_ROOT_PATH** - Root directory path on the server
   - Example: `/home/ubuntu/myapp` or `/opt/services/api-gateway`

6. **API_GATEWAY_SERVER_DOCKER_COMPOSE_PATH** - Docker Compose file name
   - Example: `docker-compose.yml` or `docker-compose.prod.yml`

### Quick Setup

Use the provided configuration script to set up all secrets at once:

```bash
# From the control-center directory
node scripts/configure-github-secrets.mjs
```

This script will:
- Check for GitHub CLI installation and authentication
- Prompt you for each secret value (with defaults where applicable)
- Automatically set all secrets in your GitHub repository

### Manual Setup

Alternatively, you can set secrets manually:

```bash
# Set each secret individually using GitHub CLI
gh secret set API_GATEWAY_SERVER_USER --repo <owner/repo>
gh secret set API_GATEWAY_SERVER_PASSWORD --repo <owner/repo>
# ... and so on for each secret
```

### Usage

1. **Manual Trigger**: Go to Actions → Restart API Gateway → Run workflow
   - You can optionally provide a reason for the restart

2. **Scheduled Restart**: Uncomment the schedule section in the workflow to enable automatic periodic restarts

### What the Workflow Does

1. Connects to the server via SSH using the provided credentials
2. Navigates to the project directory
3. Stops the existing Docker containers: `docker-compose -f docker-compose.prod.yml down`
4. Rebuilds and starts the containers: `docker-compose -f docker-compose.prod.yml up -d --build`
5. Verifies the containers are running