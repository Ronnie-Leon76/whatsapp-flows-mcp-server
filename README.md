# WhatsApp Flows API MCP Server

A containerized Model Context Protocol (MCP) server that provides tools for creating and managing WhatsApp surveys with ERP system integration, including Redis and Celery for background processing.

## Features

- **Dockerized Architecture**: Complete containerized setup with Redis and Celery
- **Modular ERP Integration**: Support for Business Central, SAP, Oracle, and custom ERP systems
- **Background Processing**: Celery workers for handling large customer lists
- **WhatsApp Flow Management**: Create and send interactive surveys via WhatsApp Business API
- **Monitoring Tools**: Flower for Celery monitoring and Redis Commander for Redis management
- **Development Support**: Hot reload and development containers

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Environment variables configured

### 1. Clone and Configure

\`\`\`bash
git clone https://github.com/Ronnie-Leon76/whatsapp-flows-mcp-server.git
cd whatsapp-flows-mcp-server

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your WhatsApp Business API credentials
\`\`\`

### 2. Start Services

#### Production Mode
\`\`\`bash
make start
# or
./scripts/start.sh
\`\`\`

#### Development Mode (with hot reload)
\`\`\`bash
make start-dev
# or
./scripts/start-dev.sh
\`\`\`

### 3. Access Services

- **MCP Server**: Running in container (stdio transport)
- **Job Dashboard**: http://localhost:3001 (job monitoring)
- **Redis Commander**: http://localhost:8081 (Redis management)
- **Redis**: localhost:6379

## Docker Services

### Core Services

1. **mcp-server**: The main MCP server
2. **redis**: Redis instance for job queue
3. **job-worker**: TypeScript background job workers (2 replicas)
4. **job-dashboard**: Web UI for monitoring jobs
5. **redis-commander**: Web UI for Redis management

### Service Architecture

\`\`\`
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Server    │    │  Job Worker 1   │    │  Job Worker 2   │
│                 │    │  (TypeScript)   │    │  (TypeScript)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │     Redis       │
                    │   (Job Queue)   │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Job Dashboard  │
                    │   (Express)     │
                    └─────────────────┘
\`\`\`

## Available Commands

### Make Commands

\`\`\`bash
make help          # Show available commands
make build         # Build Docker images
make start         # Start production services
make start-dev     # Start development services
make stop          # Stop all services
make logs          # View logs from all services
make logs-mcp      # View MCP server logs
make logs-celery   # View Celery worker logs
make clean         # Clean up Docker resources
make restart       # Restart all services
make shell-mcp     # Open shell in MCP server container
make shell-celery  # Open shell in Celery worker container
make redis-cli     # Open Redis CLI
\`\`\`

### NPM Scripts

\`\`\`bash
npm run docker:build      # Build Docker images
npm run docker:start      # Start production services
npm run docker:start-dev  # Start development services
npm run docker:stop       # Stop all services
npm run docker:logs       # View logs
\`\`\`

## Environment Configuration

### Required Environment Variables

\`\`\`env
# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_VERIFY_TOKEN=your_verify_token
\`\`\`

### Optional Environment Variables

\`\`\`env
# Redis Configuration (automatically set in Docker)
REDIS_URL=redis://redis:6379/0

# Worker Configuration
WORKER_CONCURRENCY=5

# Dashboard Configuration
PORT=3001

# Paths (automatically set in Docker)
CONFIG_PATH=/app/config
SURVEYS_PATH=/app/surveys
\`\`\`

## Development

### Hot Reload Development

\`\`\`bash
# Start development environment with hot reload
make start-dev

# View development logs
docker-compose -f docker-compose.dev.yml logs -f
\`\`\`

### Local Development (without Docker)

\`\`\`bash
# Start Redis locally
docker run -d -p 6379:6379 redis:7-alpine

# Install dependencies
npm install

# Start MCP server
npm run dev

# Start Celery worker (in separate terminal)
cd celery_app
celery -A tasks worker --loglevel=info
\`\`\`

## Monitoring and Debugging

### Job Dashboard (TypeScript)

Access the Job Dashboard at http://localhost:3001 to:
- Monitor active/completed jobs
- View job details and progress
- Monitor worker status
- View real-time job execution

### Redis Commander (Redis Management)

Access Redis Commander at http://localhost:8081 to:
- Browse Redis keys
- Monitor Redis performance
- View stored data
- Debug Redis issues

### New MCP Tools

- `send-survey`: Now supports background job processing for large lists
- `get-job-status`: Monitor background job progress
- `get-queue-stats`: View job queue statistics

### Viewing Logs

\`\`\`bash
# All services
make logs

# Specific service
docker-compose logs -f mcp-server
docker-compose logs -f celery-worker
docker-compose logs -f redis

# Follow logs in real-time
docker-compose logs -f --tail=100
\`\`\`

## Production Deployment

### Docker Compose Production

\`\`\`bash
# Start production services
make start

# Scale Celery workers
docker-compose up -d --scale celery-worker=4

# Update services
docker-compose pull
docker-compose up -d
\`\`\`

### Health Checks

All services include health checks:
- **Redis**: `redis-cli ping`
- **MCP Server**: Node.js health check
- **Celery Worker**: `celery inspect ping`

### Persistent Data

Data is persisted in Docker volumes:
- `redis_data`: Redis data
- `mcp_config`: ERP configurations
- `mcp_surveys`: Survey definitions
- `mcp_logs`: Application logs
- `celery_logs`: Celery worker logs

## Troubleshooting

### Common Issues

1. **Services won't start**
   \`\`\`bash
   # Check Docker status
   docker-compose ps
   
   # View service logs
   make logs
   \`\`\`

2. **Redis connection issues**
   \`\`\`bash
   # Test Redis connection
   make redis-cli
   ping
   \`\`\`

3. **Celery tasks not processing**
   \`\`\`bash
   # Check Celery worker status
   make logs-celery
   
   # Access Flower monitoring
   open http://localhost:5555
   \`\`\`

4. **Environment variables not loaded**
   \`\`\`bash
   # Verify .env file exists and is configured
   cat .env
   
   # Restart services
   make restart
   \`\`\`

### Debugging

\`\`\`bash
# Access container shells
make shell-mcp      # MCP server container
make shell-celery   # Celery worker container

# View container resources
docker stats

# Inspect container configuration
docker-compose config
\`\`\`

## License

MIT
\`\`\`

This complete Docker setup provides:

1. **Production-ready containers** with proper health checks and security
2. **Development environment** with hot reload and debugging capabilities
3. **Background processing** with Celery workers and Redis
4. **Monitoring tools** (Flower for Celery, Redis Commander for Redis)
5. **Easy management** with Make commands and scripts
6. **Persistent data** with Docker volumes
7. **Scalable architecture** that can handle multiple workers

You can now run the entire system with a single command: `make start` or `make start-dev` for development.