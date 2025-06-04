import { JobData } from "./job-queue.js"
import { WhatsAppFlowsManager } from "../whatsapp/flows-manager.js"
import { ERPManager } from "../erp/erp-manager.js"
import { ConfigManager } from "../config/config-manager.js"

export interface ProcessERPCustomersJobData {
  erpConfigName: string
  surveyId: string
  filters: {
    dateRange?: {
      startDate: string
      endDate: string
    }
    country?: string
    customerType?: string
    minAmount?: number
  }
  limit?: number
}

export interface ProcessManualNumbersJobData {
  surveyId: string
  phoneNumbers: string[]
}

export interface SendSurveyResult {
  total: number
  successful: number
  failed: number
  invalid: number
  details: {
    successful: string[]
    failed: string[]
    invalid: string[]
  }
}

export class JobProcessor {
  private whatsappManager: WhatsAppFlowsManager
  private erpManager: ERPManager
  private configManager: ConfigManager

  constructor() {
    this.configManager = new ConfigManager()
    this.erpManager = new ERPManager(this.configManager)
    this.whatsappManager = new WhatsAppFlowsManager()
  }

  async process(job: JobData, updateProgress: (progress: number) => void): Promise<any> {
    switch (job.type) {
      case "process_erp_customers":
        return this.processERPCustomers(job.data as ProcessERPCustomersJobData, updateProgress)
      
      case "process_manual_numbers":
        return this.processManualNumbers(job.data as ProcessManualNumbersJobData, updateProgress)
      
      case "send_survey_batch":
        return this.sendSurveyBatch(job.data, updateProgress)
      
      default:
        throw new Error(`Unknown job type: ${job.type}`)
    }
  }

  private async processERPCustomers(
    data: ProcessERPCustomersJobData,
    updateProgress: (progress: number) => void
  ): Promise<SendSurveyResult> {
    console.log(`Processing ERP customers for survey ${data.surveyId}`)
    
    updateProgress(10)
    
    // Get customers from ERP
    const customers = await this.erpManager.getCustomers(
      data.erpConfigName,
      data.filters,
      data.limit
    )
    
    console.log(`Found ${customers.length} customers from ERP`)
    updateProgress(30)
    
    // Process customers in batches
    const result: SendSurveyResult = {
      total: customers.length,
      successful: 0,
      failed: 0,
      invalid: 0,
      details: {
        successful: [],
        failed: [],
        invalid: [],
      },
    }

    const batchSize = 10
    const totalBatches = Math.ceil(customers.length / batchSize)
    
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      
      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} customers)`)
      
      for (const customer of batch) {
        try {
          // Validate phone number
          const isValid = await this.whatsappManager.validatePhoneNumber(customer.phoneNumber)
          
          if (!isValid) {
            result.invalid++
            result.details.invalid.push(customer.phoneNumber)
            continue
          }

          // Send survey
          const sent = await this.sendSurveyToCustomer(data.surveyId, customer.phoneNumber)
          
          if (sent) {
            result.successful++
            result.details.successful.push(customer.phoneNumber)
          } else {
            result.failed++
            result.details.failed.push(customer.phoneNumber)
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
          
        } catch (error) {
          console.error(`Error processing customer ${customer.customerNo}:`, error)
          result.failed++
          result.details.failed.push(customer.phoneNumber)
        }
      }
      
      // Update progress
      const progress = 30 + (batchNumber / totalBatches) * 60
      updateProgress(Math.round(progress))
    }
    
    updateProgress(100)
    console.log(`ERP customer processing completed: ${result.successful} successful, ${result.failed} failed, ${result.invalid} invalid`)
    
    return result
  }

  private async processManualNumbers(
    data: ProcessManualNumbersJobData,
    updateProgress: (progress: number) => void
  ): Promise<SendSurveyResult> {
    console.log(`Processing ${data.phoneNumbers.length} manual phone numbers for survey ${data.surveyId}`)
    
    updateProgress(10)
    
    const result: SendSurveyResult = {
      total: data.phoneNumbers.length,
      successful: 0,
      failed: 0,
      invalid: 0,
      details: {
        successful: [],
        failed: [],
        invalid: [],
      },
    }

    const batchSize = 10
    const totalBatches = Math.ceil(data.phoneNumbers.length / batchSize)
    
    for (let i = 0; i < data.phoneNumbers.length; i += batchSize) {
      const batch = data.phoneNumbers.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      
      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} numbers)`)
      
      for (const phoneNumber of batch) {
        try {
          // Validate phone number
          const isValid = await this.whatsappManager.validatePhoneNumber(phoneNumber)
          
          if (!isValid) {
            result.invalid++
            result.details.invalid.push(phoneNumber)
            continue
          }

          // Send survey
          const sent = await this.sendSurveyToCustomer(data.surveyId, phoneNumber)
          
          if (sent) {
            result.successful++
            result.details.successful.push(phoneNumber)
          } else {
            result.failed++
            result.details.failed.push(phoneNumber)
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
          
        } catch (error) {
          console.error(`Error processing phone number ${phoneNumber}:`, error)
          result.failed++
          result.details.failed.push(phoneNumber)
        }
      }
      
      // Update progress
      const progress = 10 + (batchNumber / totalBatches) * 80
      updateProgress(Math.round(progress))
    }
    
    updateProgress(100)
    console.log(`Manual numbers processing completed: ${result.successful} successful, ${result.failed} failed, ${result.invalid} invalid`)
    
    return result
  }

  private async sendSurveyBatch(
    data: { surveyId: string; phoneNumbers: string[] },
    updateProgress: (progress: number) => void
  ): Promise<SendSurveyResult> {
    // Similar to processManualNumbers but optimized for batch sending
    return this.processManualNumbers(data, updateProgress)
  }

  private async sendSurveyToCustomer(surveyId: string, phoneNumber: string): Promise<boolean> {
    try {
      // Get survey flow ID (this would typically come from the survey manager)
      const flowId = await this.getSurveyFlowId(surveyId)
      
      if (!flowId) {
        console.error(`No flow ID found for survey ${surveyId}`)
        return false
      }

      // Send the survey
      return await this.whatsappManager.sendFlow(flowId, phoneNumber)
      
    } catch (error) {
      console.error(`Error sending survey to ${phoneNumber}:`, error)
      return false
    }
  }

  private async getSurveyFlowId(surveyId: string): Promise<string | null> {
    try {
      // This would typically query the survey database
      // For now, we'll implement a simple file-based lookup
      const fs = await import("fs/promises")
      const path = await import("path")
      
      const surveyFile = path.join("./surveys", `${surveyId}.json`)
      const surveyData = await fs.readFile(surveyFile, "utf-8")
      const survey = JSON.parse(surveyData)
      
      return survey.flowId || null
    } catch (error) {
      console.error(`Error getting flow ID for survey ${surveyId}:`, error)
      return null
    }
  }
}