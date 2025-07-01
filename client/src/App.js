import React, { useState } from 'react';
import './App.css';

// Placeholder IMAX logo URL (replace with a real one if available)
const imaxLogo = 'https://1000logos.net/wp-content/uploads/2021/05/IMAX-logo.png';

function App() {
  const [activeTab, setActiveTab] = useState('titles');

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
          <div>Titles content goes here</div>
        ) : (
          <div>Calendar content goes here</div>
        )}
      </main>
    </div>
  );
}

export default App;
