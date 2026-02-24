import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { GlowButton } from '../components/GlowButton';
import { useGame } from '../contexts/GameContext';
import { usePrivyWallet } from '../contexts/PrivyContext';
import { QuestionMode } from '../types/game';
import transparentLogo from '../assets/trans 3.svg';

const MODE_INFO: Record<QuestionMode, { emoji: string; title: string; desc: string }> = {
  classic: {
    emoji: '🎲',
    title: 'Classic',
    desc: 'Random questions from the built-in collection',
  },
  custom: {
    emoji: '✏️',
    title: 'Custom',
    desc: 'Host writes all the questions before the game starts',
  },
  'hot-take': {
    emoji: '🔥',
    title: 'Hot Take',
    desc: 'Each round, players anonymously submit & vote on questions',
  },
};

export const CreateGamePage: React.FC = () => {
  const navigate = useNavigate();
  const { createGame, loading, error } = useGame();
  const { connected, login, displayName } = usePrivyWallet();
  const [buyIn, setBuyIn] = useState('');
  const [roomName, setRoomName] = useState('');
  const [nickname, setNickname] = useState('');
  const [questionMode, setQuestionMode] = useState<QuestionMode>('classic');
  const [customQuestions, setCustomQuestions] = useState<string[]>(['']);

  const handleCreate = async () => {
    if (!connected) {
      login();
      return;
    }
    const buyInAmount = parseFloat(buyIn) || 1;

    // For custom mode, filter out empty questions
    const filteredQuestions =
      questionMode === 'custom'
        ? customQuestions.filter((q) => q.trim().length > 0)
        : undefined;

    if (questionMode === 'custom' && (!filteredQuestions || filteredQuestions.length === 0)) {
      return; // Don't create without questions
    }

    await createGame(buyInAmount, roomName, questionMode, filteredQuestions, nickname.trim() || undefined);
    navigate('/created');
  };

  const addQuestion = () => {
    setCustomQuestions((prev) => [...prev, '']);
  };

  const removeQuestion = (index: number) => {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, value: string) => {
    setCustomQuestions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8">
      {/* Back button */}
      <div className="absolute top-10 left-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full hover:bg-black/90 transition-all font-['Plus_Jakarta_Sans']"
        >
          <ArrowLeft size={20} color="#BFFB4F" />
          <span>Back</span>
        </button>
      </div>

      {/* wallet badge */}
      <div className="absolute top-10 right-10">
        <div className="backdrop-blur-md bg-black/80 text-white px-6 py-2 rounded-full font-['Plus_Jakarta_Sans']">
          {connected ? displayName : 'Not Connected'}
        </div>
      </div>

      {/* Centered logo */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2">
        <img
          src={transparentLogo}
          alt="Transparent"
          style={{ height: '100px', width: 'auto' }}
        />
      </div>

      {/* ✅ Match JoinGamePage box position */}
      <div className="flex flex-col items-center justify-center mt-[180px]">
        <GlassCard className="w-full max-w-xl">
          <div className="flex flex-col items-center gap-8 py-8">
            <div className="w-full space-y-8">
              {/* Buy-In Section */}
              <div>
                <h3
                  className="text-white text-lg text-center mb-3 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Buy-In Amount
                </h3>
                <div className="backdrop-blur-md bg-black/80 rounded-full p-4">
                  <input
                    type="text"
                    value={buyIn}
                    onChange={(e) => setBuyIn(e.target.value)}
                    placeholder="0.1 SOL"
                    className="w-full bg-transparent text-[#BFFB4F]/50 text-xl text-center font-bold outline-none placeholder:text-[#BFFB4F]/50 font-medium"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  />
                </div>
              </div>

              {/* Room Name Section */}
              <div>
                <h3
                  className="text-white text-lg text-center mb-3 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Room Name
                </h3>
                <div className="backdrop-blur-md bg-black/80 rounded-full p-4">
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="College Night"
                    className="w-full bg-transparent text-[#BFFB4F]/50 text-xl text-center font-bold outline-none placeholder:text-[#BFFB4F]/50 font-medium"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  />
                </div>
              </div>

              {/* Host Nickname */}
              <div>
                <h3
                  className="text-white text-lg text-center mb-3 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Your Name
                </h3>
                <div className="backdrop-blur-md bg-black/80 rounded-full p-4">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Enter nickname..."
                    maxLength={20}
                    className="w-full bg-transparent text-[#BFFB4F]/50 text-xl text-center font-bold outline-none placeholder:text-[#BFFB4F]/50 font-medium"
                    style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                  />
                </div>
              </div>

              {/* Question Mode Selector */}
              <div>
                <h3
                  className="text-white text-lg text-center mb-3 font-bold"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Question Mode
                </h3>
                <div className="flex flex-col gap-3">
                  {(Object.keys(MODE_INFO) as QuestionMode[]).map((mode) => {
                    const info = MODE_INFO[mode];
                    const isSelected = questionMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setQuestionMode(mode)}
                        className={`
                          w-full text-left backdrop-blur-md rounded-3xl p-5 transition-all duration-300
                          ${isSelected
                            ? 'bg-[#664FFB]/40 ring-2 ring-[#BFFB4F] shadow-[0_0_20px_rgba(191,251,79,0.3)]'
                            : 'bg-black/80 hover:bg-black/60'
                          }
                          cursor-pointer
                        `}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-3xl">{info.emoji}</span>
                          <div>
                            <p
                              className={`text-2xl font-bold ${isSelected ? 'text-[#BFFB4F]' : 'text-white'}`}
                              style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                            >
                              {info.title}
                            </p>
                            <p className="text-white/50 text-sm mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                              {info.desc}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Questions Input (only shown in custom mode) */}
              {questionMode === 'custom' && (
                <div>
                  <h3
                    className="text-white text-base text-center mb-3 font-bold"
                    style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    Your Questions
                  </h3>
                  <div className="space-y-3">
                    {customQuestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 backdrop-blur-md bg-black/80 rounded-2xl p-3">
                          <input
                            type="text"
                            value={q}
                            onChange={(e) => updateQuestion(i, e.target.value)}
                            placeholder={`Question ${i + 1}...`}
                            className="w-full bg-transparent text-white text-lg outline-none placeholder:text-white/30"
                            style={{ fontFamily: 'Pixelify Sans, sans-serif' }}
                          />
                        </div>
                        {customQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeQuestion(i)}
                            className="text-white/40 hover:text-red-400 transition-colors p-2"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="flex items-center gap-2 text-[#BFFB4F]/60 hover:text-[#BFFB4F] transition-colors mx-auto mt-2"
                    >
                      <Plus size={20} />
                      <span style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                        Add Question
                      </span>
                    </button>
                  </div>
                  <p className="text-white/30 text-sm text-center mt-3">
                    {customQuestions.filter((q) => q.trim()).length} question
                    {customQuestions.filter((q) => q.trim()).length !== 1 ? 's' : ''} added
                  </p>
                </div>
              )}
            </div>

            {/* Error display */}
            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {/* Create Button */}
            <div className="flex justify-center mt-4">
              <GlowButton onClick={handleCreate} variant="purple">
                {loading ? 'Creating...' : connected ? 'Create Game' : 'Connect Wallet'}
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
