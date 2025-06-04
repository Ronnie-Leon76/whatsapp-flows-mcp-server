import type { ConfigManager, ERPConfig } from "../config/config-manager.js"
import { BusinessCentralAdapter } from "./adapters/business-central.js"
import { SAPAdapter } from "./adapters/sap.js"
import { OracleAdapter } from "./adapters/oracle.js"
import { CustomAdapter } from "./adapters/custom.js"

export interface Customer {
  customerNo: string
  name: string
  phoneNumber: string
  email?: string
  invoiceNo?: string
  amount?: number
  postingDate?: string
  country?: string
}

export interface ERPAdapter {
  testConnection(): Promise<boolean>
  getCustomers(filters?: any, limit?: number): Promise<Customer[]>
}

export interface CustomerFilters {
  dateRange?: {
    startDate: string
    endDate: string
  }
  country?: string
  customerType?: string
  minAmount?: number
}

export class ERPManager {
  private adapters: Map<string, ERPAdapter> = new Map()

  constructor(private configManager: ConfigManager) {}

  private createAdapter(config: ERPConfig): ERPAdapter {
    switch (config.type) {
      case "business-central":
        return new BusinessCentralAdapter(config.credentials)
      case "sap":
        return new SAPAdapter(config.credentials)
      case "oracle":
        return new OracleAdapter(config.credentials)
      case "custom":
        return new CustomAdapter(config.credentials)
      default:
        throw new Error(`Unsupported ERP type: ${config.type}`)
    }
  }

  async testConnection(configName: string): Promise<boolean> {
    const config = await this.configManager.getERPConfig(configName)
    if (!config) {
      throw new Error(`ERP configuration '${configName}' not found`)
    }

    const adapter = this.createAdapter(config)
    return await adapter.testConnection()
  }

  async getCustomers(configName: string, filters?: CustomerFilters, limit = 100): Promise<Customer[]> {
    const config = await this.configManager.getERPConfig(configName)
    if (!config) {
      throw new Error(`ERP configuration '${configName}' not found`)
    }

    let adapter = this.adapters.get(configName)
    if (!adapter) {
      adapter = this.createAdapter(config)
      this.adapters.set(configName, adapter)
    }

    return await adapter.getCustomers(filters, limit)
  }
}