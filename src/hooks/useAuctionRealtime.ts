/**
 * @fileoverview Real-time auction state management hook for CrickRush
 * Manages live auction data synchronization using Supabase real-time subscriptions
 * Handles current player, bidding state, and participant updates
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Interface representing the current auction state
 */
interface AuctionState {
  /** The auction room ID */
  room_id: string;
  /** Whether the auction is currently active */
  is_active: boolean;
  /** Whether the auction is paused */
  is_paused: boolean;
  /** Current player being auctioned */
  current_player: any;
  /** Current highest bid amount */
  current_bid: number;
  /** Team ID of the leading bidder */
  leading_team: string | null;
  /** User ID of the leading bidder */
  leading_bidder: string | null;
  /** Time remaining for current bid */
  time_remaining: number;
  /** Index of current player in the queue */
  current_player_index: number;
  /** Total number of players in auction */
  total_players: number;
}

/**
 * Interface representing participant data in the auction
 */
interface ParticipantData {
  /** Unique participant identifier */
  id: string;
  /** User ID of the participant */
  user_id: string;
  /** Auction room ID */
  auction_room_id: string;
  /** Selected team ID */
  team_id: string | null;
  /** Display name of the user */
  user_name: string;
  /** Whether this participant is the auctioneer */
  is_auctioneer: boolean;
  /** Timestamp when participant joined */
  joined_at: string;
}

/**
 * Custom hook for managing real-time auction state
 * Subscribes to live updates for auction progress, bidding, and participants
 *
 * @param roomId - The auction room ID to subscribe to
 * @param userId - The current user's ID (optional, for participant-specific data)
 * @returns Object containing auction state and loading status
 *
 * @example
 * ```typescript
 * const { auctionState, loading } = useAuctionRealtime(roomId, userId);
 *
 * if (auctionState?.current_player) {
 *   console.log('Current player:', auctionState.current_player.name);
 *   console.log('Current bid:', auctionState.current_bid);
 * }
 * ```
 */
export function useAuctionRealtime(roomId: string, userId: string | null = null) {
  // Auction state management
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads the initial auction state from the database
   * Sets up the baseline state before real-time updates begin
   */
  const loadInitialState = useCallback(async () => {
    if (!roomId) return;

    try {
      setLoading(true);

      const { data: auctionData, error: auctionError } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (auctionError && auctionError.code !== 'PGRST116') {
        setError('Failed to load auction state');
        return;
      }

      if (auctionData) {
        setAuctionState(auctionData);
      }

    } catch (error) {
      setError('Failed to load auction state');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Load initial state on mount
  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  // Real-time subscription for auction state changes
  useEffect(() => {
    if (!roomId) return;

    const subscription = supabase
      .channel(`auction_state_${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_state',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          setAuctionState(payload.new as AuctionState);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [roomId]);

  return {
    /** Current auction state with player, bid, and timing information */
    auctionState,
    /** Whether the initial state is still loading */
    loading,
    /** Any error that occurred while loading state */
    error
  };
}
