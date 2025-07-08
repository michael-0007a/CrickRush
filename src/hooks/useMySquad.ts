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

      // First, get the auction players for this participant
      const { data: auctionPlayers, error: auctionError } = await supabase
        .from('auction_players')
        .select('id, player_id, final_price')
        .eq('auction_room_id', roomId)
        .eq('participant_id', participantId);

      if (auctionError) {
        console.error('Error loading auction players:', auctionError);
        return;
      }

      if (!auctionPlayers || auctionPlayers.length === 0) {
        setMyPlayers([]);
        setTotalSpent(0);
        setPlayersCount(0);
        return;
      }

      // Then, get the player details for each purchased player
      const playerIds = auctionPlayers.map(ap => ap.player_id);
      const { data: playerDetails, error: playersError } = await supabase
        .from('players')
        .select('id, name, role, country, base_price')
        .in('id', playerIds);

      if (playersError) {
        console.error('Error loading player details:', playersError);
        return;
      }

      // Combine the data
      const transformedPlayers = auctionPlayers.map(auctionPlayer => {
        const playerDetail = playerDetails?.find(p => p.id === auctionPlayer.player_id);
        return {
          id: auctionPlayer.id,
          player_id: auctionPlayer.player_id,
          final_price: auctionPlayer.final_price,
          player: {
            id: playerDetail?.id || auctionPlayer.player_id,
            name: playerDetail?.name || 'Unknown Player',
            role: playerDetail?.role || 'Unknown',
            country: playerDetail?.country || 'Unknown',
            base_price: playerDetail?.base_price || 0
          }
        };
      });

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
        console.log('🏏 Squad: Player sales changed, refreshing squad...');
        // Check if this change affects current participant
        if (payload.new?.participant_id === participantId ||
            payload.old?.participant_id === participantId) {
          loadMyPlayers(); // Immediately reload when squad changes
        }
      })
      .subscribe((status) => {
        console.log('🏏 Squad subscription status:', status);
      });

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
