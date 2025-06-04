import type { Survey } from "../survey/survey-manager.js"
import type { Customer } from "../erp/erp-manager.js"
import type { ERPConfig } from "../config/config-manager.js"

/**
 * Format survey response for API output
 */
export function formatSurveyResponse(survey: Survey): string {
  return JSON.stringify(
    {
      success: true,
      survey: {
        id: survey.id,
        title: survey.title,
        flowId: survey.flowId,
        questionsCount: survey.questions.length,
        hasGiveaway: survey.hasGiveaway,
      },
      message: "Survey created successfully with WhatsApp Flow",
    },
    null,
    2,
  )
}

/**
 * Format customer list for API output
 */
export function formatCustomerList(customers: Customer[], erpConfigName: string, filters?: any): string {
  return JSON.stringify(
    {
      success: true,
      customers: customers.slice(0, 10), // Show first 10 for preview
      totalCount: customers.length,
      erpConfig: erpConfigName,
      filters,
    },
    null,
    2,
  )
}

/**
 * Format ERP config list for API output
 */
export function formatERPConfigList(configs: ERPConfig[]): string {
  return JSON.stringify(
    {
      success: true,
      configs: configs.map((config) => ({
        name: config.name,
        type: config.type,
        baseUrl: config.credentials.baseUrl,
        company: config.credentials.company,
        lastTested: config.lastTested,
      })),
    },
    null,
    2,
  )
}