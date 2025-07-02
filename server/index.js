const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const TMDB_API_KEY = '748c3731cffe441f6d75e4711d940d54'; // Replace with your actual API key

async function fetchMoviesForYear(year) {
  let allResults = [];
  const totalPages = 5; // Limit to 5 pages (100 movies) for demo and rate limits
  for (let page = 1; page <= totalPages; page++) {
    const response = await axios.get(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&primary_release_year=${year}&sort_by=popularity.desc&page=${page}`
    );
    allResults = allResults.concat(response.data.results);
  }
  return allResults;
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
    let movies = await fetchMoviesForYear(year);

    if (year > currentYear || (year === currentYear && new Date(`${year}-12-31`) > today)) {
      // Future year: return all movies, sorted by release date
      movies = movies.filter(m => m.release_date);
      movies.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
      res.json({ results: movies });
    } else {
      // Past or current year: fetch revenue and return top 15 grossing
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

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
