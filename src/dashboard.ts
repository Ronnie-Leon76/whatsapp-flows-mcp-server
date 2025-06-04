import express from "express"
import { JobManager } from "./jobs/job-manager.js"

const app = express()
const PORT = parseInt(process.env.PORT || "3001")
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"

const jobManager = new JobManager(REDIS_URL)

app.use(express.json())

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// Queue statistics
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await jobManager.getQueueStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" })
  }
})

// Get jobs by status
app.get("/api/jobs/:status", async (req, res) => {
  try {
    const { status } = req.params
    const { start = "0", end = "9" } = req.query
    
    if (!["waiting", "active", "completed", "failed", "delayed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }
    
    const jobs = await jobManager.getJobs(
      status as any,
      parseInt(start as string),
      parseInt(end as string)
    )
    
    res.json(jobs)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" })
  }
})

// Get specific job
app.get("/api/job/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params
    const job = await jobManager.getJobStatus(jobId)
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" })
    }
    
    res.json(job)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" })
  }
})

// Clean old jobs
app.post("/api/clean", async (req, res) => {
  try {
    const { maxAge = 86400000 } = req.body // Default 24 hours
    const result = await jobManager.cleanOldJobs(maxAge)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" })
  }
})

// Simple dashboard HTML
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp Flows Job Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .stats { display: flex; gap: 20px; margin-bottom: 20px; }
            .stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; min-width: 100px; }
            .stat-number { font-size: 24px; font-weight: bold; color: #333; }
            .stat-label { color: #666; font-size: 14px; }
            .jobs-section { margin-top: 30px; }
            .job-list { border: 1px solid #ddd; border-radius: 5px; }
            .job-item { padding: 10px; border-bottom: 1px solid #eee; }
            .job-item:last-child { border-bottom: none; }
            .job-id { font-family: monospace; color: #666; }
            .job-status { padding: 2px 8px; border-radius: 3px; font-size: 12px; }
            .status-waiting { background: #fff3cd; color: #856404; }
            .status-active { background: #d4edda; color: #155724; }
            .status-completed { background: #d1ecf1; color: #0c5460; }
            .status-failed { background: #f8d7da; color: #721c24; }
            .refresh-btn { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
        </style>
    </head>
    <body>
        <h1>WhatsApp Flows Job Dashboard</h1>
        
        <div class="stats" id="stats">
            <div class="stat-card">
                <div class="stat-number" id="waiting-count">-</div>
                <div class="stat-label">Waiting</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="active-count">-</div>
                <div class="stat-label">Active</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="completed-count">-</div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="failed-count">-</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="delayed-count">-</div>
                <div class="stat-label">Delayed</div>
            </div>
        </div>
        
        <button class="refresh-btn" onclick="loadData()">Refresh</button>
        
        <div class="jobs-section">
            <h2>Recent Jobs</h2>
            <div class="job-list" id="job-list">
                Loading...
            </div>
        </div>

        <script>
            async function loadData() {
                try {
                    // Load stats
                    const statsResponse = await fetch('/api/stats');
                    const stats = await statsResponse.json();
                    
                    document.getElementById('waiting-count').textContent = stats.waiting;
                    document.getElementById('active-count').textContent = stats.active;
                    document.getElementById('completed-count').textContent = stats.completed;
                    document.getElementById('failed-count').textContent = stats.failed;
                    document.getElementById('delayed-count').textContent = stats.delayed;
                    
                    // Load recent jobs (mix of active and completed)
                    const [activeJobs, completedJobs, failedJobs] = await Promise.all([
                        fetch('/api/jobs/active').then(r => r.json()),
                        fetch('/api/jobs/completed').then(r => r.json()),
                        fetch('/api/jobs/failed').then(r => r.json())
                    ]);
                    
                    const allJobs = [...activeJobs, ...completedJobs.slice(0, 5), ...failedJobs.slice(0, 5)]
                        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    
                    const jobListHtml = allJobs.map(job => \`
                        <div class="job-item">
                            <div>
                                <span class="job-status status-\${job.status}">\${job.status.toUpperCase()}</span>
                                <strong>\${job.type}</strong>
                                <span class="job-id">(\${job.id})</span>
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                Created: \${new Date(job.createdAt).toLocaleString()}
                                \${job.progress ? \`| Progress: \${job.progress}%\` : ''}
                                \${job.error ? \`| Error: \${job.error}\` : ''}
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('job-list').innerHTML = jobListHtml || '<div class="job-item">No jobs found</div>';
                    
                } catch (error) {
                    console.error('Error loading data:', error);
                    document.getElementById('job-list').innerHTML = '<div class="job-item">Error loading jobs</div>';
                }
            }
            
            // Load data on page load
            loadData();
            
            // Auto-refresh every 5 seconds
            setInterval(loadData, 5000);
        </script>
    </body>
    </html>
  `)
})

async function main() {
  await jobManager.connect()
  
  app.listen(PORT, () => {
    console.log(`Job Dashboard running on http://localhost:${PORT}`)
  })

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("Shutting down dashboard...")
    await jobManager.disconnect()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error("Dashboard error:", error)
  process.exit(1)
})