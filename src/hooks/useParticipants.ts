/**
 * @fileoverview Hook for managing auction participants with Supabase real-time subscriptions
 * Replaces Socket.IO with Supabase real-time functionality
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Interface representing a participant in an auction room
 */
interface Participant {
  id: string;
  user_id: string;
  auction_room_id: string;
  team_id: string | null;
  user_name: string;
  is_auctioneer: boolean;
  joined_at: string;
}

/**
 * Custom hook to manage auction participants with real-time updates
 *
 * @param roomId - The ID of the auction room
 * @param userId - The current user's ID to identify their participant data
 * @returns Object containing participants data, current user's participant, loading state, and error state
 *
 * @example
 * ```typescript
 * const { participants, loading, error } = useParticipants(roomId);
 * ```
 */
export function useParticipants(roomId: string, userId: string | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current user's participant data
  const myParticipant = participants.find(p => p.user_id === userId) || null;

  /**
   * Loads participants from the database and subscribes to real-time updates
   */
  const loadParticipants = useCallback(async () => {
    if (!roomId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('auction_participants')
        .select(`
          *,
          ipl_franchises (
            short_name,
            name,
            color
          )
        `)
        .eq('auction_room_id', roomId)
        .order('joined_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Enrich participants with team data
      const enrichedParticipants = data?.map(participant => ({
        ...participant,
        team_short_name: participant.ipl_franchises?.short_name || participant.team_id,
        team_name: participant.ipl_franchises?.name || participant.team_id,
        team_color: participant.ipl_franchises?.color || '#666666'
      })) || [];

      setParticipants(enrichedParticipants);
    } catch (err) {
      console.error('Error loading participants:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!roomId) return;

    // Load initial data
    loadParticipants();

    // Subscribe to participant changes
    const channel = supabase
      .channel(`participants-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_participants',
          filter: `auction_room_id=eq.${roomId}`
        },
        (payload) => {
          // Refresh participants when changes occur
          loadParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadParticipants]);

  return {
    participants,
    myParticipant,
    loading,
    error,
    refetch: loadParticipants
  };
}
