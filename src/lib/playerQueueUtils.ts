/**
 * @fileoverview Player Queue Utility Functions
 * Helper functions for managing player queues in the auction
 */

import { supabase } from './supabase';

/**
 * Shuffle array using Fisher-Yates algorithm for true randomness
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Load and shuffle players from the database
 */
export async function loadShuffledPlayers(): Promise<any[]> {
  const { data: players, error } = await supabase
    .from('players')
    .select('*');

  if (error) {
    console.error('Error loading players:', error);
    throw new Error(`Failed to load players: ${error.message}`);
  }

  if (!players || players.length === 0) {
    throw new Error('No players available for auction. Please ensure the players table has data.');
  }

  console.log(`✅ Loaded ${players.length} players from database`);

  // Shuffle players for random order
  const shuffledPlayers = shuffleArray(players);
  console.log(`🔀 Shuffled ${shuffledPlayers.length} players for auction`);

  return shuffledPlayers;
}

/**
 * Validate player queue integrity
 */
export function validatePlayerQueue(playerQueue: any): boolean {
  if (!playerQueue) {
    console.error('❌ Player queue is null or undefined');
    return false;
  }

  if (!Array.isArray(playerQueue)) {
    console.error('❌ Player queue is not an array, type:', typeof playerQueue);
    return false;
  }

  if (playerQueue.length === 0) {
    console.error('❌ Player queue is empty');
    return false;
  }

  // Check if all players have required fields
  const requiredFields = ['id', 'name', 'base_price'];
  for (let i = 0; i < playerQueue.length; i++) {
    const player = playerQueue[i];
    if (!player) {
      console.error(`❌ Player at index ${i} is null or undefined`);
      return false;
    }
    for (const field of requiredFields) {
      if (!player[field]) {
        console.error(`❌ Player at index ${i} missing required field: ${field}`);
        return false;
      }
    }
  }

  console.log(`✅ Player queue validated: ${playerQueue.length} players`);
  return true;
}

/**
 * Repair corrupted player queue by reloading from database
 */
export async function repairPlayerQueue(roomId: string): Promise<any[]> {
  console.log('🔧 Repairing player queue for room:', roomId);

  try {
    const shuffledPlayers = await loadShuffledPlayers();

    // Update the auction state with repaired queue
    const { error } = await supabase
      .from('auction_state')
      .update({
        player_queue: shuffledPlayers,
        total_players: shuffledPlayers.length,
        updated_at: new Date().toISOString()
      })
      .eq('room_id', roomId);

    if (error) {
      throw new Error(`Failed to update auction state: ${error.message}`);
    }

    console.log('✅ Player queue repaired successfully');
    return shuffledPlayers;
  } catch (error) {
    console.error('❌ Failed to repair player queue:', error);
    throw error;
  }
}
