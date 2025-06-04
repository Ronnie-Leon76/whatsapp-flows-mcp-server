import { JobQueue, JobData } from "./job-queue.js"
import { JobProcessor } from "./job-processor.js"

export class JobWorker {
  private queue: JobQueue
  private processor: JobProcessor
  private isRunning = false
  private concurrency: number
  private activeJobs = new Set<string>()

  constructor(queueName: string, redisUrl: string, concurrency = 5) {
    this.queue = new JobQueue(queueName, redisUrl)
    this.processor = new JobProcessor()
    this.concurrency = concurrency

    // Set up event listeners
    this.queue.on("error", (error) => {
      console.error("Queue error:", error)
    })

    this.queue.on("job:active", (job) => {
      console.log(`Job ${job.id} started processing`)
    })

    this.queue.on("job:completed", (job) => {
      console.log(`Job ${job.id} completed successfully`)
      this.activeJobs.delete(job.id)
    })

    this.queue.on("job:failed", (job) => {
      console.error(`Job ${job.id} failed permanently:`, job.error)
      this.activeJobs.delete(job.id)
    })

    this.queue.on("job:retrying", (job) => {
      console.log(`Job ${job.id} will be retried (attempt ${job.attempts}/${job.maxAttempts})`)
      this.activeJobs.delete(job.id)
    })
  }

  async start(): Promise<void> {
    await this.queue.connect()
    this.isRunning = true
    
    console.log(`Worker started with concurrency: ${this.concurrency}`)
    
    // Start processing loop
    this.processJobs()
  }

  async stop(): Promise<void> {
    this.isRunning = false
    
    // Wait for active jobs to complete
    while (this.activeJobs.size > 0) {
      console.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    await this.queue.disconnect()
    console.log("Worker stopped")
  }

  private async processJobs(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check if we can process more jobs
        if (this.activeJobs.size >= this.concurrency) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }

        // Get next job
        const job = await this.queue.getNextJob()
        
        if (!job) {
          // No jobs available, wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Process job asynchronously
        this.activeJobs.add(job.id)
        this.processJob(job).catch((error) => {
          console.error(`Error processing job ${job.id}:`, error)
          this.activeJobs.delete(job.id)
        })

      } catch (error) {
        console.error("Error in job processing loop:", error)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  private async processJob(job: JobData): Promise<void> {
    try {
      console.log(`Processing job ${job.id} of type ${job.type}`)
      
      // Process the job based on its type
      const result = await this.processor.process(job, (progress) => {
        this.queue.updateJobProgress(job.id, progress)
      })

      // Mark job as completed
      await this.queue.completeJob(job.id, result)
      
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error)
      
      // Mark job as failed
      await this.queue.failJob(job.id, error instanceof Error ? error.message : String(error))
    }
  }

  async getStats() {
    return {
      isRunning: this.isRunning,
      concurrency: this.concurrency,
      activeJobs: this.activeJobs.size,
      queueStats: await this.queue.getQueueStats(),
    }
  }
}