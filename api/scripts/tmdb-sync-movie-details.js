// Manual command: fills posters and missing overviews from TMDB for movies already in the database.
//
//   npm run tmdb:sync-movie-details -- --dry-run                    # show changes, write nothing
//   npm run tmdb:sync-movie-details                                  # local database
//   npm run tmdb:sync-movie-details -- --confirm=cinema_db           # non-local database (Azure)
//   npm run tmdb:sync-movie-details -- --dry-run --only=603,27205    # only these tmdb ids
//
// Needs TMDB_READ_TOKEN (TMDB "API Read Access Token") and the DB_* variables in the environment.
import process from 'node:process'
import pkg from 'pg'
import { getConfig, describeTarget, requireConfirmation } from '../db/connection.js'
import { createTmdbClient } from '../services/tmdbClient.js'
import { syncMovieDetails } from '../services/movieDetailsSync.js'

const { Client } = pkg

const main = async () => {
  const flags = process.argv.slice(2)
  const known = (flag) => flag === '--dry-run' || flag.startsWith('--confirm=') || flag.startsWith('--only=')
  const unknown = flags.filter((flag) => !known(flag))
  if (unknown.length) {
    throw new Error(`Unknown option(s): ${unknown.join(' ')}. Use --dry-run, --confirm=<DB_NAME>, --only=<tmdb ids>`)
  }

  const dryRun = flags.includes('--dry-run')
  const onlyFlag = flags.find((flag) => flag.startsWith('--only='))
  const onlyTmdbIds = onlyFlag
    ? onlyFlag.slice('--only='.length).split(',').map((v) => Number(v.trim()))
    : null
  if (onlyTmdbIds && onlyTmdbIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('--only expects comma-separated TMDB ids, e.g. --only=603,27205')
  }

  const config = getConfig('cinema-tmdb-sync')
  console.log(describeTarget(config))
  console.log(`Database: ${config.database}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (nothing is written)' : 'WRITE'}`)
  if (!dryRun) requireConfirmation(config, flags)

  const tmdb = createTmdbClient({ token: process.env.TMDB_READ_TOKEN })

  const db = new Client(config)
  await db.connect()
  try {
    const summary = await syncMovieDetails({ db, tmdb, dryRun, onlyTmdbIds })
    console.log(
      `\n${summary.checked} checked: ${summary.updated} ${dryRun ? 'would be updated' : 'updated'}, ` +
      `${summary.unchanged} unchanged (skipped), ${summary.errors} errors`,
    )
    if (summary.errors > 0) process.exitCode = 1
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`)
  process.exitCode = 1
})
