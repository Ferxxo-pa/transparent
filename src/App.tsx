import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import { Background } from './components/Background';
import { HomePage } from './pages/HomePage';
import { JoinGamePage } from './pages/JoinGamePage';
import { CreateGamePage } from './pages/CreateGamePage';
import { GameCreatedPage } from './pages/GameCreatedPage';
import { WaitingRoomPage } from './pages/WaitingRoomPage';
import { GamePlayPage } from './pages/GamePlayPage';
import { GameOverPage } from './pages/GameOverPage';

function App() {
  return (
    <GameProvider>
      <Router>
        <Background />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<JoinGamePage />} />
          <Route path="/create" element={<CreateGamePage />} />
          <Route path="/created" element={<GameCreatedPage />} />
          <Route path="/waiting" element={<WaitingRoomPage />} />
          <Route path="/game" element={<GamePlayPage />} />
          <Route path="/gameover" element={<GameOverPage />} />
          <Route path="/login" element={<HomePage />} />
        </Routes>
      </Router>
    </GameProvider>
  );
}

export default App;
