import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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

function AnimatedRoutes() {
  const location = useLocation();
  return (
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
