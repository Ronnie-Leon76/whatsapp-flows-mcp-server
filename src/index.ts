import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { WhatsAppFlowsManager } from "./whatsapp/flows-manager.js"
import { ERPManager } from "./erp/erp-manager.js"
import { SurveyManager } from "./survey/survey-manager.js"
import { ConfigManager } from "./config/config-manager.js"
import { JobManager } from "./jobs/job-manager.js"
import { formatSurveyResponse, formatCustomerList, formatERPConfigList } from "./utils/formatters.js"

// Create server instance
const server = new McpServer({
  name: "WhatsApp Flows API",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
})

// Initialize managers
const configManager = new ConfigManager()
const erpManager = new ERPManager(configManager)
const whatsappManager = new WhatsAppFlowsManager()
const surveyManager = new SurveyManager(whatsappManager)
const jobManager = new JobManager(process.env.REDIS_URL || "redis://localhost:6379")

// Connect to job manager
jobManager.connect()

// Tool: Configure ERP Connection
server.tool(
  "configure-erp",
  "Configure ERP system connection (Business Central, SAP, Oracle, etc.)",
  {
    erpType: z.enum(["business-central", "sap", "oracle", "custom"]),
    credentials: z.object({
      baseUrl: z.string(),
      username: z.string(),
      password: z.string(),
      company: z.string().optional(),
      apiKey: z.string().optional(),
      customHeaders: z.record(z.string()).optional(),
    }),
    name: z.string().describe("Friendly name for this ERP configuration"),
  },
  async ({ erpType, credentials, name }) => {
    try {
      await configManager.saveERPConfig(name, {
        type: erpType,
        credentials,
      })

      // Test the connection
      const testResult = await erpManager.testConnection(name)

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `ERP configuration '${name}' saved successfully`,
                connectionTest: testResult,
                configId: name,
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                configId: name,
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: Create Survey
server.tool(
  "create-survey",
  "Create a new WhatsApp survey with questions and optional giveaway",
  {
    title: z.string(),
    description: z.string(),
    questions: z.array(
      z.object({
        type: z.enum(["RadioButtonsGroup", "TextInput", "CheckboxGroup", "Dropdown"]),
        text: z.string(),
        name: z.string(),
        required: z.boolean().default(true),
        options: z.array(z.string()).optional(),
      }),
    ),
    category: z.string().default("Customer Feedback"),
    hasGiveaway: z.boolean().default(false),
    giveaway: z
      .object({
        type: z.string(),
        description: z.string(),
        numWinners: z.number(),
      })
      .optional(),
  },
  async ({ title, description, questions, category, hasGiveaway, giveaway }) => {
    try {
      const survey = await surveyManager.createSurvey({
        title,
        description,
        questions,
        category,
        hasGiveaway,
        giveaway,
      })

      return {
        content: [
          {
            type: "text",
            text: formatSurveyResponse(survey),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: Send Survey (with background job support)
server.tool(
  "send-survey",
  "Send survey to customers from ERP or manual phone numbers (uses background jobs for large lists)",
  {
    surveyId: z.string(),
    source: z.enum(["erp", "manual"]),
    erpConfigName: z.string().optional(),
    dateRange: z
      .object({
        startDate: z.string(),
        endDate: z.string(),
      })
      .optional(),
    phoneNumbers: z.array(z.string()).optional(),
    filters: z
      .object({
        country: z.string().optional(),
        customerType: z.string().optional(),
        minAmount: z.number().optional(),
      })
      .optional(),
    useBackgroundJob: z.boolean().default(true).describe("Whether to process in background (recommended for large lists)"),
  },
  async ({ surveyId, source, erpConfigName, dateRange, phoneNumbers, filters, useBackgroundJob }) => {
    try {
      if (source === "erp" && erpConfigName) {
        if (useBackgroundJob) {
          // Add background job for ERP processing
          const jobId = await jobManager.addERPCustomersJob(erpConfigName, surveyId, { dateRange, ...filters })
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Survey job queued for background processing",
                    jobId,
                    surveyId,
                    source: "erp",
                    erpConfig: erpConfigName,
                    status: "queued",
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } else {
          // Process immediately (for small lists)
          const customers = await erpManager.getCustomers(erpConfigName, { dateRange, ...filters })
          const result = await surveyManager.sendSurveyToCustomers(surveyId, customers)
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result: {
                      surveyId,
                      totalSent: result.successful,
                      failed: result.failed,
                      invalid: result.invalid,
                      source: "erp",
                    },
                    message: `Survey sent to ${result.successful} recipients`,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }
      } else if (source === "manual" && phoneNumbers) {
        if (useBackgroundJob && phoneNumbers.length > 10) {
          // Add background job for manual numbers
          const jobId = await jobManager.addManualNumbersJob(surveyId, phoneNumbers)
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Survey job queued for background processing",
                    jobId,
                    surveyId,
                    source: "manual",
                    phoneCount: phoneNumbers.length,
                    status: "queued",
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } else {
          // Process immediately (for small lists)
          const result = await surveyManager.sendSurveyToPhoneNumbers(surveyId, phoneNumbers)
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result: {
                      surveyId,
                      totalSent: result.successful,
                      failed: result.failed,
                      invalid: result.invalid,
                      source: "manual",
                    },
                    message: `Survey sent to ${result.successful} recipients`,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }
      } else {
        throw new Error(
          "Invalid parameters: either provide erpConfigName for ERP source or phoneNumbers for manual source",
        )
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                surveyId,
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: Get Job Status
server.tool(
  "get-job-status",
  "Get the status of a background job",
  {
    jobId: z.string(),
  },
  async ({ jobId }) => {
    try {
      const job = await jobManager.getJobStatus(jobId)
      
      if (!job) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: "Job not found",
                  jobId,
                },
                null,
                2,
              ),
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                job: {
                  id: job.id,
                  type: job.type,
                  status: job.status,
                  progress: job.progress,
                  createdAt: job.createdAt,
                  updatedAt: job.updatedAt,
                  result: job.result,
                  error: job.error,
                  attempts: job.attempts,
                  maxAttempts: job.maxAttempts,
                },
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                jobId,
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: Get Queue Stats
server.tool(
  "get-queue-stats",
  "Get statistics about the job queue",
  {},
  async () => {
    try {
      const stats = await jobManager.getQueueStats()

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                stats,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: Get Customers
server.tool(
  "get-customers",
  "Retrieve customer data from configured ERP system",
  {
    erpConfigName: z.string(),
    filters: z
      .object({
        dateRange: z
          .object({
            startDate: z.string(),
            endDate: z.string(),
          })
          .optional(),
        country: z.string().optional(),
        customerType: z.string().optional(),
        minAmount: z.number().optional(),
      })
      .optional(),
    limit: z.number().default(100),
  },
  async ({ erpConfigName, filters, limit }) => {
    try {
      const customers = await erpManager.getCustomers(erpConfigName, filters, limit)

      return {
        content: [
          {
            type: "text",
            text: formatCustomerList(customers, erpConfigName, filters),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                erpConfig: erpConfigName,
              },
              null,
              2,
            ),
          },
        ],
      }
    }
  },
)

// Tool: List ERP Configs
server.tool("list-erp-configs", "List all configured ERP connections", {}, async () => {
  try {
    const configs = await configManager.listERPConfigs()

    return {
      content: [
        {
          type: "text",
          text: formatERPConfigList(configs),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            null,
            2,
          ),
        },
      ],
    }
  }
})

// Tool: List Surveys
server.tool("list-surveys", "List all created surveys", {}, async () => {
  try {
    const surveys = await surveyManager.listSurveys()

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              surveys: surveys.map((survey) => ({
                id: survey.id,
                title: survey.title,
                description: survey.description,
                questionsCount: survey.questions.length,
                flowId: survey.flowId,
                status: survey.status,
                createdAt: survey.createdAt,
              })),
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            null,
            2,
          ),
        },
      ],
    }
  }
})

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("WhatsApp Flows MCP Server running on stdio")
}

// Only start the server if this file is being run directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Server error:", error)
    process.exit(1)
  })
}

// Export the server for use in Next.js API routes
export { server }