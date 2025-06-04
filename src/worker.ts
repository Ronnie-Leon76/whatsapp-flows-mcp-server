import { JobWorker } from "./jobs/job-worker.js"

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5")

async function main() {
  console.log("Starting WhatsApp Flows Job Worker...")
  
  const worker = new JobWorker("whatsapp-surveys", REDIS_URL, WORKER_CONCURRENCY)

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down gracefully...")
    await worker.stop()
    process.exit(0)
  })

  process.on("SIGINT", async () => {
    console.log("Received SIGINT, shutting down gracefully...")
    await worker.stop()
    process.exit(0)
  })

  // Start the worker
  await worker.start()
}

main().catch((error) => {
  console.error("Worker error:", error)
  process.exit(1)
})