import 'dotenv/config'
import process from 'node:process'
import app from './app.js'
import { isAuthConfigured } from './config/auth.js'

const port = Number(process.env.PORT || 3000)

if (!isAuthConfigured()) {
  // The rest of the site keeps working; /api/auth answers 503 until JWT_SECRET is set.
  console.error('JWT_SECRET is missing or too short: login and registration are disabled.')
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}`)
})
