import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PrivyWalletProvider } from './contexts/PrivyContext';
import { GameProvider } from './contexts/GameContext';
import { WalletBridge } from './components/WalletBridge';
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
    <PrivyWalletProvider>
      <GameProvider>
        <WalletBridge />
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
    </PrivyWalletProvider>
  );
}

export default App;
