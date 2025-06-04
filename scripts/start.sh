#!/bin/bash

# Start script for production
echo "Starting WhatsApp Flows MCP Server with Docker Compose..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Build and start services
docker-compose up --build -d

echo "Services started successfully!"
echo ""
echo "Available services:"
echo "- MCP Server: Running in container"
echo "- Job Workers: Running background job processing"
echo "- Redis: localhost:6379"
echo "- Job Dashboard: http://localhost:3001"
echo "- Redis Commander: http://localhost:8081"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f mcp-server"
echo "  docker-compose logs -f job-worker"
echo ""
echo "To stop services:"
echo "  docker-compose down"