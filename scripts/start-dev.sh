#!/bin/bash

# Start script for development
echo "Starting WhatsApp Flows MCP Server in development mode..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Build and start development services
docker-compose -f docker-compose.dev.yml up --build

echo "Development services started!"
echo ""
echo "Available services:"
echo "- MCP Server (dev): Running with hot reload"
echo "- Job Workers (dev): Running with hot reload"
echo "- Redis: localhost:6379"
echo "- Job Dashboard: http://localhost:3001"
echo ""
echo "To stop services:"
echo "  docker-compose -f docker-compose.dev.yml down"