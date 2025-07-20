'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Player, SAMPLE_PLAYERS } from '@/types/auction';

interface PlayerQueueState {
  players: Player[];
  currentIndex: number;
  currentPlayer: Player | null;
  nextPlayer: Player | null;
  isLoading: boolean;
  error: string | null;
}

export function usePlayerQueue(roomId: string) {
  const [queueState, setQueueState] = useState<PlayerQueueState>({
    players: [],
    currentIndex: 0,
    currentPlayer: null,
    nextPlayer: null,
    isLoading: true,
    error: null
  });

  /**
   * ROOM-SPECIFIC PLAYER SHUFFLING ALGORITHM
   * Uses the same algorithm as PlayerQueue component but with room-specific seeding
   */
  const shufflePlayersWithRoomSeed = useCallback((players: Player[], roomId: string) => {
    const shuffled = [...players];

    // Create room-specific seed (consistent for the same room)
    const seed = `auction_room_${roomId}_shuffle`;

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

    // Combine all hashes (no timestamp for consistency)
    const combinedSeed = Math.abs(hash1 ^ hash2 ^ hash3);

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
  }, []);

  /**
   * Load and shuffle players for the auction
   */
  const initializePlayerQueue = useCallback(async () => {
    if (!roomId) return;

    try {
      setQueueState(prev => ({ ...prev, isLoading: true, error: null }));

      // Load actual cricketers from the database
      const { data: playersFromDB, error: playersError } = await supabase
        .from('players')
        .select('*')
        .order('name');

      if (playersError) {
        throw new Error(`Failed to load players: ${playersError.message}`);
      }

      if (!playersFromDB || playersFromDB.length === 0) {
        throw new Error('No players found in database');
      }

      // Convert database players to Player type format
      const playersToShuffle: Player[] = playersFromDB.map(player => ({
        id: player.id,
        name: player.name,
        team: player.team || 'Unknown',
        role: player.role || 'All-rounder',
        base_price: player.base_price || 100000, // Fix: use base_price not basePrice
        nationality: player.nationality || 'Unknown',
        battingStyle: player.batting_style || 'Right-hand bat',
        bowlingStyle: player.bowling_style || 'Right-arm medium'
      }));

      const shuffledPlayers = shufflePlayersWithRoomSeed(playersToShuffle, roomId);

      setQueueState({
        players: shuffledPlayers,
        currentIndex: 0,
        currentPlayer: shuffledPlayers[0] || null,
        nextPlayer: shuffledPlayers[1] || null,
        isLoading: false,
        error: null
      });

    } catch (error) {
      setQueueState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to initialize player queue'
      }));
    }
  }, [roomId, shufflePlayersWithRoomSeed]);

  /**
   * Move to the next player in the queue
   */
  const moveToNextPlayer = useCallback((): Player | null => {
    const nextIndex = queueState.currentIndex + 1;

    if (nextIndex >= queueState.players.length) {
      return null;
    }

    const nextPlayer = queueState.players[nextIndex];
    const playerAfterNext = queueState.players[nextIndex + 1] || null;

    setQueueState(prev => ({
      ...prev,
      currentIndex: nextIndex,
      currentPlayer: nextPlayer,
      nextPlayer: playerAfterNext
    }));

    return nextPlayer;
  }, [queueState.currentIndex, queueState.players]);

  /**
   * Get remaining players count
   */
  const getRemainingCount = useCallback(() => {
    return queueState.players.length - queueState.currentIndex;
  }, [queueState.players.length, queueState.currentIndex]);

  /**
   * Get all remaining players
   */
  const getRemainingPlayers = useCallback(() => {
    return queueState.players.slice(queueState.currentIndex);
  }, [queueState.players, queueState.currentIndex]);

  // Initialize the queue when roomId changes
  useEffect(() => {
    initializePlayerQueue();
  }, [initializePlayerQueue]);

  return {
    // State
    players: queueState.players,
    currentPlayer: queueState.currentPlayer,
    nextPlayer: queueState.nextPlayer,
    currentIndex: queueState.currentIndex,
    isLoading: queueState.isLoading,
    error: queueState.error,

    // Actions
    moveToNextPlayer,
    getRemainingCount,
    getRemainingPlayers,

    // For debugging
    totalPlayers: queueState.players.length,
    remainingCount: getRemainingCount()
  };
}
