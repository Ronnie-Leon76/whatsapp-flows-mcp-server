import { Redis } from "ioredis"
import { EventEmitter } from "events"

export interface JobData {
  id: string
  type: string
  data: any
  priority?: number
  delay?: number
  attempts?: number
  maxAttempts?: number
  createdAt: Date
  updatedAt: Date
  status: "waiting" | "active" | "completed" | "failed" | "delayed"
  progress?: number
  result?: any
  error?: string
  processingStartedAt?: Date
  processingCompletedAt?: Date
}

export interface JobOptions {
  priority?: number
  delay?: number
  maxAttempts?: number
  backoff?: {
    type: "fixed" | "exponential"
    delay: number
  }
}

export class JobQueue extends EventEmitter {
  private redis: Redis
  private queueName: string
  private processingKey: string
  private completedKey: string
  private failedKey: string

  constructor(queueName: string, redisUrl: string) {
    super()
    this.queueName = queueName
    this.processingKey = `${queueName}:processing`
    this.completedKey = `${queueName}:completed`
    this.failedKey = `${queueName}:failed`
    
    this.redis = new Redis(redisUrl, {
      retryStrategy: () => 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })

    this.redis.on("error", (error) => {
      console.error("Redis connection error:", error)
      this.emit("error", error)
    })

    this.redis.on("connect", () => {
      console.log("Connected to Redis")
      this.emit("ready")
    })
  }

  async connect(): Promise<void> {
    await this.redis.connect()
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect()
  }

  async add(type: string, data: any, options: JobOptions = {}): Promise<string> {
    const jobId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const job: JobData = {
      id: jobId,
      type,
      data,
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: options.delay ? "delayed" : "waiting",
    }

    // Store job data
    await this.redis.hset(`${this.queueName}:job:${jobId}`, {
      data: JSON.stringify(job),
    })

    if (options.delay) {
      // Add to delayed queue
      const executeAt = Date.now() + options.delay
      await this.redis.zadd(`${this.queueName}:delayed`, executeAt, jobId)
    } else {
      // Add to waiting queue with priority
      await this.redis.zadd(`${this.queueName}:waiting`, -(job.priority ?? 0), jobId)
    }

    this.emit("job:added", job)
    return jobId
  }

  async getNextJob(): Promise<JobData | null> {
    // First, check for delayed jobs that are ready
    await this.promoteDelayedJobs()

    // Get the highest priority job from waiting queue
    const result = await this.redis.zpopmax(`${this.queueName}:waiting`)
    
    if (!result || result.length === 0) {
      return null
    }

    const jobId = result[0]
    
    // Move job to processing
    await this.redis.zadd(this.processingKey, Date.now(), jobId)
    
    // Get job data
    const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
    if (!jobDataStr) {
      return null
    }

    const job: JobData = JSON.parse(jobDataStr)
    job.status = "active"
    job.processingStartedAt = new Date()
    job.updatedAt = new Date()

    // Update job data
    await this.redis.hset(`${this.queueName}:job:${jobId}`, {
      data: JSON.stringify(job),
    })

    this.emit("job:active", job)
    return job
  }

  async completeJob(jobId: string, result?: any): Promise<void> {
    const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
    if (!jobDataStr) {
      throw new Error(`Job ${jobId} not found`)
    }

    const job: JobData = JSON.parse(jobDataStr)
    job.status = "completed"
    job.result = result
    job.processingCompletedAt = new Date()
    job.updatedAt = new Date()

    // Update job data
    await this.redis.hset(`${this.queueName}:job:${jobId}`, {
      data: JSON.stringify(job),
    })

    // Remove from processing and add to completed
    await this.redis.zrem(this.processingKey, jobId)
    await this.redis.zadd(this.completedKey, Date.now(), jobId)

    this.emit("job:completed", job)
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
    if (!jobDataStr) {
      throw new Error(`Job ${jobId} not found`)
    }

    const job: JobData = JSON.parse(jobDataStr)
    job.attempts = (job.attempts ?? 0) + 1
    job.error = error
    job.updatedAt = new Date()

    if ((job.attempts ?? 0) < (job.maxAttempts ?? 3)) {
      // Retry the job
      job.status = "waiting"
      
      // Calculate backoff delay
      const backoffDelay = this.calculateBackoffDelay(job.attempts ?? 0)
      const executeAt = Date.now() + backoffDelay
      
      await this.redis.zadd(`${this.queueName}:delayed`, executeAt, jobId)
      await this.redis.zrem(this.processingKey, jobId)
      
      this.emit("job:retrying", job)
    } else {
      // Job failed permanently
      job.status = "failed"
      job.processingCompletedAt = new Date()
      
      await this.redis.zrem(this.processingKey, jobId)
      await this.redis.zadd(this.failedKey, Date.now(), jobId)
      
      this.emit("job:failed", job)
    }

    // Update job data
    await this.redis.hset(`${this.queueName}:job:${jobId}`, {
      data: JSON.stringify(job),
    })
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
    if (!jobDataStr) {
      throw new Error(`Job ${jobId} not found`)
    }

    const job: JobData = JSON.parse(jobDataStr)
    job.progress = Math.max(0, Math.min(100, progress))
    job.updatedAt = new Date()

    await this.redis.hset(`${this.queueName}:job:${jobId}`, {
      data: JSON.stringify(job),
    })

    this.emit("job:progress", job)
  }

