import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import transparentLogo from '../assets/trans 3.svg';

export const WaitingRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { gameState, startGame } = useGame();
  const { connected, displayName, publicKey } = usePrivyWallet();
  const [copied, setCopied] = useState(false);

  const isHost = publicKey?.toBase58() === (gameState as any)?.hostWallet;

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') {
      navigate('/game');
    }
  }, [gameState?.gameStatus, navigate]);

  const handleReady = () => {
    startGame();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(gameState?.roomCode ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!gameState) {
    navigate('/');
    return null;
  }

  return (
    <>
      {/* Absolute UI (same as Join page) */}
      <div className="absolute top-10 left-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <ArrowLeft size={20} color="#BFFB4F" />
          <span>Back</span>
        </button>
      </div>

      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          {connected ? displayName : 'Not Connected'}
        </div>
      </div>

      <div className="absolute top-10 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      {/* 1) Centered card area */}
      <div className="min-h-screen flex flex-col items-center justify-center px-8">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <h2 className="text-white text-4xl font-bold">You're In!</h2>

            <div className="w-full text-center">
              <p
                className="text-white/60 text-sm uppercase tracking-widest mb-3"
              >
                Share this code with your friends
              </p>

              {/* Room code + copy button */}
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-4 mx-auto mb-2 group"
              >
                <p
                  className="text-[#BFFB4F] text-3xl font-bold"
                  style={{
                    fontFamily: 'Pixelify Sans, sans-serif',
                    letterSpacing: '0.3em',
                  }}
                >
                  {gameState.roomCode}
                </p>
                <span className="text-[#BFFB4F]/60 group-hover:text-[#BFFB4F] transition-colors">
                  {copied ? <Check size={28} /> : <Copy size={28} />}
                </span>
              </button>

              {copied && (
                <p className="text-[#BFFB4F]/60 text-sm mb-4">Copied!</p>
              )}

              <p className="text-white/30 text-sm mb-6">
                {gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} in lobby
                {!isHost && ' · Waiting for host to start...'}
              </p>

              {isHost && (
                <div className="flex justify-center">
                  <GlowButton onClick={handleReady} variant="purple">
                    START GAME →
                  </GlowButton>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 2) Players section — real players from Supabase real-time subscription */}
      <div className="text-center -mt-20">
        <h3
          className="text-white text-4xl font-bold mb-6"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Players
        </h3>

        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
          {gameState.players.map((player) => (
            <p
              key={player.id}
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
            >
              {player.name}: {gameState.buyInAmount.toFixed(2)} SOL
            </p>
          ))}
        </div>
      </div>
    </>
  );
};
