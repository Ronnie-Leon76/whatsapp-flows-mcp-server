import type { ERPAdapter, Customer } from "../erp-manager.js"
import type { ERPCredentials } from "../../config/config-manager.js"

export class CustomAdapter implements ERPAdapter {
  private credentials: ERPCredentials

  constructor(credentials: ERPCredentials) {
    this.credentials = credentials
  }

  async testConnection(): Promise<boolean> {
    try {
      // Implement custom ERP connection test
      const response = await fetch(`${this.credentials.baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          ...this.credentials.customHeaders,
        },
      })

      return response.ok
    } catch (error) {
      console.error("Custom ERP connection test failed:", error)
      return false
    }
  }

  async getCustomers(filters?: any, limit = 100): Promise<Customer[]> {
    try {
      // Implement custom ERP customer data retrieval
      let url = `${this.credentials.baseUrl}/customers`

      const params = new URLSearchParams()
      if (filters?.dateRange) {
        params.append("startDate", filters.dateRange.startDate)
        params.append("endDate", filters.dateRange.endDate)
      }
      if (filters?.country) {
        params.append("country", filters.country)
      }
      if (limit) {
        params.append("limit", limit.toString())
      }

      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          Accept: "application/json",
          ...this.credentials.customHeaders,
        },
      })

      if (!response.ok) {
        throw new Error(`Custom ERP API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Transform the response to match our Customer interface
      return (
        data.customers?.map((customer: any) => ({
          customerNo: customer.id || customer.customerNo,
          name: customer.name,
          phoneNumber: customer.phone || customer.phoneNumber,
          email: customer.email,
          country: customer.country,
        })) || []
      )
    } catch (error) {
      console.error("Error fetching customers from custom ERP:", error)
      throw error
    }
  }
}