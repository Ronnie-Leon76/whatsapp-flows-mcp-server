import type { ERPAdapter, Customer } from "../erp-manager.js"
import type { ERPCredentials } from "../../config/config-manager.js"

export class BusinessCentralAdapter implements ERPAdapter {
  private baseUrl: string
  private credentials: ERPCredentials

  constructor(credentials: ERPCredentials) {
    this.credentials = credentials
    this.baseUrl = credentials.baseUrl
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/Company('${this.credentials.company}')/Customer_Card?$top=1`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString("base64")}`,
          Accept: "application/json",
        },
      })

      return response.ok
    } catch (error) {
      console.error("Business Central connection test failed:", error)
      return false
    }
  }

  async getCustomers(filters?: any, limit = 100): Promise<Customer[]> {
    try {
      let url = `${this.baseUrl}/Company('${this.credentials.company}')/Posted_Sales_Invoice`

      const filterParams: string[] = []

      if (filters?.dateRange) {
        filterParams.push(
          `Posting_Date ge ${filters.dateRange.startDate} and Posting_Date le ${filters.dateRange.endDate}`,
        )
      }

      if (filters?.minAmount) {
        filterParams.push(`Amount_Including_VAT ge ${filters.minAmount}`)
      }

      if (filterParams.length > 0) {
        url += `?$filter=${filterParams.join(" and ")}`
        url += `&$select=No,Sell_to_Customer_No,Sell_to_Contact_No,Amount_Including_VAT,Posting_Date`
        url += `&$top=${limit}`
      } else {
        url += `?$select=No,Sell_to_Customer_No,Sell_to_Contact_No,Amount_Including_VAT,Posting_Date&$top=${limit}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString("base64")}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Business Central API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const invoices = data.value || []

      const customers: Customer[] = []

      for (const invoice of invoices) {
        let phoneNumber = invoice.Sell_to_Contact_No

        // If no contact number, fetch from customer card
        if (!phoneNumber && invoice.Sell_to_Customer_No) {
          const customerUrl = `${this.baseUrl}/Company('${this.credentials.company}')/Customer_Card?$filter=No eq '${invoice.Sell_to_Customer_No}'&$select=Phone_No,Name`

          const customerResponse = await fetch(customerUrl, {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString("base64")}`,
              Accept: "application/json",
            },
          })

          if (customerResponse.ok) {
            const customerData = await customerResponse.json()
            if (customerData.value && customerData.value.length > 0) {
              phoneNumber = customerData.value[0].Phone_No
            }
          }
        }

        if (phoneNumber && this.isValidPhoneNumber(phoneNumber)) {
          customers.push({
            customerNo: invoice.Sell_to_Customer_No,
            name: "", // Would need additional API call to get name
            phoneNumber: this.formatPhoneNumber(phoneNumber),
            invoiceNo: invoice.No,
            amount: invoice.Amount_Including_VAT,
            postingDate: invoice.Posting_Date,
            country: filters?.country || this.credentials.company,
          })
        }
      }

      return customers
    } catch (error) {
      console.error("Error fetching customers from Business Central:", error)
      throw error
    }
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, "")

    // Check if it's a valid length (assuming international format)
    return cleaned.length >= 10 && cleaned.length <= 15
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, "")

    // Handle Kenyan numbers (assuming this is the primary market)
    if (cleaned.startsWith("0") && cleaned.length === 10) {
      cleaned = "254" + cleaned.substring(1)
    }

    // Add + prefix if not present
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned
    }

    return cleaned
  }
}