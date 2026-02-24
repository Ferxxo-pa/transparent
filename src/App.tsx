import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from './contexts/GameContext';
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

// ── Page transition wrapper ────────────────────────────────
export const pageVariants = {
  initial: { opacity: 0, y: 28, scale: 0.97 },
  in:      { opacity: 1, y: 0,  scale: 1    },
  out:     { opacity: 0, y: -20, scale: 0.97 },
};

export const pageTransition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
};

export const PageWrap = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="in"
    exit="out"
    transition={pageTransition}
    style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
  >
    {children}
  </motion.div>
);

function GameRedirect() {
  const { gameState } = useGame();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!gameState || location.pathname !== '/') return;
    if (gameState.gameStatus === 'playing') navigate('/game', { replace: true });
    else if (gameState.gameStatus === 'gameover') navigate('/gameover', { replace: true });
    else if (gameState.gameStatus === 'waiting') {
      navigate('/created', { replace: true });
    }
  }, [gameState, location.pathname, navigate]);

  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <>
    <GameRedirect />
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/"        element={<PageWrap><HomePage /></PageWrap>} />
        <Route path="/join"    element={<PageWrap><JoinGamePage /></PageWrap>} />
        <Route path="/create"  element={<PageWrap><CreateGamePage /></PageWrap>} />
        <Route path="/created" element={<PageWrap><GameCreatedPage /></PageWrap>} />
        <Route path="/waiting" element={<PageWrap><WaitingRoomPage /></PageWrap>} />
        <Route path="/game"    element={<PageWrap><GamePlayPage /></PageWrap>} />
        <Route path="/gameover"element={<PageWrap><GameOverPage /></PageWrap>} />
        <Route path="/login"   element={<PageWrap><HomePage /></PageWrap>} />
      </Routes>
    </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <PrivyWalletProvider>
      <GameProvider>
        <WalletBridge />
        <Router>
          <Background />
          <AnimatedRoutes />
        </Router>
      </GameProvider>
    </PrivyWalletProvider>
  );
}

export default App;
