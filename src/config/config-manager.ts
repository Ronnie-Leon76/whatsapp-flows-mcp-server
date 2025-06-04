import { promises as fs } from "fs"
import { join } from "path"

export interface ERPCredentials {
  baseUrl: string
  username: string
  password: string
  company?: string
  apiKey?: string
  customHeaders?: Record<string, string>
}

export interface ERPConfig {
  name: string
  type: "business-central" | "sap" | "oracle" | "custom"
  credentials: ERPCredentials
  lastTested?: string
}

export class ConfigManager {
  private configPath: string

  constructor(configPath = "./config") {
    this.configPath = configPath
    this.ensureConfigDirectory()
  }

  private async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.configPath, { recursive: true })
    } catch (error) {
      // Directory might already exist
    }
  }

  async saveERPConfig(name: string, config: Omit<ERPConfig, "name">): Promise<void> {
    const configFile = join(this.configPath, `${name}.json`)
    const fullConfig: ERPConfig = {
      name,
      ...config,
      lastTested: new Date().toISOString(),
    }

    await fs.writeFile(configFile, JSON.stringify(fullConfig, null, 2))
  }

  async getERPConfig(name: string): Promise<ERPConfig | null> {
    try {
      const configFile = join(this.configPath, `${name}.json`)
      const data = await fs.readFile(configFile, "utf-8")
      return JSON.parse(data) as ERPConfig
    } catch (error) {
      return null
    }
  }

  async listERPConfigs(): Promise<ERPConfig[]> {
    try {
      const files = await fs.readdir(this.configPath)
      const configs: ERPConfig[] = []

      for (const file of files) {
        if (file.endsWith(".json")) {
          const name = file.replace(".json", "")
          const config = await this.getERPConfig(name)
          if (config) {
            configs.push(config)
          }
        }
      }

      return configs
    } catch (error) {
      return []
    }
  }

  async deleteERPConfig(name: string): Promise<boolean> {
    try {
      const configFile = join(this.configPath, `${name}.json`)
      await fs.unlink(configFile)
      return true
    } catch (error) {
      return false
    }
  }
}