/**
 * @fileoverview Enhanced Real-time auction state management hook for CrickRush
 * Manages live auction data synchronization using Supabase real-time subscriptions
 * Handles current player, bidding state, participant updates, and all auction controls
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { loadShuffledPlayers, validatePlayerQueue, repairPlayerQueue } from '@/lib/playerQueueUtils';

/**
 * Interface representing the current auction state
 */
interface AuctionState {
  id: string;
  room_id: string;
  is_active: boolean;
  is_paused: boolean;
  current_player_id: string | null;
  current_player: Player | null;
  current_bid: number;
  base_price: number;
  current_bidder_id: string | null;
  leading_team: string | null;
  time_remaining: number;
  current_player_index: number;
  total_players: number;
  player_queue: Player[];
  sold_players: Player[];
  unsold_players: Player[];
  updated_at: string;
}

/**
 * Interface representing a player in the auction
 */
interface Player {
  id: string;
  name: string;
  base_price: number;
  role?: string;
  team?: string;
  [key: string]: any;
}

/**
 * Interface representing participant data in the auction
 */
interface ParticipantData {
  id: string;
  user_id: string;
  auction_room_id: string;
  team_name: string;
  budget: number;
  budget_remaining: number;
  squad_size?: number;
  is_auctioneer?: boolean;
  team_id?: string;
  team_short_name?: string;
  updated_at: string;
}

/**
 * Interface representing a bid in the auction
 */
interface BidData {
  id: string;
  room_id: string;
  player_id: string;
  bidder_id: string;
  bid_amount: number;
  created_at: string;
}

/**
 * Enhanced custom hook for managing real-time auction state
 * Subscribes to live updates for all auction activities
 */
