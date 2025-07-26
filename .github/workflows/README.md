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

2. **Scheduled Restart**: Uncomment the schedule section in the workflow to enable automatic periodic restarts

### What the Workflow Does

1. Connects to the server via SSH using the provided credentials
2. Creates a timestamped backup of container logs before restart
   - Exports logs from `chatgpt_proxy_prod` container
   - Archives them as `api-gateway-logs-YYYY-MM-DD_HH-MM-SS.tar.gz` in home directory
3. Navigates to the project directory
4. Stops the existing Docker containers: `docker-compose -f docker-compose.prod.yml down`
5. Rebuilds and starts the containers: `docker-compose -f docker-compose.prod.yml up -d --build`
6. Waits for services to start and verifies the containers are running

### Log Backups

Before each restart, the workflow automatically creates a snapshot of the container logs. These backups are stored on the server in the home directory with timestamps. You can retrieve them later using:

```bash
scp -P 4242 resale@173.212.230.201:~/api-gateway-logs-*.tar.gz ./
```