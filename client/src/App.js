import React, { useState, useEffect } from 'react';
import './App.css';

// Placeholder IMAX logo URL (replace with a real one if available)
const imaxLogo = 'https://1000logos.net/wp-content/uploads/2021/05/IMAX-logo.png';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w200';
const PLACEHOLDER_POSTER = 'https://via.placeholder.com/100x150?text=No+Image';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function groupMoviesByMonth(movies) {
  const filtered = movies.filter(m => m.release_date);
  filtered.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
  const groups = {};
  filtered.forEach(movie => {
    const date = new Date(movie.release_date);
    const month = date.toLocaleString('default', { month: 'long' });
    if (!groups[month]) groups[month] = [];
    groups[month].push(movie);
  });
  return groups;
}

function App() {
  const [activeTab, setActiveTab] = useState('titles');
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [yearInput, setYearInput] = useState('');

  useEffect(() => {
    if (activeTab === 'titles') {
      setLoading(true);
      setError(null);
      fetch(`http://localhost:5000/api/movies?year=${selectedYear}`)
        .then((res) => res.json())
        .then((data) => {
          setMovies(data.results || []);
          setLoading(false);
        })
        .catch((err) => {
          setError('Failed to fetch movies');
          setLoading(false);
        });
    }
  }, [activeTab, selectedYear]);

  // Only allow navigation between years 2000 and 2100
  const minYear = 2000;
  const maxYear = 2100;

  const handleArrow = (dir) => {
    if (dir === 'left' && selectedYear > minYear) setSelectedYear(selectedYear - 1);
    if (dir === 'right' && selectedYear < maxYear) setSelectedYear(selectedYear + 1);
  };

  const handleYearInput = (e) => {
    setYearInput(e.target.value);
  };

  const handleYearInputSubmit = (e) => {
    e.preventDefault();
    const y = parseInt(yearInput, 10);
    if (y >= minYear && y <= maxYear) setSelectedYear(y);
    setYearInput('');
  };

  const grouped = groupMoviesByMonth(movies);

  return (
    <div className="App">
      <header className="App-header">
        <img src={imaxLogo} className="IMAX-logo" alt="IMAX logo" />
        <div className="Tabs">
          <button
            className={activeTab === 'titles' ? 'active' : ''}
            onClick={() => setActiveTab('titles')}
          >
            Titles
          </button>
          <button
            className={activeTab === 'calendar' ? 'active' : ''}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar
          </button>
        </div>
      </header>
      <main>
        {activeTab === 'titles' ? (
          <div>
            <div className="year-nav">
              <button onClick={() => handleArrow('left')} disabled={selectedYear <= minYear}>&lt;</button>
              <span className="selected-year">{selectedYear}</span>
              <button onClick={() => handleArrow('right')} disabled={selectedYear >= maxYear}>&gt;</button>
              <form onSubmit={handleYearInputSubmit} className="year-input-form">
                <input
                  type="number"
                  min={minYear}
                  max={maxYear}
                  value={yearInput}
                  onChange={handleYearInput}
                  placeholder="Go to year"
                  className="year-input"
                />
                <button type="submit">Go</button>
              </form>
            </div>
            {loading && <div>Loading movies...</div>}
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {!loading && !error && movies.length > 0 && (
              <div>
                {MONTHS.filter(month => grouped[month]).map((month) => (
                  <div key={month} style={{ marginBottom: '2rem' }}>
                    <h2>{month} {selectedYear}</h2>
                    <div className="movie-list">
                      {grouped[month].map((movie) => (
                        <div className="movie-card" key={movie.id}>
                          <img
                            src={movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : PLACEHOLDER_POSTER}
                            alt={movie.title}
                            className="movie-poster"
                          />
                          <div className="movie-info">
                            <div className="movie-title">{movie.title}</div>
                            <div className="movie-date">{movie.release_date}</div>
                            {movie.revenue !== undefined && movie.revenue > 0 && (
                              <div className="movie-revenue">Box Office: ${movie.revenue.toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && !error && movies.length === 0 && (
              <div>No movies found for {selectedYear}.</div>
            )}
          </div>
        ) : (
          <div>Calendar content goes here</div>
        )}
      </main>
    </div>
  );
}

export default App;