export function useAuctionRealtime(roomId: string, userId: string | null = null) {
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [recentBids, setRecentBids] = useState<BidData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<string>('');
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Force refresh participant data from database
   */
  const forceRefreshParticipants = useCallback(async () => {
    if (!roomId) {
      console.log('⚠️ No roomId provided for participant refresh');
      setParticipants([]);
      return;
    }

    console.log('🔄 Force refreshing participants for room:', roomId);

    try {
      // Get auction participants - Fix: use correct column name
      const { data: participantsData, error: participantsError } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', roomId); // Fixed: was 'room_id', should be 'auction_room_id'

      if (participantsError) {
        console.error('❌ Error loading participants:', participantsError);
        setParticipants([]);
        return;
      }

      console.log('📊 Raw participants data:', participantsData);

      // If we have participants, try to enrich them with user profiles
      if (participantsData && participantsData.length > 0) {
        const enrichedParticipants = [];

        for (const participant of participantsData) {
          let userData = null;
          let franchiseData = null;

          // Try to get user profile data
          try {
            const { data: userProfile } = await supabase
              .from('users_profiles')
              .select('full_name, avatar_url')
              .eq('id', participant.user_id)
              .single();
            userData = userProfile;
          } catch (userError) {
            console.log(`⚠️ Could not load user profile for ${participant.user_id}:`, userError);
          }

          // Try to get franchise data if team_id exists
          if (participant.team_id) {
            try {
              const { data: franchise } = await supabase
                .from('ipl_franchises')
                .select('name, short_name')
                .eq('id', participant.team_id)
                .single();
              franchiseData = franchise;
            } catch (franchiseError) {
              console.log(`⚠️ Could not load franchise for ${participant.team_id}:`, franchiseError);
            }
          }

          // Format participant with available data
          const formattedParticipant = {
            ...participant,
            user_name: userData?.full_name || participant.team_name || 'Unknown User',
            user_avatar: userData?.avatar_url || null,
            team_name: franchiseData?.name || participant.team_name || 'No Team',
            team_short_name: franchiseData?.short_name || participant.team_name?.substring(0, 3)?.toUpperCase() || 'NT',
            budget: participant.budget_remaining || 0
          };

          enrichedParticipants.push(formattedParticipant);
        }

        console.log('✅ Enriched participants:', enrichedParticipants);
        setParticipants(enrichedParticipants);
      } else {
        console.log('📭 No participants found for room:', roomId);
        setParticipants([]);
      }

    } catch (error) {
      console.error('❌ Critical error in forceRefreshParticipants:', error);
      setParticipants([]);
    }
  }, [roomId]);

  /**
   * Force refresh all auction data from database
   */
  const refresh = useCallback(async () => {
    if (!roomId) return;

    try {
      setLoading(true);

      // Load auction state
      const { data: stateData, error: stateError } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (stateError) {
        console.error('Error loading auction state:', stateError);
        setError('Failed to load auction state');
        return;
      }

      // Ensure player_queue is always an array and properly populated
      if (stateData) {
        // If player_queue is missing or empty, load players from database
        if (!stateData.player_queue || !Array.isArray(stateData.player_queue) || stateData.player_queue.length === 0) {
          console.log('🔄 Player queue is missing or empty, loading from database...');

          try {
            const { data: players, error: playersError } = await supabase
              .from('players')
              .select('*')
              .order('base_price', { ascending: false });

            if (playersError) {
              console.error('Error loading players:', playersError);
              stateData.player_queue = [];
            } else {
              stateData.player_queue = players || [];
              console.log(`✅ Loaded ${stateData.player_queue.length} players for queue`);
            }
          } catch (error) {
            console.error('Error loading players for queue:', error);
            stateData.player_queue = [];
          }
        }

        stateData.sold_players = stateData.sold_players || [];
        stateData.unsold_players = stateData.unsold_players || [];
      }

      // Load current player if exists
      let currentPlayer = null;
      if (stateData?.current_player_id) {
        const { data: playerData } = await supabase
          .from('players')
          .select('*')
          .eq('id', stateData.current_player_id)
          .single();
        currentPlayer = playerData;
      }

      console.log('🔄 Auction state loaded:', {
        isActive: stateData?.is_active,
        currentPlayerIndex: stateData?.current_player_index,
        totalPlayers: stateData?.total_players,
        queueLength: stateData?.player_queue?.length || 0,
        soldPlayersCount: stateData?.sold_players?.length || 0,
        unsoldPlayersCount: stateData?.unsold_players?.length || 0
      });

      setAuctionState({
        ...stateData,
        current_player: currentPlayer
      });

      // Load recent bids
      const { data: bidsData } = await supabase
        .from('auction_bids')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentBids(bidsData || []);

      setError(null);
    } catch (error) {
      console.error('Error refreshing auction data:', error);
      setError('Failed to refresh auction data');
    } finally {
      setLoading(false);
    }
  }, [roomId]); // Remove forceRefreshParticipants from dependencies

  /**
   * Sets up real-time subscriptions for all auction updates
   */
  const setupRealtimeSubscriptions = useCallback(() => {
    if (!roomId || channelRef.current) return;

    try {
      // Create a single channel for all auction updates
      const channel = supabase
        .channel(`auction_room_${roomId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'auction_state',
            filter: `room_id=eq.${roomId}`
          },
          async (payload) => {
            console.log('🔄 Auction state update received:', payload);

            // Prevent duplicate updates by checking timestamp
            if (payload.new?.updated_at && payload.new.updated_at === lastUpdateRef.current) {
              console.log('⏭️ Skipping duplicate auction state update');
              return;
            }

            // Load current player details if changed
            let currentPlayer = null;
            if (payload.new?.current_player_id) {
              const { data: playerData } = await supabase
                .from('players')
                .select('*')
                .eq('id', payload.new.current_player_id)
                .single();
              currentPlayer = playerData;
            }

            // Immediately update state for live updates
            const newState = {
              ...payload.new,
              current_player: currentPlayer
            } as AuctionState;

            console.log('✅ Updating auction state in real-time:', {
              isActive: newState.is_active,
              isPaused: newState.is_paused,
              currentPlayer: currentPlayer?.name,
              playerQueueLength: newState.player_queue?.length || 0
            });

            setAuctionState(newState);
            lastUpdateRef.current = payload.new?.updated_at || '';

            // Only refresh participants if budget-related changes occurred
            if (payload.eventType === 'UPDATE' &&
                (payload.old?.current_bid !== payload.new?.current_bid ||
                 payload.old?.leading_team !== payload.new?.leading_team)) {

              if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
              }
              refreshTimeoutRef.current = setTimeout(forceRefreshParticipants, 800);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'auction_participants',
            filter: `auction_room_id=eq.${roomId}`
          },
          (payload) => {
            console.log('👥 Participants update received:', payload);

            // Only refresh participants, don't trigger full refresh
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current);
            }
            refreshTimeoutRef.current = setTimeout(forceRefreshParticipants, 1000);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'auction_bids',
            filter: `room_id=eq.${roomId}`
          },
          (payload) => {
            console.log('💰 New bid received:', payload);

            // Add new bid to recent bids without triggering full refresh
            setRecentBids(prev => [payload.new as BidData, ...prev.slice(0, 19)]);
          }
        )
        .subscribe((status) => {
          console.log('📡 Real-time subscription status:', status);
          setIsConnected(status === 'SUBSCRIBED');

          if (status === 'SUBSCRIBED') {
            console.log('🟢 Real-time connection established for room:', roomId);
          } else if (status === 'CLOSED') {
            console.log('🔴 Real-time connection closed for room:', roomId);
            setIsConnected(false);
          }
        });

      channelRef.current = channel;
    } catch (error) {
      console.error('Error setting up real-time subscriptions:', error);
      setError('Failed to connect to real-time updates');
    }
  }, [roomId, forceRefreshParticipants]);

  /**
   * Cleanup real-time subscriptions
   */
  const cleanupSubscriptions = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Initialize data and subscriptions
  useEffect(() => {
    if (!roomId) return;

    const initializeAuction = async () => {
      await refresh();
      await forceRefreshParticipants(); // Call separately to avoid circular dependency
      setupRealtimeSubscriptions();
    };

    initializeAuction();

    return () => {
      cleanupSubscriptions();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [roomId, refresh, forceRefreshParticipants, setupRealtimeSubscriptions, cleanupSubscriptions]);

  // Auction control functions
  const auctionControls = {
    startAuction: async () => {
      if (!roomId) throw new Error('Room ID is required');

      console.log('🚀 Starting auction for room:', roomId);

      try {
        // Use the utility function to load and shuffle players
        const shuffledPlayers = await loadShuffledPlayers();
        const firstPlayer = shuffledPlayers[0];

        // Get room data for timer settings
        const { data: roomData } = await supabase
          .from('auction_rooms')
          .select('timer_seconds')
          .eq('id', roomId)
          .single();

        const timerSeconds = roomData?.timer_seconds || 30;

        console.log('🔄 Starting auction with', shuffledPlayers.length, 'shuffled players');

        // Update auction state to start with properly shuffled queue
        const { error } = await supabase
          .from('auction_state')
          .update({
            is_active: true,
            is_paused: false,
            current_player_id: firstPlayer.id,
            current_player_index: 0,
            current_bid: 0,
            base_price: firstPlayer.base_price,
            leading_team: null,
            current_bidder_id: null,
            time_remaining: timerSeconds,
            total_players: shuffledPlayers.length,
            player_queue: shuffledPlayers,
            sold_players: [],
            unsold_players: [],
            updated_at: new Date().toISOString()
          })
          .eq('room_id', roomId);

        if (error) {
          console.error('Error updating auction state:', error);
          throw new Error(`Failed to start auction: ${error.message}`);
        }

        // Also update room status
        const { error: roomError } = await supabase
          .from('auction_rooms')
          .update({ status: 'active' })
          .eq('id', roomId);

        if (roomError) {
          console.warn('Warning: Could not update room status:', roomError);
        }

        console.log('✅ Auction started successfully with', shuffledPlayers.length, 'players');

        // Immediate local state update for instant UI feedback
        setAuctionState(prev => prev ? {
          ...prev,
          is_active: true,
          is_paused: false,
          current_player_id: firstPlayer.id,
          current_player: firstPlayer,
          current_player_index: 0,
          current_bid: 0,
          base_price: firstPlayer.base_price,
          time_remaining: timerSeconds,
          total_players: shuffledPlayers.length,
          player_queue: shuffledPlayers
        } : null);

        // Force refresh after a brief delay to sync with database
        setTimeout(async () => {
          await refresh();
          console.log('🔄 Forced refresh after auction start');
        }, 300);

      } catch (error) {
        console.error('❌ Failed to start auction:', error);
        throw error;
      }
    },

    pauseAuction: async () => {
      if (!roomId) throw new Error('Room ID is required');

      const { error } = await supabase
        .from('auction_state')
        .update({
          is_paused: true,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) throw error;
    },

    resumeAuction: async () => {
      if (!roomId) throw new Error('Room ID is required');

      // Get current auction state to preserve player queue
      const { data: currentState } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      // If player queue is missing, reload it from players table
      let playerQueue = currentState?.player_queue;
      if (!playerQueue || playerQueue.length === 0) {
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .order('base_price', { ascending: false });
        playerQueue = players || [];
      }

      const { error } = await supabase
        .from('auction_state')
        .update({
          is_paused: false,
          player_queue: playerQueue, // Ensure queue is preserved
          total_players: playerQueue.length,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) throw error;
    },

    nextPlayer: async () => {
      if (!roomId || !auctionState) throw new Error('Invalid state');

      console.log('🔄 Moving to next player. Current state:', {
        currentIndex: auctionState.current_player_index,
        totalPlayers: auctionState.total_players,
        queueLength: auctionState.player_queue?.length || 0,
        queueType: typeof auctionState.player_queue,
        queueIsArray: Array.isArray(auctionState.player_queue)
      });

      const currentIndex = auctionState.current_player_index;
      const nextIndex = currentIndex + 1;

      // Get the current queue and validate it - with more robust handling
      let currentQueue = auctionState.player_queue;

      // ALWAYS ensure we have a valid queue before proceeding
      if (!currentQueue || !Array.isArray(currentQueue) || currentQueue.length === 0) {
        console.log('🔧 Player queue is invalid, loading fresh data from database...');

        try {
          // Load fresh player data directly from database
          const { data: freshPlayers, error: playersError } = await supabase
            .from('players')
            .select('*')
            .order('base_price', { ascending: false });

          if (playersError) {
            console.error('❌ Error loading fresh players:', playersError);
            throw new Error('Failed to load players from database');
          }

          if (!freshPlayers || freshPlayers.length === 0) {
            throw new Error('No players found in database');
          }

          console.log(`✅ Loaded ${freshPlayers.length} fresh players from database`);

          // Update the auction state in database with fresh queue
          const { error: updateError } = await supabase
            .from('auction_state')
            .update({
              player_queue: freshPlayers,
              total_players: freshPlayers.length,
              updated_at: new Date().toISOString()
            })
            .eq('room_id', roomId);

          if (updateError) {
            console.error('❌ Error updating auction state with fresh queue:', updateError);
            throw new Error('Failed to update auction state');
          }

          // Update local state immediately
          setAuctionState(prev => prev ? {
            ...prev,
            player_queue: freshPlayers,
            total_players: freshPlayers.length
          } : null);

          // Use fresh queue for current operation
          currentQueue = freshPlayers;

          console.log('✅ Fresh player queue loaded and updated successfully');

        } catch (error) {
          console.error('❌ Failed to load fresh player queue:', error);
          throw new Error('Failed to initialize player queue: ' + (error as Error).message);
        }
      }

      // Final validation - ensure we have a valid queue
      if (!currentQueue || !Array.isArray(currentQueue) || currentQueue.length === 0) {
        throw new Error('Player queue is still invalid after loading fresh data');
      }

      // Check if we've reached the end of the auction
      if (nextIndex >= currentQueue.length) {
        console.log('🏁 Auction completed - no more players');

        // End auction
        await supabase
          .from('auction_state')
          .update({
            is_active: false,
            is_paused: true,
            updated_at: new Date().toISOString()
          })
          .eq('room_id', roomId);

        await supabase
          .from('auction_rooms')
          .update({ status: 'completed' })
          .eq('id', roomId);

        return;
      }

      // Get the next player from the validated queue
      const nextPlayer = currentQueue[nextIndex];
      if (!nextPlayer) {
        console.error('❌ Next player not found at index', nextIndex, 'in queue of length', currentQueue.length);
        throw new Error(`Next player not found at index ${nextIndex}`);
      }

      console.log('✅ Moving to next player:', nextPlayer.name || nextPlayer.id, 'at index', nextIndex);

      // Update auction state with next player
      const { error } = await supabase
        .from('auction_state')
        .update({
          current_player_id: nextPlayer.id,
          current_player_index: nextIndex,
          current_bid: 0,
          base_price: nextPlayer.base_price,
          leading_team: null,
          current_bidder_id: null,
          time_remaining: 30,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('❌ Error updating auction state for next player:', error);
        throw error;
      }

      console.log('✅ Successfully moved to next player');
    },

    // Add function to add time to the current auction timer
    addTime: async (seconds: number) => {
      if (!roomId || !auctionState) throw new Error('Invalid state');

      const newTimeRemaining = Math.max(0, auctionState.time_remaining + seconds);

      const { error } = await supabase
        .from('auction_state')
        .update({
          time_remaining: newTimeRemaining,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('❌ Error adding time to auction:', error);
        throw error;
      }

      console.log(`��� Added ${seconds} seconds to auction timer. New time: ${newTimeRemaining}`);
    },

    // Add function to mark current player as sold or unsold
    completeCurrentPlayer: async (isSold: boolean = false, winningBid: number = 0, winningTeam: string | null = null) => {
      if (!roomId || !auctionState || !auctionState.current_player) throw new Error('Invalid state');

      const currentPlayer = auctionState.current_player;
      const completedPlayer = {
        ...currentPlayer,
        final_price: isSold ? winningBid : 0,
        sold_to_team: isSold ? winningTeam : null,
        is_sold: isSold,
        completed_at: new Date().toISOString()
      };

      // Update the auction state to move completed player to appropriate array
      const updatedSoldPlayers = isSold
        ? [...(auctionState.sold_players || []), completedPlayer]
        : auctionState.sold_players || [];

      const updatedUnsoldPlayers = !isSold
        ? [...(auctionState.unsold_players || []), completedPlayer]
        : auctionState.unsold_players || [];

      // Remove the current player from the queue to prevent repetition
      const updatedQueue = [...auctionState.player_queue];
      const currentIndex = auctionState.current_player_index;

      console.log(`🏷️ Marking player as ${isSold ? 'SOLD' : 'UNSOLD'}:`, {
        player: currentPlayer.name,
        price: isSold ? winningBid : 0,
        team: isSold ? winningTeam : 'None',
        currentIndex,
        queueLength: updatedQueue.length
      });

      const { error } = await supabase
        .from('auction_state')
        .update({
          sold_players: updatedSoldPlayers,
          unsold_players: updatedUnsoldPlayers,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('❌ Error updating completed player:', error);
        throw error;
      }

      console.log('✅ Player completion recorded successfully');
    },
  };

  // Bidding actions
  const biddingActions = {
    placeBid: async (amount: number) => {
      if (!roomId || !userId || !auctionState) throw new Error('Invalid state');

      const participant = participants.find(p => p.user_id === userId);
      if (!participant) throw new Error('You are not a participant in this auction');

      if (amount <= auctionState.current_bid) {
        throw new Error('Bid must be higher than current bid');
      }

      if (amount > participant.budget_remaining) {
        throw new Error('Insufficient budget');
      }

      // Insert new bid
      const { error: bidError } = await supabase
        .from('auction_bids')
        .insert({
          room_id: roomId,
          player_id: auctionState.current_player_id,
          bidder_id: userId,
          team_id: participant.id,
          bid_amount: amount,
          is_winning_bid: true
        });

      if (bidError) throw bidError;

      // Update current bid in auction state
      const { error: stateError } = await supabase
        .from('auction_state')
        .update({
          current_bid: amount,
          leading_team: participant.team_id,
          current_bidder_id: userId,
          time_remaining: Math.max(auctionState.time_remaining, 10), // Extend time to at least 10 seconds
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (stateError) throw stateError;

      // Mark previous bids as not winning
      await supabase
        .from('auction_bids')
        .update({ is_winning_bid: false })
        .eq('room_id', roomId)
        .eq('player_id', auctionState.current_player_id)
        .neq('bidder_id', userId);
    }
  };

  return {
    auctionState,
    participants,
    recentBids,
    loading,
    error,
    isConnected,
    auctionControls,
    biddingActions,
    refresh
  };
}
