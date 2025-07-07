/**
 * @fileoverview Custom hook for managing a user's squad (purchased players) in an auction
 * Handles loading, tracking, and real-time updates of purchased players
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Interface representing a purchased player in a user's squad
 */
interface PurchasedPlayer {
  id: string;
  player_id: number;
  final_price: number;
  player: {
    id: number;
    name: string;
    role: string;
    country: string;
    base_price: number;
  };
}

/**
 * Custom hook to manage a user's squad of purchased players
 *
 * @param roomId - The ID of the auction room
 * @param participantId - The ID of the participant whose squad to track
 * @returns Object containing squad data, loading state, and utility functions
 *
 * @example
 * ```typescript
 * const { myPlayers, totalSpent, playersCount, loading } = useMySquad(roomId, participantId);
 * ```
 */
export function useMySquad(roomId: string, participantId: string | null) {
  const [myPlayers, setMyPlayers] = useState<PurchasedPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [playersCount, setPlayersCount] = useState(0);

  /**
   * Loads the user's purchased players from the database with real-time updates
   */
  const loadMyPlayers = useCallback(async () => {
    if (!roomId || !participantId) {
      setMyPlayers([]);
      setTotalSpent(0);
      setPlayersCount(0);
      return;
    }

    try {
      setLoading(true);

      const { data: purchasedPlayers, error } = await supabase
        .from('auction_players')
        .select(`
          id,
          player_id,
          final_price,
          players!inner(
            id,
            name,
            role,
            country,
            base_price
          )
        `)
        .eq('auction_room_id', roomId)
        .eq('participant_id', participantId);

      if (error) {
        console.error('Error loading squad:', error);
        return;
      }

      const transformedPlayers = purchasedPlayers?.map((item: any) => ({
        id: item.id,
        player_id: item.player_id,
        final_price: item.final_price,
        player: {
          id: item.players.id,
          name: item.players.name,
          role: item.players.role,
          country: item.players.country,
          base_price: item.players.base_price
        }
      })) || [];

      setMyPlayers(transformedPlayers);
      setPlayersCount(transformedPlayers.length);
      setTotalSpent(transformedPlayers.reduce((total, p) => total + p.final_price, 0));

    } catch (error) {
      console.error('Squad loading error:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId, participantId]);

  /**
   * Initial load effect - loads squad data when component mounts
   */
  useEffect(() => {
    loadMyPlayers();
  }, [loadMyPlayers]);

  /**
   * Polling effect - refreshes squad data every 2 seconds to keep it current
   * This ensures real-time updates when players are purchased
   */
  useEffect(() => {
    if (!roomId || !participantId) return;

    const interval = setInterval(() => {
      loadMyPlayers();
    }, 2000);

    return () => clearInterval(interval);
  }, [roomId, participantId, loadMyPlayers]);

  /**
   * Setup real-time subscription for squad changes
   */
  useEffect(() => {
    if (!roomId || !participantId) return;

    // Load initial data
    loadMyPlayers();

    // Subscribe to auction_players changes for this participant
    const subscription = supabase
      .channel(`my_squad_${roomId}_${participantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_players',
        filter: `auction_room_id=eq.${roomId}`
      }, (payload) => {
        // Check if this change affects current participant
        if (payload.new?.participant_id === participantId ||
            payload.old?.participant_id === participantId) {
          loadMyPlayers(); // Reload when squad changes
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [roomId, participantId, loadMyPlayers]);

  /**
   * Manually adds a player to the squad for immediate UI updates
   * Used for optimistic updates when a player is successfully purchased
   *
   * @param newPlayer - The purchased player to add to the squad
   */
  const addPlayer = useCallback((newPlayer: PurchasedPlayer) => {
    setMyPlayers(current => {
      const updated = [...current, newPlayer];
      setPlayersCount(updated.length);
      setTotalSpent(updated.reduce((total, p) => total + p.final_price, 0));
      return updated;
    });
  }, []);

  return {
    myPlayers,
    loading,
    totalSpent,
    playersCount,
    refetch: loadMyPlayers,
    addPlayer
  };
}