  async getJob(jobId: string): Promise<JobData | null> {
    const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
    if (!jobDataStr) {
      return null
    }

    return JSON.parse(jobDataStr)
  }

  async getJobs(status: JobData["status"], start = 0, end = -1): Promise<JobData[]> {
    let key: string
    
    switch (status) {
      case "waiting":
        key = `${this.queueName}:waiting`
        break
      case "active":
        key = this.processingKey
        break
      case "completed":
        key = this.completedKey
        break
      case "failed":
        key = this.failedKey
        break
      case "delayed":
        key = `${this.queueName}:delayed`
        break
      default:
        throw new Error(`Invalid status: ${status}`)
    }

    const jobIds = await this.redis.zrange(key, start, end)
    const jobs: JobData[] = []

    for (const jobId of jobIds) {
      const job = await this.getJob(jobId)
      if (job) {
        jobs.push(job)
      }
    }

    return jobs
  }

  async getQueueStats(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.redis.zcard(`${this.queueName}:waiting`),
      this.redis.zcard(this.processingKey),
      this.redis.zcard(this.completedKey),
      this.redis.zcard(this.failedKey),
      this.redis.zcard(`${this.queueName}:delayed`),
    ])

    return { waiting, active, completed, failed, delayed }
  }

  async clean(status: JobData["status"], maxAge: number): Promise<number> {
    const cutoff = Date.now() - maxAge
    let key: string

    switch (status) {
      case "completed":
        key = this.completedKey
        break
      case "failed":
        key = this.failedKey
        break
      default:
        throw new Error(`Cannot clean jobs with status: ${status}`)
    }

    const jobIds = await this.redis.zrangebyscore(key, 0, cutoff)
    
    if (jobIds.length === 0) {
      return 0
    }

    // Remove job data
    const pipeline = this.redis.pipeline()
    for (const jobId of jobIds) {
      pipeline.hdel(`${this.queueName}:job:${jobId}`, "data")
    }
    
    // Remove from sorted set
    pipeline.zremrangebyscore(key, 0, cutoff)
    
    await pipeline.exec()
    
    return jobIds.length
  }

  private async promoteDelayedJobs(): Promise<void> {
    const now = Date.now()
    const delayedJobs = await this.redis.zrangebyscore(
      `${this.queueName}:delayed`,
      0,
      now
    )

    if (delayedJobs.length === 0) {
      return
    }

    const pipeline = this.redis.pipeline()
    
    for (const jobId of delayedJobs) {
      // Get job to determine priority
      const jobDataStr = await this.redis.hget(`${this.queueName}:job:${jobId}`, "data")
      if (jobDataStr) {
        const job: JobData = JSON.parse(jobDataStr)
        job.status = "waiting"
        job.updatedAt = new Date()
        
        // Update job data
        pipeline.hset(`${this.queueName}:job:${jobId}`, {
          data: JSON.stringify(job),
        })
        
        // Move to waiting queue
        pipeline.zadd(`${this.queueName}:waiting`, -(job.priority || 0), jobId)
      }
      
      // Remove from delayed queue
      pipeline.zrem(`${this.queueName}:delayed`, jobId)
    }

    await pipeline.exec()
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, ...)
    return Math.min(Math.pow(2, attempt) * 1000, 30000) // Max 30 seconds
  }
}