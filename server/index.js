require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

const omdbCache = {};

// In-memory cache for TMDB movie data
const movieCache = {}; // { '2025': { data: [...], lastUpdated: Date } }
const CACHE_TTL_HOURS = 24;

// Track if we've done daily update today
let lastDailyUpdate = null;
const DAILY_UPDATE_HOUR = 2; // 2 AM

async function fetchMoviesForYear(year) {
  let allResults = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  // Use 7 pages for current year, 5 for others
  const totalPages = (year === currentYear) ? 7 : 5;
  for (let page = 1; page <= totalPages; page++) {
    const response = await axios.get(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&primary_release_year=${year}&sort_by=popularity.desc&page=${page}`
    );
    allResults = allResults.concat(response.data.results);
  }
  return allResults;
}

async function fetchAndCacheMoviesForYear(year) {
  const data = await fetchMoviesForYear(year);
  movieCache[year] = {
    data,
    lastUpdated: new Date()
  };
  return data;
}

// Nightly refresh at 2am server time (backup in case server stays awake)
cron.schedule('0 2 * * *', async () => {
  await performDailyUpdate();
});

// Function to perform daily update
async function performDailyUpdate() {
  const today = new Date();
  const todayDate = today.toDateString();
  
  // Check if we've already done daily update today
  if (lastDailyUpdate === todayDate) {
    return;
  }
  
  console.log('Performing daily update for current year movies...');
  lastDailyUpdate = todayDate;
  
  const currentYear = today.getFullYear();
  
  try {
    // Refresh movie list for current year
    const movies = await fetchAndCacheMoviesForYear(currentYear);
    
    // Update revenue and IMDb data for all released movies
    const released = movies.filter(m => m.release_date && new Date(m.release_date) <= today);
    for (const movie of released) {
      try {
        const revenue = await fetchMovieRevenue(movie.id);
        movie.revenue = revenue;
      } catch (e) {
        movie.revenue = 0;
      }
    }
    
    // Fetch IMDb data for all movies (released and upcoming) within 30 days of release
    const allMovies = movies.filter(m => m.release_date);
    for (const movie of allMovies) {
      const releaseDate = new Date(movie.release_date);
      const daysSinceRelease = (today - releaseDate) / (1000 * 60 * 60 * 24);
      
      // Pre-fetch IMDb data for movies within 30 days of release (past or future)
      if (Math.abs(daysSinceRelease) <= 30) {
        try {
          let cacheKey = `${movie.title}_${releaseDate.getFullYear()}`;
          let omdbUrl;
          
          // Special case for Fantastic Four: First Steps - use OMDb for all data
          if (movie.title.toLowerCase().includes('fantastic four') && movie.title.toLowerCase().includes('first steps')) {
            omdbUrl = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=Fantastic%20Four%3A%20First%20Steps&y=${releaseDate.getFullYear()}`;
            cacheKey = `Fantastic Four: First Steps_${releaseDate.getFullYear()}`; // Use OMDb title format for cache key
            console.log(`Special case: Pre-fetching all data for Fantastic Four from OMDb`);
          } else {
            omdbUrl = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(movie.title)}&y=${releaseDate.getFullYear()}`;
          }
          
          if (!omdbCache[cacheKey]) {
            
            const omdbResponse = await axios.get(omdbUrl);
            if (omdbResponse.data.Response === 'True') {
              omdbCache[cacheKey] = omdbResponse.data;
              console.log(`Pre-fetched IMDb data for ${movie.title} (${daysSinceRelease.toFixed(1)} days ${daysSinceRelease > 0 ? 'since' : 'until'} release)`);
            }
          }
        } catch (e) {
          console.log(`Failed to pre-fetch IMDb data for ${movie.title}:`, e.message);
        }
      }
    }
    
    // Update cache with new revenue data
    movieCache[currentYear].data = movies;
    console.log(`Daily update completed: Updated box office and IMDb data for released movies in ${currentYear}`);
  } catch (e) {
    console.error('Failed to perform daily update:', e.message);
  }
}

async function fetchMovieRevenue(movieId) {
  const response = await axios.get(
    `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}`
  );
  return response.data.revenue || 0;
}

app.get('/api/movies', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const today = new Date();
    
    // Trigger daily update on first request of the day for current year
    if (year === currentYear) {
      await performDailyUpdate();
    }
    
    // Serve from cache if available and fresh
    const cacheEntry = movieCache[year];
    let movies;
    if (cacheEntry && (new Date() - new Date(cacheEntry.lastUpdated)) < CACHE_TTL_HOURS * 60 * 60 * 1000) {
      movies = cacheEntry.data;
    } else {
      movies = await fetchAndCacheMoviesForYear(year);
    }

    // Minimal deduplication by id
    function deduplicateById(movieArray) {
      const seen = new Set();
      return movieArray.filter(movie => {
        if (seen.has(movie.id)) return false;
        seen.add(movie.id);
        return true;
      });
    }

    if (year > currentYear) {
      // Future year: return all movies, sorted by release date
      movies = movies.filter(m => m.release_date);
      movies = deduplicateById(movies);
      movies.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
      res.json({ results: movies });
    } else if (year === currentYear) {
      // Current year: split into released and upcoming
      const released = movies.filter(m => m.release_date && new Date(m.release_date) <= today);
      const upcoming = movies.filter(m => m.release_date && new Date(m.release_date) > today);
      // Deduplicate
      const dedupedReleased = deduplicateById(released);
      const dedupedUpcoming = deduplicateById(upcoming);
      // Fetch revenue for released
      const withRevenue = await Promise.all(
        dedupedReleased.map(async (movie) => {
          try {
            const revenue = await fetchMovieRevenue(movie.id);
            return { ...movie, revenue };
          } catch {
            return { ...movie, revenue: 0 };
          }
        })
      );
      const topGrossing = withRevenue
        .filter(m => m.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
      // Sort upcoming by release date
      dedupedUpcoming.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
      res.json({ released: topGrossing, upcoming: dedupedUpcoming });
    } else {
      // Past year: fetch revenue and return top 15 grossing
      movies = deduplicateById(movies);
      const withRevenue = await Promise.all(
        movies.map(async (movie) => {
          try {
            const revenue = await fetchMovieRevenue(movie.id);
            return { ...movie, revenue };
          } catch {
            return { ...movie, revenue: 0 };
          }
        })
      );
      const topGrossing = withRevenue
        .filter(m => m.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
      res.json({ results: topGrossing });
    }
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch movies', details: error.response ? error.response.data : error.message });
  }
});

app.get('/api/genres', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch genres', details: error.response ? error.response.data : error.message });
  }
});

app.get('/api/omdb-rating', async (req, res) => {
  try {
    const { imdb_id, title, year } = req.query;
    let cacheKey = imdb_id || `${title}_${year}`;
    
    // Special cache key for Fantastic Four to handle title mismatch
    if (title && title.toLowerCase().includes('fantastic four') && title.toLowerCase().includes('first steps')) {
      cacheKey = `Fantastic Four: First Steps_${year}`;
    }
    
    if (omdbCache[cacheKey]) {
      return res.json(omdbCache[cacheKey]);
    }
    let url;
    if (imdb_id) {
      url = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdb_id}`;
    } else if (title) {
      // Special case for Fantastic Four: First Steps
      if (title.toLowerCase().includes('fantastic four') && title.toLowerCase().includes('first steps')) {
        url = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=Fantastic%20Four%3A%20First%20Steps${year ? `&y=${year}` : ''}`;
        console.log(`Frontend: Using special Fantastic Four URL: ${url}`);
      } else {
        url = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}${year ? `&y=${year}` : ''}`;
      }
    } else {
      return res.status(400).json({ error: 'imdb_id or title required' });
    }
    console.log('OMDb URL:', url); // Debug log
    const response = await axios.get(url);
    const omdbData = response.data;
    
    // Cache the full response data
    omdbCache[cacheKey] = omdbData;
    
    // Return the full OMDb response
    res.json(omdbData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch OMDb data', details: error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
