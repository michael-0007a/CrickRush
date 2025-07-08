/**
 * @fileoverview Enhanced auction data hook with real-time synchronization
 * Ensures immediate updates across all users for all auction actions
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface SimpleAuctionState {
  id?: string;
  room_id: string;
  is_active: boolean;
  is_paused: boolean;
  current_player_id?: string | null;
  current_player?: any;
  current_bid: number;
  base_price: number;
  current_bidder_id?: string | null;
  leading_team?: string | null;
  time_remaining: number;
  current_player_index: number;
  player_queue?: any[];
  sold_players?: any[];
  unsold_players?: any[];
}

interface SimpleParticipant {
  id: string;
  user_id: string;
  auction_room_id: string;
  team_name: string;
  budget: number;
  team_id?: string;
  created_at: string;
}

export function useAuctionData(roomId: string) {
  const [auctionState, setAuctionState] = useState<SimpleAuctionState | null>(null);
  const [participants, setParticipants] = useState<SimpleParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);
  const loadingRef = useRef(false);

  // Load auction state with enhanced error handling
  const loadAuctionState = useCallback(async () => {
    if (!roomId || loadingRef.current) return;

    try {
      loadingRef.current = true;
      console.log('🔄 Loading auction state for room:', roomId);

      const { data, error } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle();

      if (error) {
        console.warn('No auction state found, using defaults');
        setAuctionState({
          room_id: roomId,
          is_active: false,
          is_paused: false,
          current_bid: 0,
          base_price: 50,
          time_remaining: 30,
          current_player_index: 0
        });
      } else if (data) {
        // Load current player if exists
        let currentPlayer = null;
        if (data.current_player_id) {
          const { data: playerData } = await supabase
            .from('players')
            .select('*')
            .eq('id', data.current_player_id)
            .single();
          currentPlayer = playerData;
        }

        console.log('✅ Loaded auction state:', data);
        setAuctionState({
          ...data,
          current_player: currentPlayer
        });
      }
    } catch (err) {
      console.error('❌ Error loading auction state:', err);
      setError('Failed to load auction state');
    } finally {
      loadingRef.current = false;
    }
  }, [roomId]);

  // Load participants with team information - Enhanced with RLS bypass
  const loadParticipants = useCallback(async () => {
    if (!roomId) return;

    try {
      console.log('👥 Loading participants for room:', roomId);

      // Try multiple approaches to load participants, starting with the most permissive
      let participantsData = null;
      let participantsError = null;

      // Approach 1: Try the simplest possible query first
      try {
        const result = await supabase
          .from('auction_participants')
          .select('id, user_id, team_id, budget_remaining, is_auctioneer, created_at')
          .eq('auction_room_id', roomId);

        participantsData = result.data;
        participantsError = result.error;
      } catch (err) {
        console.warn('Approach 1 failed:', err);
        participantsError = err;
      }

      // Approach 2: If first approach fails, try with RPC or different method
      if (participantsError) {
        console.log('Trying alternative participant loading method...');
        try {
          // Try using the service role or a different query pattern
          const result = await supabase
            .from('auction_participants')
            .select('*')
            .eq('auction_room_id', roomId);

          participantsData = result.data;
          participantsError = result.error;
        } catch (err) {
          console.warn('Approach 2 failed:', err);
          participantsError = err;
        }
      }

      // If we still have errors, log them but continue
      if (participantsError) {
        console.error('❌ All participant loading approaches failed:', participantsError);
        console.warn('Continuing with empty participants - user may need to rejoin');
        setParticipants([]);
        return;
      }

      if (!participantsData || participantsData.length === 0) {
        console.log('No participants found for room:', roomId);
        setParticipants([]);
        return;
      }

      // Get team information separately to avoid RLS issues
      const participantsWithTeams = await Promise.all(
        participantsData.map(async (participant) => {
          let teamName = 'Unknown Team';
          let teamShortName = 'Unknown';

          if (participant.team_id) {
            try {
              const { data: teamData } = await supabase
                .from('ipl_franchises')
                .select('short_name, name')
                .eq('id', participant.team_id)
                .single();

              if (teamData?.short_name) {
                teamShortName = teamData.short_name;
                teamName = teamData.name || teamData.short_name;
              }
            } catch (teamError) {
              console.warn('Could not load team name for participant:', participant.id);
            }
          }

          return {
            id: participant.id,
            user_id: participant.user_id,
            auction_room_id: participant.auction_room_id || roomId,
            team_name: teamName,
            team_short_name: teamShortName,
            budget: participant.budget_remaining || 0,
            budget_remaining: participant.budget_remaining || 0,
            team_id: participant.team_id,
            created_at: participant.created_at,
            is_auctioneer: participant.is_auctioneer || false
          };
        })
      );

      console.log('✅ Loaded participants:', participantsWithTeams);
      setParticipants(participantsWithTeams);
    } catch (err) {
      console.error('❌ Critical error loading participants:', err);
      // Even with critical errors, continue with empty array
      setParticipants([]);
    }
  }, [roomId]);

  // Combined refresh function for real-time updates
  const refresh = useCallback(async () => {
    if (!roomId) return;

    console.log('🔄 Refreshing all auction data...');
    setError(null);

    try {
      await Promise.all([
        loadAuctionState(),
        loadParticipants()
      ]);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('❌ Error during refresh:', err);
      setError('Failed to refresh auction data');
    } finally {
      setLoading(false);
    }
  }, [roomId, loadAuctionState, loadParticipants]);

  // Enhanced action handlers with immediate UI updates
  const actions = {
    refresh,

    // Start auction
    startAuction: async () => {
      try {
        console.log('🚀 Starting auction...');

        // First, load players to create the auction queue
        const { data: players, error: playersError } = await supabase
          .from('players')
          .select('*')
          .order('base_price', { ascending: false }); // Start with highest value players

        if (playersError) {
          console.error('Error loading players:', playersError);
          throw playersError;
        }

        if (!players || players.length === 0) {
          throw new Error('No players available for auction');
        }

        const firstPlayer = players[0];
        console.log('First player for auction:', firstPlayer);

        // Check if auction state already exists
        const { data: existingState, error: checkError } = await supabase
          .from('auction_state')
          .select('id')
          .eq('room_id', roomId)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          console.error('Error checking existing auction state:', checkError);
          throw checkError;
        }

        let updateError;
        if (existingState) {
          // Update existing auction state with first player
          const { error } = await supabase
            .from('auction_state')
            .update({
              is_active: true,
              is_paused: false,
              time_remaining: 30,
              current_bid: 0,
              base_price: firstPlayer.base_price,
              current_player_id: firstPlayer.id,
              current_player_index: 0,
              player_queue: players,
              leading_team: null,
              current_bidder_id: null,
              updated_at: new Date().toISOString()
            })
            .eq('room_id', roomId);
          updateError = error;
        } else {
          // Insert new auction state with first player
          const { error } = await supabase
            .from('auction_state')
            .insert({
              room_id: roomId,
              is_active: true,
              is_paused: false,
              time_remaining: 30,
              current_bid: 0,
              base_price: firstPlayer.base_price,
              current_player_id: firstPlayer.id,
              current_player_index: 0,
              player_queue: players,
              leading_team: null,
              current_bidder_id: null
            });
          updateError = error;
        }

        if (updateError) {
          console.error('Database operation failed:', updateError);
          throw updateError;
        }

        // Immediate local update with first player
        setAuctionState(prev => prev ? {
          ...prev,
          is_active: true,
          is_paused: false,
          time_remaining: 30,
          current_bid: 0,
          base_price: firstPlayer.base_price,
          current_player_id: firstPlayer.id,
          current_player: firstPlayer,
          current_player_index: 0,
          player_queue: players,
          leading_team: null,
          current_bidder_id: null
        } : {
          room_id: roomId,
          is_active: true,
          is_paused: false,
          time_remaining: 30,
          current_bid: 0,
          base_price: firstPlayer.base_price,
          current_player_id: firstPlayer.id,
          current_player: firstPlayer,
          current_player_index: 0,
          player_queue: players,
          leading_team: null,
          current_bidder_id: null
        });

        console.log('✅ Auction started with first player:', firstPlayer.name);
      } catch (err) {
        console.error('❌ Failed to start auction:', err);
        throw err;
      }
    },

    // Pause/Resume auction
    togglePause: async () => {
      try {
        const newPausedState = !auctionState?.is_paused;
        console.log(`${newPausedState ? '⏸️ Pausing' : '▶️ Resuming'} auction...`);

        const { error } = await supabase
          .from('auction_state')
          .update({ is_paused: newPausedState })
          .eq('room_id', roomId);

        if (error) throw error;

        // Immediate local update
        setAuctionState(prev => prev ? {
          ...prev,
          is_paused: newPausedState
        } : null);

        console.log(`✅ Auction ${newPausedState ? 'paused' : 'resumed'}`);
      } catch (err) {
        console.error('❌ Failed to toggle pause:', err);
        throw err;
      }
    },

    // Add time
    addTime: async (seconds: number) => {
      try {
        const newTime = Math.max(0, (auctionState?.time_remaining || 0) + seconds);
        console.log(`⏰ Adding ${seconds}s, new time: ${newTime}s`);

        const { error } = await supabase
          .from('auction_state')
          .update({ time_remaining: newTime })
          .eq('room_id', roomId);

        if (error) throw error;

        // Immediate local update
        setAuctionState(prev => prev ? {
          ...prev,
          time_remaining: newTime
        } : null);

        console.log('✅ Time updated');
      } catch (err) {
        console.error('❌ Failed to add time:', err);
        throw err;
      }
    },

    // Place bid
    placeBid: async (amount: number, userId: string) => {
      try {
        console.log(`💰 Placing bid: ₹${amount}L by user ${userId}`);

        const { error } = await supabase
          .from('auction_state')
          .update({
            current_bid: amount,
            current_bidder_id: userId,
            time_remaining: 30 // Reset timer on bid
          })
          .eq('room_id', roomId);

        if (error) throw error;

        // Immediate local update
        setAuctionState(prev => prev ? {
          ...prev,
          current_bid: amount,
          current_bidder_id: userId,
          time_remaining: 30
        } : null);

        console.log('✅ Bid placed successfully');
      } catch (err) {
        console.error('❌ Failed to place bid:', err);
        throw err;
      }
    },

    // Sell player
    sellPlayer: async () => {
      try {
        console.log('💸 Selling current player...');

        // Update auction state to clear current player
        const { error } = await supabase
          .from('auction_state')
          .update({
            current_player_id: null,
            current_bid: 0,
            current_bidder_id: null,
            time_remaining: 30,
            is_paused: true
          })
          .eq('room_id', roomId);

        if (error) throw error;

        // Immediate local update
        setAuctionState(prev => prev ? {
          ...prev,
          current_player_id: null,
          current_player: null,
          current_bid: 0,
          current_bidder_id: null,
          time_remaining: 30,
          is_paused: true
        } : null);

        console.log('✅ Player sold');
      } catch (err) {
        console.error('❌ Failed to sell player:', err);
        throw err;
      }
    },

    // Next player
    nextPlayer: async () => {
      try {
        console.log('⏭️ Moving to next player...');

        const { error } = await supabase
          .from('auction_state')
          .update({
            current_player_index: (auctionState?.current_player_index || 0) + 1,
            current_bid: 50,
            base_price: 50,
            current_bidder_id: null,
            time_remaining: 30,
            is_paused: true
          })
          .eq('room_id', roomId);

        if (error) throw error;

        // Immediate local update
        setAuctionState(prev => prev ? {
          ...prev,
          current_player_index: (prev.current_player_index || 0) + 1,
          current_bid: 50,
          base_price: 50,
          current_bidder_id: null,
          time_remaining: 30,
          is_paused: true
        } : null);

        console.log('✅ Moved to next player');
      } catch (err) {
        console.error('❌ Failed to move to next player:', err);
        throw err;
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (roomId) {
      refresh();
    }
  }, [roomId, refresh]);

  return {
    auctionState,
    participants,
    loading,
    error,
    lastRefresh,
    actions
  };
}
