import React, { useState, useEffect, useRef, useMemo } from 'react';
import Select from 'react-select';
import './App.css';

const imaxLogo = 'https://1000logos.net/wp-content/uploads/2021/05/IMAX-logo.png';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w200';
const PLACEHOLDER_POSTER = 'https://via.placeholder.com/100x150?text=No+Image';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const MAJOR_MOVIE_RUN_DAYS = 14;
const MAJOR_MOVIE_COUNT = 5;
const MOVIE_COLORS = [
  '#00bcd4', '#ff9800', '#8bc34a', '#e91e63', '#3f51b5', '#ff5722', '#9c27b0', '#607d8b', '#cddc39', '#f44336'
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

function getIMAXMovies(movies) {
  // For demo, treat all movies as IMAX if they have 'IMAX' in title or use a custom field if available
  return movies.filter(m => (m.title && m.title.toLowerCase().includes('imax')) || m.imax === true);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

function getMajorMoviesWithColors(movies, year, month) {
  const now = new Date();
  const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
  // Only movies released in this month/year
  const monthMovies = movies.filter(m => {
    const d = new Date(m.release_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  let sorted;
  if (isFuture) {
    sorted = monthMovies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } else {
    sorted = monthMovies.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  }
  // Assign a color to each movie (cycle through palette)
  return sorted.slice(0, MAJOR_MOVIE_COUNT).map((movie, idx) => ({ ...movie, color: MOVIE_COLORS[idx % MOVIE_COLORS.length] }));
}

function getContinuingMovies(movies, year, month) {
  // Find movies whose run started in the previous month and continues into this month
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const majorPrev = getMajorMoviesWithColors(movies, prevYear, prevMonth);
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
  return majorPrev.filter(movie => {
    const start = new Date(movie.release_date);
    const runEnd = new Date(start);
    runEnd.setDate(start.getDate() + MAJOR_MOVIE_RUN_DAYS - 1);
    // If runEnd is in this month/year and after the 1st
    return (
      runEnd.getFullYear() === year && runEnd.getMonth() === month && runEnd.getDate() >= 1
    );
  });
}

// Helper: get movies array for current year or other years
function getMoviesArray(movies, selectedYear) {
  if (selectedYear === new Date().getFullYear()) {
    // For current year, combine released and upcoming for month grouping, or use as needed
    if (!movies) return [];
    if (Array.isArray(movies)) return movies;
    // For grouping by month, combine both
    return [...(movies.released || []), ...(movies.upcoming || [])];
  }
  return Array.isArray(movies) ? movies : [];
}

function getTitlesTabMoviesByMonth(movies, year) {
  if (!Array.isArray(movies)) {
    movies = movies && Array.isArray(movies.results) ? movies.results : [];
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  // Group movies by month
  const grouped = {};
  for (let m = 0; m < 12; m++) {
    // Only movies released in this month/year
    const monthMovies = movies.filter(movie => {
      if (!movie.release_date) return false;
      const d = new Date(movie.release_date);
      return d.getFullYear() === year && d.getMonth() === m;
    });
    let sorted;
    if (year < currentYear || (year === currentYear && m < currentMonth)) {
      // Past months: top 15 by revenue
      sorted = monthMovies
        .filter(mov => mov.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
    } else {
      // Current/future months: show all movies sorted by release date
      sorted = monthMovies
        .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
    }
    if (sorted.length > 0) grouped[m] = sorted;
  }
  return grouped;
}

function App() {
  const [activeTab, setActiveTab] = useState('titles');
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [yearInput, setYearInput] = useState('');
  const [genres, setGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]); // Multi-select
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searchedMovie, setSearchedMovie] = useState(null);
  const [searchYear, setSearchYear] = useState(null); // Track year of searched movie
  const searchInputRef = useRef(null);
  const [ratings, setRatings] = useState({});

  // Add state for movie detail popup
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Function to fetch movie details from OMDb
  const fetchMovieDetails = async (movie) => {
    
    setLoadingDetails(true);
    try {
      // Special case for Fantastic Four: First Steps - use OMDb title format
      let title = movie.title;
      if (title.includes("Fantastic")) {
        title = 'Fantastic Four: First Steps';
      }
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'https://title-bible.onrender.com'}/api/omdb-rating?title=${encodeURIComponent(title)}&year=${new Date(movie.release_date).getFullYear()}`);
      const data = await response.json();
      
      // Handle both old format and new full OMDb response format
      setMovieDetails({
        
        title: movie.title,
        year: new Date(movie.release_date).getFullYear(),
        imdbRating: data.imdbRating || null,
        plot: data.Plot || movie.overview || 'Plot not available',
        cast: data.Actors || 'Cast information not available',
        writer: data.Writer || 'Writer information not available',
        genre: data.Genre || 'Genre not available',
        director: data.Director || 'Director information not available',
        runtime: data.Runtime || 'Runtime not available',
        awards: data.Awards || 'Awards information not available'
      });
      
    } catch (error) {
      console.error('Error fetching movie details:', error);
      setMovieDetails({
        title: movie.title,
        year: new Date(movie.release_date).getFullYear(),
        plot: movie.overview || 'Plot not available',
        cast: 'Cast information not available',
        writer: 'Writer information not available',
        genre: 'Genre not available',
        director: 'Director information not available',
        runtime: 'Runtime not available',
        awards: 'Awards information not available'
      });
    }
    setLoadingDetails(false);
  };

  // Function to handle movie click
  const handleMovieClick = (movie) => {
    setSelectedMovie(movie);
    fetchMovieDetails(movie);
  };

  // Function to close movie details popup
  const closeMovieDetails = () => {
    setSelectedMovie(null);
    setMovieDetails(null);
  };

  // Calendar tab state
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const [calendarView, setCalendarView] = useState('month'); // 'month' or 'week'
  const [calendarMonth, setCalendarMonth] = useState(currentMonth);
  const [calendarYear, setCalendarYear] = useState(currentYear);
  const [imaxMovies, setIMAXMovies] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarWeekStart, setCalendarWeekStart] = useState(null); // for week view
  // Handler for opening month/year picker
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const openMonthPicker = () => {
    setPickerYear(calendarYear);
    setShowMonthPicker(true);
  };
  const closeMonthPicker = () => setShowMonthPicker(false);
  const handlePickerYearChange = (dir) => setPickerYear(y => y + dir);
  const handlePickerMonthClick = (monthIdx) => {
    setCalendarYear(pickerYear);
    setCalendarMonth(monthIdx);
    setShowMonthPicker(false);
  };

  // Compute week label for week view
  const weekLabel = useMemo(() => {
    let weekStart = calendarWeekStart;
    if (!weekStart) {
      // Default to current week in current month
      const today = new Date();
      if (today.getFullYear() === calendarYear && today.getMonth() === calendarMonth) {
        weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
      } else {
        weekStart = new Date(calendarYear, calendarMonth, 1);
      }
    }
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDays.push(d);
    }
    return `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`;
  }, [calendarWeekStart, calendarMonth, calendarYear]);

  // Fetch genres on mount
  useEffect(() => {
    fetch('https://title-bible.onrender.com/api/genres')
      .then(res => res.json())
      .then(data => setGenres(data.genres || []));
  }, []);

  // Fetch movies for selected year
  useEffect(() => {
    if (activeTab === 'titles') {
      setLoading(true);
      setError(null);
      fetch(`https://title-bible.onrender.com/api/movies?year=${selectedYear}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.results) {
            setMovies(data.results);
          } else if (data.released || data.upcoming) {
            setMovies({ released: data.released || [], upcoming: data.upcoming || [] });
          } else {
            setMovies([]);
          }
          setLoading(false);
        })
        .catch((err) => {
          setError('Failed to fetch movies');
          setLoading(false);
        });
    }
  }, [activeTab, selectedYear]);

  // Fetch IMAX movies for calendar tab
  useEffect(() => {
    if (activeTab === 'calendar') {
      setCalendarLoading(true);
      fetch(`https://title-bible.onrender.com/api/movies?year=${calendarYear}`)
        .then(res => res.json())
        .then(data => {
          if (data.results) {
            setIMAXMovies(data.results);
          } else if (data.released || data.upcoming) {
            setIMAXMovies([...(data.released || []), ...(data.upcoming || [])]);
          } else {
            setIMAXMovies([]);
          }
          setCalendarLoading(false);
        })
        .catch(() => setCalendarLoading(false));
    }
  }, [activeTab, calendarYear]);

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

  // react-select expects options as { value, label }
  const genreOptions = genres.map(g => ({ value: g.id, label: g.name }));

  // Multi-select genre filter handler
  const handleGenreSelect = (selected) => {
    setSelectedGenres(selected ? selected.map(opt => opt.value) : []);
  };

  // Filter movies by selected genres (if any selected)
  const filteredMovies = useMemo(() => {
    if (selectedGenres.length === 0) {
      return getMoviesArray(movies, selectedYear);
    }
    return getMoviesArray(movies, selectedYear).filter((movie) =>
      selectedGenres.every((gid) => (movie.genre_ids || []).includes(gid))
    );
  }, [movies, selectedYear, selectedGenres]);

  // Search bar logic (search only within filteredMovies for the current year)
  useEffect(() => {
    if (searchTerm.length > 0) {
      const results = filteredMovies.filter(movie =>
        movie.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setSearchResults(results.slice(0, 8)); // Show up to 8 suggestions
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, filteredMovies]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSearchActive(true);
  };

  const handleSearchSelect = (movie) => {
    setSearchedMovie(movie);
    setSearchYear(new Date(movie.release_date).getFullYear());
    setSearchTerm(movie.title);
    setSearchActive(false);
    setTimeout(() => {
      if (searchInputRef.current) searchInputRef.current.blur();
    }, 100);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSearchSelect(searchResults[0]);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchedMovie(null);
    setSearchActive(false);
    if (searchYear !== null) {
      setSelectedYear(searchYear);
      setSearchYear(null);
    }
  };

  // If a movie is searched, only show that movie
  const moviesToShow = searchedMovie
    ? [searchedMovie]
    : filteredMovies;

  const grouped = groupMoviesByMonth(getMoviesArray(moviesToShow, selectedYear));

  const titlesTabGrouped = useMemo(() => {
    return getTitlesTabMoviesByMonth(getMoviesArray(movies, selectedYear), selectedYear);
  }, [movies, selectedYear]);

  // Update the ratings fetching to handle the new OMDb response format
  useEffect(() => {
    if (activeTab === 'titles') {
      const moviesForRatings = Array.isArray(moviesToShow) ? moviesToShow : [];
      moviesForRatings.forEach(movie => {
        if (movie && movie.id && ratings[movie.id] === undefined && movie.title && movie.release_date) {
          // Special case for Fantastic Four: First Steps - use OMDb title format
          let title = movie.title;
          if (title.includes('Fantastic')) {
            title = 'Fantastic Four: First Steps';
          }
          
          fetch(`${process.env.REACT_APP_BACKEND_URL || 'https://title-bible.onrender.com'}/api/omdb-rating?title=${encodeURIComponent(title)}&year=${new Date(movie.release_date).getFullYear()}`)
            .then(res => res.json())
            .then(data => {
              // Handle both old format (data.imdbRating) and new format (data.imdbRating from full response)
              const rating = data.imdbRating || 'N/A';
              setRatings(r => ({ ...r, [movie.id]: rating }));
            })
            .catch(() => {
              setRatings(r => ({ ...r, [movie.id]: 'N/A' }));
            });
        }
      });
    }
  }, [moviesToShow, activeTab]);

  // Calendar tab handlers
  const handleCalendarView = (view) => setCalendarView(view);
  const handleCalendarMonthChange = (dir) => {
    if (dir === 'left') {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear(calendarYear - 1);
      } else {
        setCalendarMonth(calendarMonth - 1);
      }
    } else if (dir === 'right') {
      if (calendarMonth === 11) {
        setCalendarMonth(0);
        setCalendarYear(calendarYear + 1);
      } else {
        setCalendarMonth(calendarMonth + 1);
      }
    }
  };

  // Build calendar grid for month view
  function renderCalendarMonth() {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
    // Build a 6-row calendar grid
    const weeks = [];
    let day = 1 - firstDay;
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++, day++) {
        if (day < 1 || day > daysInMonth) {
          week.push(null);
        } else {
          week.push(day);
        }
      }
      weeks.push(week);
    }
    // Get top 5 major movies for this month
    const majorMovies = getMajorMoviesWithColors(getMoviesArray(imaxMovies, calendarYear), calendarYear, calendarMonth);
    // Map major movies to their run days
    const majorMap = {};
    majorMovies.forEach(movie => {
      const start = new Date(movie.release_date);
      for (let i = 0; i < MAJOR_MOVIE_RUN_DAYS; i++) {
        const dayNum = start.getDate() + i;
        if (dayNum > daysInMonth) break;
        if (!majorMap[dayNum]) majorMap[dayNum] = [];
        majorMap[dayNum].push({
          ...movie,
          isFirst: i === 0,
          color: movie.color
        });
      }
    });
    // Add continuing movies from previous month
    const continuingMovies = getContinuingMovies(getMoviesArray(imaxMovies, calendarYear), calendarYear, calendarMonth);
    continuingMovies.forEach((movie) => {
      const start = new Date(movie.release_date);
      const runEnd = new Date(start);
      runEnd.setDate(start.getDate() + MAJOR_MOVIE_RUN_DAYS - 1);
      // The first day in this month the movie is still running
      const firstDay = 1;
      const lastDay = Math.min(runEnd.getDate(), daysInMonth);
      for (let dayNum = firstDay; dayNum <= lastDay; dayNum++) {
        if (!majorMap[dayNum]) majorMap[dayNum] = [];
        majorMap[dayNum].push({
          ...movie,
          isFirst: dayNum === 1, // reprint name on first day of new month
          color: movie.color
        });
      }
    });
    // Render calendar
    return (
      <table className="calendar-table">
        <thead>
          <tr>
            <th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((dayNum, di) => (
                <td key={di} className={majorMap[dayNum] ? 'imax-day' : ''}>
                  {dayNum && (
                    <div className="calendar-day">
                      <div className="calendar-date">{dayNum}</div>
                      {majorMap[dayNum] && majorMap[dayNum].map((movie, mi) => (
                        <div
                          key={movie.id}
                          className={movie.isFirst ? 'imax-movie imax-movie-first' : 'imax-movie'}
                          style={{ background: movie.color }}
                        >
                          {movie.isFirst ? movie.title : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Build week view (current week of calendarMonth)
  function renderCalendarWeek() {
    // Determine week start
    let weekStart = calendarWeekStart;
    if (!weekStart) {
      // Default to current week in current month
      const today = new Date();
      if (today.getFullYear() === calendarYear && today.getMonth() === calendarMonth) {
        weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
      } else {
        weekStart = new Date(calendarYear, calendarMonth, 1);
      }
    }
    // Build week days
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDays.push(d);
    }
    // Get up to 5 major movies for this month, assign colors
    const majorMovies = getMajorMoviesWithColors(getMoviesArray(imaxMovies, calendarYear), calendarYear, calendarMonth);
    // Map major movies to their run days
    const majorMap = {};
    majorMovies.forEach((movie, colorIdx) => {
      const start = new Date(movie.release_date);
      for (let i = 0; i < MAJOR_MOVIE_RUN_DAYS; i++) {
        const dayNum = start.getDate() + i;
        if (!majorMap[dayNum]) majorMap[dayNum] = [];
        majorMap[dayNum].push({
          ...movie,
          isFirst: i === 0,
          color: movie.color
        });
      }
    });
    return (
      <table className="calendar-table">
        <thead>
          <tr>
            <th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {weekDays.map((d, i) => {
              const dayNum = d.getMonth() === calendarMonth ? d.getDate() : null;
              return (
                <td key={i} className={majorMap[dayNum] ? 'imax-day' : ''}>
                  {dayNum && (
                    <div className="calendar-day">
                      <div className="calendar-date">{dayNum}</div>
                      {majorMap[dayNum] && majorMap[dayNum].map((movie, mi) => (
                        <div
                          key={movie.id}
                          className={movie.isFirst ? 'imax-movie imax-movie-first' : 'imax-movie'}
                        >
                          {movie.isFirst ? movie.title : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    );
  }

  // Calendar week navigation
  const handleCalendarWeekChange = (dir) => {
    let weekStart = calendarWeekStart;
    if (!weekStart) {
      weekStart = new Date(calendarYear, calendarMonth, 1);
    }
    if (dir === 'left') {
      weekStart.setDate(weekStart.getDate() - 7);
    } else if (dir === 'right') {
      weekStart.setDate(weekStart.getDate() + 7);
    }
    setCalendarWeekStart(new Date(weekStart));
  };

  // When switching to month view, reset week start and week label
  useEffect(() => {
    if (calendarView === 'month') {
      setCalendarWeekStart(null);
    }
  }, [calendarView]);

  // When changing month/year, reset week start and week label
  useEffect(() => {
    setCalendarWeekStart(null);
  }, [calendarMonth, calendarYear]);

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
      {/* Search Bar */}
      {activeTab === 'titles' && (
        <div className="titles-header">
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
          <div className="search-bar-container search-bar-centered">
            <form onSubmit={handleSearchSubmit} className="search-bar-form">
              <input
                type="text"
                placeholder="Search movie title..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-bar-input"
                ref={searchInputRef}
                autoComplete="off"
              />
              {searchTerm && (
                <button type="button" className="clear-search-btn" onClick={handleClearSearch}>&times;</button>
              )}
              {searchActive && searchResults.length > 0 && (
                <ul className="search-suggestions">
                  {searchResults.map(movie => (
                    <li key={movie.id} onClick={() => handleSearchSelect(movie)}>
                      {movie.title} <span style={{color:'#888',fontSize:'0.9em'}}>({new Date(movie.release_date).getFullYear()})</span>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </div>
        </div>
      )}
      <main>
        {activeTab === 'titles' ? (
          <div>
            {/* Genre Filter */}
            <div className="genre-filter" style={{ maxWidth: 400, margin: '0 auto 1.5rem auto' }}>
              <Select
                isMulti
                options={genreOptions}
                value={genreOptions.filter(opt => selectedGenres.includes(opt.value))}
                onChange={handleGenreSelect}
                placeholder="Filter by genre(s)..."
                classNamePrefix="react-select"
              />
            </div>
            {loading && <div>Loading movies...</div>}
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {(!loading && !error && (
              searchedMovie ? true : (Array.isArray(movies) ? movies.length > 0 : (movies.released && movies.released.length > 0) || (movies.upcoming && movies.upcoming.length > 0))
            )) && (
              <div>
                {searchedMovie ? (
                  <div className="movie-list">
                    <div className="movie-card" key={searchedMovie.id} onClick={() => handleMovieClick(searchedMovie)} style={{ cursor: 'pointer' }}>
                      <img
                        src={searchedMovie.poster_path ? `${TMDB_IMAGE_BASE}${searchedMovie.poster_path}` : PLACEHOLDER_POSTER}
                        alt={searchedMovie.title}
                        className="movie-poster"
                      />
                      <div className="movie-info">
                        <div className="movie-title">{searchedMovie.title}</div>
                        <div className="movie-date">{searchedMovie.release_date}</div>
                        {new Date(searchedMovie.release_date) <= new Date() ? (
                          searchedMovie.revenue > 0 && <div className="movie-revenue">Box Office: ${searchedMovie.revenue.toLocaleString()}</div>
                        ) : null}
                        {new Date(searchedMovie.release_date) <= new Date() ? (
                          <div className="movie-rating">
                            IMDb Rating:<br/>
                            {ratings[searchedMovie.id] && ratings[searchedMovie.id] !== 'N/A' ? `${ratings[searchedMovie.id]}/10` : 'N/A'}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  MONTHS.map((month, idx) => (
                    titlesTabGrouped[idx] ? (
                      <div key={month} style={{ marginBottom: '2rem' }}>
                        <h2>{month} {selectedYear}</h2>
                        <div className="movie-list">
                          {titlesTabGrouped[idx].map((movie) => {
                            const isReleased = new Date(movie.release_date) <= new Date();
                            return (
                              <div className="movie-card" key={movie.id} onClick={() => handleMovieClick(movie)} style={{ cursor: 'pointer' }}>
                                <img
                                  src={movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : PLACEHOLDER_POSTER}
                                  alt={movie.title}
                                  className="movie-poster"
                                />
                                <div className="movie-info">
                                  <div className="movie-title">{movie.title}</div>
                                  <div className="movie-date">{movie.release_date}</div>
                                  {isReleased && movie.revenue > 0 && <div className="movie-revenue">Box Office: ${movie.revenue.toLocaleString()}</div>}
                                  {isReleased && <div className="movie-rating">IMDb Rating:<br/>{ratings[movie.id] && ratings[movie.id] !== 'N/A' ? `${ratings[movie.id]}/10` : 'N/A'}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null
                  ))
                )}
              </div>
            )}
            {(!loading && !error &&
              (
                (Array.isArray(movies) && movies.length === 0) ||
                (movies.released && movies.released.length === 0 && movies.upcoming && movies.upcoming.length === 0)
              ) &&
              // Only show for past years or current year, not for future years
              selectedYear <= new Date().getFullYear()
            ) && (
              <div>No movies found for {selectedYear}.</div>
            )}
          </div>
        ) : (
          <div>
            <div className="calendar-controls">
              <button
                className={calendarView === 'month' ? 'active' : ''}
                onClick={() => handleCalendarView('month')}
              >
                Month
              </button>
              <button
                className={calendarView === 'week' ? 'active' : ''}
                onClick={() => handleCalendarView('week')}
              >
                Week
              </button>
              <span className="calendar-month-label">
                <button onClick={() => calendarView === 'week' ? handleCalendarWeekChange('left') : handleCalendarMonthChange('left')}>&lt;</button>
                {calendarView === 'month' ? (
                  <button className="month-picker-btn" onClick={openMonthPicker}>
                    {MONTHS[calendarMonth]} {calendarYear}
                  </button>
                ) : weekLabel}
                <button onClick={() => calendarView === 'week' ? handleCalendarWeekChange('right') : handleCalendarMonthChange('right')}>&gt;</button>
              </span>
            </div>
            {showMonthPicker && (
              <div className="month-picker-modal-overlay" onClick={closeMonthPicker}>
                <div className="month-picker-modal" onClick={e => e.stopPropagation()}>
                  <div className="month-picker-modal-header">
                    <button className="month-picker-arrow" onClick={() => handlePickerYearChange(-1)}>&lt;</button>
                    <span className="month-picker-modal-year">{pickerYear}</span>
                    <button className="month-picker-arrow" onClick={() => handlePickerYearChange(1)}>&gt;</button>
                  </div>
                  <div className="month-picker-modal-grid">
                    {MONTH_ABBR.map((abbr, idx) => (
                      <button
                        key={abbr}
                        className={
                          idx === calendarMonth && pickerYear === calendarYear
                            ? 'month-picker-modal-month active'
                            : 'month-picker-modal-month'
                        }
                        onClick={() => handlePickerMonthClick(idx)}
                      >
                        {abbr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {calendarLoading ? (
              <div>Loading major movies...</div>
            ) : (
              <div className="calendar-wrapper">
                {calendarView === 'month' ? renderCalendarMonth() : renderCalendarWeek()}
              </div>
            )}
          </div>
        )}
      </main>
      {selectedMovie && (
        <div className="movie-details-modal-overlay" onClick={closeMovieDetails}>
          <div className="movie-details-modal" onClick={e => e.stopPropagation()}>
            <button onClick={closeMovieDetails} className="movie-details-close-btn">&times;</button>
            {loadingDetails ? (
              <div className="movie-details-loading">Loading movie details...</div>
            ) : movieDetails ? (
              <div className="movie-details-content">
                <h2>{movieDetails.title} ({movieDetails.year})</h2>
                <div className="movie-details-section">
                  <h3>Plot</h3>
                  <p>{movieDetails.plot}</p>
                </div>
                <div className="movie-details-section">
                  <h3>Cast</h3>
                  <p>{movieDetails.cast}</p>
                </div>
                <div className="movie-details-section">
                  <h3>Director</h3>
                  <p>{movieDetails.director}</p>
                </div>
                <div className="movie-details-section">
                  <h3>Writers</h3>
                  <p>{movieDetails.writer}</p>
                </div>
                <div className="movie-details-section">
                  <h3>Genre</h3>
                  <p>{movieDetails.genre}</p>
                </div>
                <div className="movie-details-section">
                  <h3>Runtime</h3>
                  <p>{movieDetails.runtime}</p>
                </div>
                {movieDetails.imdbRating && (
                  <div className="movie-details-section">
                    <h3>IMDb Rating</h3>
                    <p>{movieDetails.imdbRating}/10</p>
                  </div>
                )}
                {movieDetails.awards && movieDetails.awards !== 'Awards information not available' && (
                  <div className="movie-details-section">
                    <h3>Awards</h3>
                    <p>{movieDetails.awards}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="movie-details-error">Error loading movie details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
