export interface WhatsAppFlow {
  id: string
  name: string
  status: "draft" | "published"
  version: string
}

export interface FlowQuestion {
  type: "RadioButtonsGroup" | "TextInput" | "CheckboxGroup" | "Dropdown"
  text: string
  name: string
  required: boolean
  options?: string[]
}

export class WhatsAppFlowsManager {
  private accessToken: string
  private phoneNumberId: string
  private businessAccountId: string
  private baseUrl: string

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || ""
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ""
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || ""
    this.baseUrl = "https://graph.facebook.com/v18.0"
  }

  async createFlow(title: string, description: string, questions: FlowQuestion[]): Promise<string> {
    try {
      // Step 1: Create flow draft
      const flowResponse = await fetch(`${this.baseUrl}/${this.businessAccountId}/flows`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: title,
          categories: JSON.stringify(["SURVEY"]),
        }),
      })

      if (!flowResponse.ok) {
        const error = await flowResponse.json()
        throw new Error(`Failed to create flow: ${error.error?.message || "Unknown error"}`)
      }

      const flowData = await flowResponse.json()
      const flowId = flowData.id

      // Step 2: Create flow JSON
      const flowJson = this.buildFlowJson(title, description, questions)

      // Step 3: Upload flow JSON as asset
      const formData = new FormData()
      formData.append("file", new Blob([JSON.stringify(flowJson)], { type: "application/json" }), "flow.json")
      formData.append("name", "flow.json")
      formData.append("asset_type", "FLOW_JSON")

      const assetResponse = await fetch(`${this.baseUrl}/${flowId}/assets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: formData,
      })

      if (!assetResponse.ok) {
        const error = await assetResponse.json()
        throw new Error(`Failed to upload flow asset: ${error.error?.message || "Unknown error"}`)
      }

      return flowId
    } catch (error) {
      console.error("Error creating WhatsApp flow:", error)
      throw error
    }
  }

  async sendFlow(flowId: string, phoneNumber: string, flowToken?: string): Promise<boolean> {
    try {
      const token = flowToken || this.generateFlowToken()

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "interactive",
        interactive: {
          type: "flow",
          header: {
            type: "text",
            text: "Survey",
          },
          body: {
            text: "Thank you for choosing our services. Please share your feedback to help us improve. Reply to proceed or ignore to opt out.",
          },
          footer: {
            text: "Click below to start",
          },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: token,
              flow_id: flowId,
              flow_cta: "Start Survey",
              flow_action: "navigate",
              flow_action_payload: {
                screen: "SURVEY_SCREEN",
              },
            },
          },
        },
      }

      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error("WhatsApp send error:", error)
        return false
      }

      return true
    } catch (error) {
      console.error("Error sending WhatsApp flow:", error)
      return false
    }
  }

  async validatePhoneNumber(phoneNumber: string): Promise<boolean> {
    try {
      // Format phone number
      const formattedNumber = this.formatPhoneNumber(phoneNumber)

      // Use WhatsApp Business API to validate
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ phone_number: formattedNumber }],
          type: "contacts",
        }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      const contacts = data.contacts || []

      return contacts.length > 0 && contacts[0].status === "valid"
    } catch (error) {
      console.error("Error validating phone number:", error)
      return false
    }
  }

  private buildFlowJson(title: string, description: string, questions: FlowQuestion[]) {
    type FormElement = 
      | { type: "TextHeading" | "TextBody" | "TextSubheading"; text: string }
      | { type: "RadioButtonsGroup" | "CheckboxGroup"; required: boolean; name: string; "data-source": Array<{id: string, title: string}> }
      | { type: "TextInput"; required: boolean; name: string; label: string; placeholder: string }
      | { type: "Dropdown"; required: boolean; name: string; label: string; "data-source": Array<{id: string, title: string}> }
      | { type: "Footer"; label: string; "on-click-action": { name: string; payload: Record<string, string> } };
      
    const formChildren: FormElement[] = [
      { type: "TextHeading", text: title },
      { type: "TextBody", text: description },
    ]

    // Add questions
    for (const question of questions) {
      formChildren.push({ type: "TextSubheading", text: question.text })

      if (question.type === "RadioButtonsGroup" || question.type === "CheckboxGroup") {
        formChildren.push({
          type: question.type,
          required: question.required,
          name: question.name,
          "data-source":
            question.options?.map((option, index) => ({
              id: `${question.name}_opt_${index}`,
              title: option,
            })) || [],
        })
      } else if (question.type === "TextInput") {
        formChildren.push({
          type: "TextInput",
          required: question.required,
          name: question.name,
          label: question.text,
          placeholder: "Type your answer",
        })
      } else if (question.type === "Dropdown") {
        formChildren.push({
          type: "Dropdown",
          required: question.required,
          name: question.name,
          label: question.text,
          "data-source":
            question.options?.map((option, index) => ({
              id: `${question.name}_opt_${index}`,
              title: option,
            })) || [],
        })
      }
    }

    // Add submit button
    const payload: Record<string, string> = {}
    questions.forEach((q) => {
      payload[q.name] = `\${form.${q.name}}`
    })

    formChildren.push({
      type: "Footer",
      label: "Submit Survey",
      "on-click-action": {
        name: "complete",
        payload,
      },
    })

    return {
      version: "6.3",
      data_api_version: "6.3",
      routing_model: {
        SURVEY_SCREEN: ["complete"],
      },
      screens: [
        {
          id: "SURVEY_SCREEN",
          title,
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "survey_form",
                children: formChildren,
              },
            ],
          },
        },
      ],
      metadata: {
        name: title,
        description: description.substring(0, 100),
        category: "SURVEY",
        validation_errors: [],
        is_interactive: true,
        is_experimental: false,
      },
    }
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, "")

    // Handle different formats
    if (cleaned.startsWith("0") && cleaned.length === 10) {
      // Kenyan format: 0712345678 -> +254712345678
      cleaned = "254" + cleaned.substring(1)
    }

    // Add + prefix if not present
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned
    }

    return cleaned
  }

  private generateFlowToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }
}