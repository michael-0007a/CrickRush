'use client';

import React, { useState, useEffect } from 'react';
import { Player, SAMPLE_PLAYERS } from '@/types/auction';

interface PlayerQueueProps {
  onPlayerSelect?: (player: Player) => void;
  onNextPlayer?: (player: Player) => void;
  roomId?: string; // Add roomId to make queue unique per room
}

const PlayerQueue: React.FC<PlayerQueueProps> = ({ onPlayerSelect, onNextPlayer, roomId }) => {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [shuffledPlayers, setShuffledPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPlayerDetails, setShowPlayerDetails] = useState(false);

  /**
   * SUPER ROBUST Fisher-Yates shuffle with multiple randomization techniques
   */
  const shufflePlayersWithSeed = (players: Player[], seed: string) => {
    const shuffled = [...players];

    // Method 1: Create multiple hash variants for more entropy
    let hash1 = 0;
    let hash2 = 5381; // djb2 hash
    let hash3 = 1; // FNV hash

    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);

      // Hash 1: Simple hash
      hash1 = ((hash1 << 5) - hash1) + char;
      hash1 = hash1 & hash1;

      // Hash 2: djb2 hash
      hash2 = ((hash2 << 5) + hash2) + char;

      // Hash 3: FNV-1a hash
      hash3 ^= char;
      hash3 += (hash3 << 1) + (hash3 << 4) + (hash3 << 7) + (hash3 << 8) + (hash3 << 24);
    }

    // Combine all hashes and add timestamp-based entropy
    const combinedSeed = Math.abs(hash1 ^ hash2 ^ hash3) + Date.now() % 1000;

    console.log('🔍 DEBUGGING - Combined seed:', combinedSeed);

    // Method 2: Multiple random number generators
    let rng1 = combinedSeed % 233280;
    let rng2 = (combinedSeed * 16807) % 2147483647; // Park and Miller RNG
    let rng3 = combinedSeed;

    const multiRandom = () => {
      // Use 3 different RNG algorithms and combine them
      rng1 = (rng1 * 9301 + 49297) % 233280;
      rng2 = (rng2 * 16807) % 2147483647;
      rng3 = (rng3 * 1103515245 + 12345) % 2147483648;

      const combined = (rng1 / 233280 + rng2 / 2147483647 + rng3 / 2147483648) / 3;
      return combined;
    };

    // Method 3: Shuffle multiple times with different algorithms
    // First shuffle: Standard Fisher-Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(multiRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Second shuffle: Reverse Fisher-Yates for extra randomness
    for (let i = 0; i < shuffled.length - 1; i++) {
      const j = i + Math.floor(multiRandom() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Third shuffle: Random swaps based on seed
    const numSwaps = Math.floor(multiRandom() * 20) + 10; // 10-30 random swaps
    for (let i = 0; i < numSwaps; i++) {
      const idx1 = Math.floor(multiRandom() * shuffled.length);
      const idx2 = Math.floor(multiRandom() * shuffled.length);
      [shuffled[idx1], shuffled[idx2]] = [shuffled[idx2], shuffled[idx1]];
    }

    return shuffled;
  };

  // Initialize with shuffled players based on roomId
  useEffect(() => {
    // Create a much more unique seed
    const timestamp = Date.now();
    const randomComponent = Math.random().toString(36).substring(2);
    const seed = roomId
      ? `room_${roomId}_${timestamp}_${randomComponent}`
      : `default_${timestamp}_${randomComponent}_${Math.random()}`;

    console.log('🔍 DEBUGGING PlayerQueue - Room ID:', roomId);
    console.log('🔍 DEBUGGING PlayerQueue - Enhanced seed used:', seed);
    console.log('🔍 DEBUGGING PlayerQueue - SAMPLE_PLAYERS count:', SAMPLE_PLAYERS.length);
    console.log('🔍 DEBUGGING PlayerQueue - First 3 sample players:', SAMPLE_PLAYERS.slice(0, 3).map(p => p.name));

    const shuffled = shufflePlayersWithSeed(SAMPLE_PLAYERS, seed);
    console.log('🔍 DEBUGGING PlayerQueue - First 5 players after enhanced shuffle:', shuffled.slice(0, 5).map(p => p.name));
    console.log('🔍 DEBUGGING PlayerQueue - All shuffled players:', shuffled.map(p => p.name));

    setShuffledPlayers(shuffled);
    console.log(`🎲 PlayerQueue shuffled with ENHANCED algorithm for room: ${roomId || 'default'}`);
  }, [roomId]);

  const currentPlayer = shuffledPlayers[currentPlayerIndex];
  const nextPlayer = shuffledPlayers[currentPlayerIndex + 1];
  const remainingPlayers = shuffledPlayers.length - currentPlayerIndex - 1;

  const handleNextPlayer = () => {
    if (currentPlayerIndex < shuffledPlayers.length - 1) {
      setIsLoading(true);

      // Smooth transition effect
      setTimeout(() => {
        setCurrentPlayerIndex(prev => prev + 1);
        setIsLoading(false);
        setShowPlayerDetails(false);

        if (onNextPlayer && shuffledPlayers[currentPlayerIndex + 1]) {
          onNextPlayer(shuffledPlayers[currentPlayerIndex + 1]);
        }
      }, 300);
    }
  };

  const handlePlayerSelect = () => {
    if (currentPlayer && onPlayerSelect) {
      onPlayerSelect(currentPlayer);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Batsman': return 'bg-green-500';
      case 'Bowler': return 'bg-red-500';
      case 'Fast Bowler': return 'bg-red-600';
      case 'Spin Bowler': return 'bg-red-400';
      case 'All-Rounder': return 'bg-purple-500';
      case 'Wicket-Keeper': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getNationalityFlag = (nationality: string) => {
    const flags: { [key: string]: string } = {
      'India': '🇮🇳',
      'England': '🏴',
      'Australia': '🇦🇺',
      'South Africa': '🇿🇦',
      'New Zealand': '🇳🇿',
      'West Indies': '🏴',
      'Pakistan': '🇵🇰',
      'Sri Lanka': '🇱🇰',
      'Bangladesh': '🇧🇩',
      'Afghanistan': '🇦🇫'
    };
    return flags[nationality] || '🌍';
  };

  const formatPrice = (price: number) => {
    return `₹${price} L`;
  };

  // Show the queue immediately without loading state
  if (!currentPlayer || shuffledPlayers.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Player Queue</h2>
              <p className="text-blue-100">Preparing players...</p>
            </div>
          </div>
        </div>
        <div className="p-8 text-center">
          <div className="text-gray-500">Queue will appear automatically when ready</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Player Queue</h2>
            <p className="text-blue-100">
              {remainingPlayers + 1} players remaining
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {currentPlayerIndex + 1}
            </div>
            <div className="text-sm text-blue-100">
              of {shuffledPlayers.length}
            </div>
          </div>
        </div>
      </div>

      {/* Current Player Card */}
      <div className={`p-8 transition-all duration-300 ${isLoading ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}`}>
        <div className="text-center mb-6">
          <div className="relative inline-block">
            <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-4xl font-bold text-gray-600 mb-4 mx-auto shadow-lg">
              {currentPlayer.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className={`absolute -top-2 -right-2 w-8 h-8 ${getCategoryColor(currentPlayer.category)} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md`}>
              {currentPlayer.category[0]}
            </div>
          </div>

          <h3 className="text-3xl font-bold text-gray-900 mb-2">
            {currentPlayer.name}
          </h3>

          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-2xl">{getNationalityFlag(currentPlayer.nationality)}</span>
            <span className="text-lg text-gray-600">{currentPlayer.nationality}</span>
            {currentPlayer.isOverseas && (
              <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-semibold">
                OVERSEAS
              </span>
            )}
          </div>
        </div>

        {/* Player Info Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Category</div>
            <div className="font-semibold text-gray-900">{currentPlayer.category}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Base Price</div>
            <div className="font-bold text-green-600 text-lg">{formatPrice(currentPlayer.basePrice)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Experience</div>
            <div className="font-semibold text-gray-900">{currentPlayer.experience}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Specialization</div>
            <div className="font-semibold text-gray-900 text-sm">{currentPlayer.specialization}</div>
          </div>
        </div>

        {/* Stats Toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowPlayerDetails(!showPlayerDetails)}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors duration-200"
          >
            {showPlayerDetails ? 'Hide' : 'Show'} Player Stats
          </button>

          {showPlayerDetails && (
            <div className="mt-4 bg-blue-50 rounded-lg p-4 animate-in slide-in-from-top duration-300">
              <h4 className="font-semibold text-blue-900 mb-3">Career Statistics</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {currentPlayer.stats.matches && (
                  <div>
                    <span className="text-blue-600">Matches:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.matches}</span>
                  </div>
                )}
                {currentPlayer.stats.runs && (
                  <div>
                    <span className="text-blue-600">Runs:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.runs}</span>
                  </div>
                )}
                {currentPlayer.stats.wickets && (
                  <div>
                    <span className="text-blue-600">Wickets:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.wickets}</span>
                  </div>
                )}
                {currentPlayer.stats.average && (
                  <div>
                    <span className="text-blue-600">Average:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.average}</span>
                  </div>
                )}
                {currentPlayer.stats.strikeRate && (
                  <div>
                    <span className="text-blue-600">Strike Rate:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.strikeRate}</span>
                  </div>
                )}
                {currentPlayer.stats.economy && (
                  <div>
                    <span className="text-blue-600">Economy:</span>
                    <span className="font-semibold ml-2">{currentPlayer.stats.economy}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleNextPlayer}
            disabled={currentPlayerIndex >= shuffledPlayers.length - 1}
            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
          >
            {currentPlayerIndex >= shuffledPlayers.length - 1 ? 'No More Players' : 'Next Player →'}
          </button>

          {onPlayerSelect && (
            <button
              onClick={handlePlayerSelect}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              Start Auction
            </button>
          )}
        </div>
      </div>

      {/* Next Player Preview */}
      {nextPlayer && (
        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-2">Next Player:</div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
              {nextPlayer.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{nextPlayer.name}</div>
              <div className="text-xs text-gray-500">
                {nextPlayer.category} • {formatPrice(nextPlayer.basePrice)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerQueue;
