.PHONY: help build start start-dev stop logs clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

start: ## Start production services
	@chmod +x scripts/start.sh
	@./scripts/start.sh

start-dev: ## Start development services with hot reload
	@chmod +x scripts/start-dev.sh
	@./scripts/start-dev.sh

stop: ## Stop all services
	@chmod +x scripts/stop.sh
	@./scripts/stop.sh

logs: ## View logs from all services
	docker-compose logs -f

logs-mcp: ## View MCP server logs
	docker-compose logs -f mcp-server

logs-worker: ## View job worker logs
	docker-compose logs -f job-worker

logs-dashboard: ## View dashboard logs
	docker-compose logs -f job-dashboard

clean: ## Clean up Docker resources
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -f

restart: stop start ## Restart all services

restart-dev: ## Restart development services
	docker-compose -f docker-compose.dev.yml down
	docker-compose -f docker-compose.dev.yml up --build

shell-mcp: ## Open shell in MCP server container
	docker-compose exec mcp-server sh

shell-worker: ## Open shell in job worker container
	docker-compose exec job-worker sh

redis-cli: ## Open Redis CLI
	docker-compose exec redis redis-cli

dashboard: ## Open job dashboard in browser
	@echo "Opening job dashboard..."
	@command -v open >/dev/null 2>&1 && open http://localhost:3001 || \
	 command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:3001 || \
	 echo "Please open http://localhost:3001 in your browser"
