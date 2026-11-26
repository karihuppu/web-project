import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import errorHandler from './middleware/errorHandler.js'
import testRouter from './routes/testRouter.js'
import movieRouter from './routes/movieRouter.js'
import genreRouter from './routes/genreRouter.js'
import authRouter from './routes/authRouter.js'
import watchlistRouter from "./routes/WatchlistRouter.js";
import groupRouter from './routes/groupRouter.js'
import { pool } from './models/db.js'

const distPath = fileURLToPath(new URL('../dist/', import.meta.url))
const indexHtmlPath = fileURLToPath(new URL('../dist/index.html', import.meta.url))

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Database API
app.use('/api/tests', testRouter)
app.use('/api/movies', movieRouter)
app.use('/api/genres', genreRouter)
app.use('/api/auth', authRouter)
app.use("/api/watchlists", watchlistRouter);
app.use('/api/groups', groupRouter)

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

// React routes (e.g. /movies/3) return index.html in production.
// Unknown /api paths and other methods fall through to the 404 handler.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/api') {
    return next()
  }
  if (!req.accepts('html')) return next()
  res.sendFile(indexHtmlPath, (error) => {
    // dist/ does not exist in local development (Vite serves the frontend).
    if (error) next()
  })
})

app.use((_req, _res, next) => {
  const error = new Error('Not found')
  error.status = 404
  next(error)
})

app.use(errorHandler)

export default app
