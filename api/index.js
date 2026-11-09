import 'dotenv/config'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import errorHandler from './middleware/errorHandler.js'
import testRouter from './routes/testRouter.js'
import { pool } from './models/db.js'

const port = Number(process.env.PORT || 3000)
const distPath = fileURLToPath(new URL('../dist/', import.meta.url))

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Database API
app.use('/api/tests', testRouter)

// Database connectivity check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')

    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Database health check failed:', error)

    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    })
  }
})

// Built React application
app.use(express.static(distPath))

app.use((_req, _res, next) => {
  const error = new Error('Not found')
  error.status = 404
  next(error)
})

app.use(errorHandler)

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}`)
})