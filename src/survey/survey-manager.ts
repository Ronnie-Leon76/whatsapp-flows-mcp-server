import type { WhatsAppFlowsManager, FlowQuestion } from "../whatsapp/flows-manager.js"
import type { Customer } from "../erp/erp-manager.js"
import { promises as fs } from "fs"
import { join } from "path"

export interface Survey {
  id: string
  title: string
  description: string
  questions: FlowQuestion[]
  category: string
  hasGiveaway: boolean
  giveaway?: {
    type: string
    description: string
    numWinners: number
  } | undefined
  flowId?: string
  status: "active" | "inactive" | "deleted"
  createdAt: string
  updatedAt: string
}

export interface SendResult {
  successful: number
  failed: number
  invalid: number
  details: {
    successful: string[]
    failed: string[]
    invalid: string[]
  }
}

export class SurveyManager {
  private surveysPath: string

  constructor(private whatsappManager: WhatsAppFlowsManager) {
    this.surveysPath = "./surveys"
    this.ensureSurveysDirectory()
  }

  private async ensureSurveysDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.surveysPath, { recursive: true })
    } catch (error) {
      // Directory might already exist
    }
  }

  async createSurvey(params: {
    title: string
    description: string
    questions: FlowQuestion[]
    category?: string
    hasGiveaway?: boolean
    giveaway?: {
      type: string
      description: string
      numWinners: number
    }
  }): Promise<Survey> {
    const surveyId = this.generateId()
    const now = new Date().toISOString()

    // Create WhatsApp Flow
    const flowId = await this.whatsappManager.createFlow(params.title, params.description, params.questions)

    const survey: Survey = {
      id: surveyId,
      title: params.title,
      description: params.description,
      questions: params.questions,
      category: params.category || "Customer Feedback",
      hasGiveaway: params.hasGiveaway || false,
      giveaway: params.giveaway,
      flowId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }

    await this.saveSurvey(survey)
    return survey
  }

  async getSurvey(surveyId: string): Promise<Survey | null> {
    try {
      const surveyFile = join(this.surveysPath, `${surveyId}.json`)
      const data = await fs.readFile(surveyFile, "utf-8")
      return JSON.parse(data) as Survey
    } catch (error) {
      return null
    }
  }

  async listSurveys(): Promise<Survey[]> {
    try {
      const files = await fs.readdir(this.surveysPath)
      const surveys: Survey[] = []

      for (const file of files) {
        if (file.endsWith(".json")) {
          const surveyId = file.replace(".json", "")
          const survey = await this.getSurvey(surveyId)
          if (survey && survey.status === "active") {
            surveys.push(survey)
          }
        }
      }

      return surveys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (error) {
      return []
    }
  }

  async sendSurveyToCustomers(surveyId: string, customers: Customer[]): Promise<SendResult> {
    const survey = await this.getSurvey(surveyId)
    if (!survey || !survey.flowId) {
      throw new Error("Survey not found or WhatsApp flow not configured")
    }

    const result: SendResult = {
      successful: 0,
      failed: 0,
      invalid: 0,
      details: {
        successful: [],
        failed: [],
        invalid: [],
      },
    }

    for (const customer of customers) {
      try {
        // Validate phone number
        const isValid = await this.whatsappManager.validatePhoneNumber(customer.phoneNumber)

        if (!isValid) {
          result.invalid++
          result.details.invalid.push(customer.phoneNumber)
          continue
        }

        // Send survey
        const sent = await this.whatsappManager.sendFlow(survey.flowId, customer.phoneNumber)

        if (sent) {
          result.successful++
          result.details.successful.push(customer.phoneNumber)
        } else {
          result.failed++
          result.details.failed.push(customer.phoneNumber)
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Error sending to ${customer.phoneNumber}:`, error)
        result.failed++
        result.details.failed.push(customer.phoneNumber)
      }
    }

    return result
  }

  async sendSurveyToPhoneNumbers(surveyId: string, phoneNumbers: string[]): Promise<SendResult> {
    const survey = await this.getSurvey(surveyId)
    if (!survey || !survey.flowId) {
      throw new Error("Survey not found or WhatsApp flow not configured")
    }

    const result: SendResult = {
      successful: 0,
      failed: 0,
      invalid: 0,
      details: {
        successful: [],
        failed: [],
        invalid: [],
      },
    }

    for (const phoneNumber of phoneNumbers) {
      try {
        // Validate phone number
        const isValid = await this.whatsappManager.validatePhoneNumber(phoneNumber)

        if (!isValid) {
          result.invalid++
          result.details.invalid.push(phoneNumber)
          continue
        }

        // Send survey
        const sent = await this.whatsappManager.sendFlow(survey.flowId, phoneNumber)

        if (sent) {
          result.successful++
          result.details.successful.push(phoneNumber)
        } else {
          result.failed++
          result.details.failed.push(phoneNumber)
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Error sending to ${phoneNumber}:`, error)
        result.failed++
        result.details.failed.push(phoneNumber)
      }
    }

    return result
  }

  private async saveSurvey(survey: Survey): Promise<void> {
    const surveyFile = join(this.surveysPath, `${survey.id}.json`)
    await fs.writeFile(surveyFile, JSON.stringify(survey, null, 2))
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }
}