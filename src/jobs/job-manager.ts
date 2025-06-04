import { JobQueue, JobOptions } from "./job-queue.js"
import type { ProcessERPCustomersJobData, ProcessManualNumbersJobData } from "./job-processor.js"

export class JobManager {
  private queue: JobQueue

  constructor(redisUrl: string) {
    this.queue = new JobQueue("whatsapp-surveys", redisUrl)
  }

  async connect(): Promise<void> {
    await this.queue.connect()
  }

  async disconnect(): Promise<void> {
    await this.queue.disconnect()
  }

  async addERPCustomersJob(
    erpConfigName: string,
    surveyId: string,
    filters: ProcessERPCustomersJobData["filters"],
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: ProcessERPCustomersJobData = {
      erpConfigName,
      surveyId,
      filters,
      limit: 1000, // Default limit
    }

    return this.queue.add("process_erp_customers", jobData, {
      priority: 5,
      maxAttempts: 3,
      ...options,
    })
  }

  async addManualNumbersJob(
    surveyId: string,
    phoneNumbers: string[],
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: ProcessManualNumbersJobData = {
      surveyId,
      phoneNumbers,
    }

    return this.queue.add("process_manual_numbers", jobData, {
      priority: 5,
      maxAttempts: 3,
      ...options,
    })
  }

  async addSurveyBatchJob(
    surveyId: string,
    phoneNumbers: string[],
    options: JobOptions = {}
  ): Promise<string> {
    return this.queue.add("send_survey_batch", { surveyId, phoneNumbers }, {
      priority: 3,
      maxAttempts: 2,
      ...options,
    })
  }

  async getJobStatus(jobId: string) {
    return this.queue.getJob(jobId)
  }

  async getQueueStats() {
    return this.queue.getQueueStats()
  }

  async getJobs(status: "waiting" | "active" | "completed" | "failed" | "delayed", start = 0, end = 9) {
    return this.queue.getJobs(status, start, end)
  }

  async cleanOldJobs(maxAge = 24 * 60 * 60 * 1000): Promise<{ completed: number; failed: number }> {
    const [completed, failed] = await Promise.all([
      this.queue.clean("completed", maxAge),
      this.queue.clean("failed", maxAge),
    ])

    return { completed, failed }
  }
}