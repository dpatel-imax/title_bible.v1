const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const TMDB_API_KEY = '748c3731cffe441f6d75e4711d940d54'; // Replace with your actual API key

app.get('/api/movies', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc`
    );
    res.json(response.data);
  } catch (error) {
    console.error(error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch movies', details: error.response ? error.response.data : error.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
