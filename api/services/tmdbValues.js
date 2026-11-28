// Validation of TMDB rating values, shared by the import of new movies (tmdbMovies.js) and the
// manual sync command (movieDetailsSync.js), so both accept exactly the same values.
// Each function returns the value in the format of our movies table, or null when it is invalid.

// movies.tmdb_vote_average NUMERIC(3, 1), CHECK 0..10: rounded to one decimal.
export const voteAverage = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10
    ? Math.round(value * 10) / 10
    : null

// movies.tmdb_vote_count INTEGER, CHECK >= 0.
export const voteCount = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null
