/**
 * @fileoverview Enhanced Real-time auction state management hook for CrickRush
 * Manages live auction data synchronization using Supabase real-time subscriptions
 * Handles current player, bidding state, participant updates, and all auction controls
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SAMPLE_PLAYERS } from '@/types/auction';

/**
 * Room-specific Fisher-Yates shuffle for consistent randomness per room
 * This function is now deprecated - shuffling is handled by usePlayerQueue
 */
function shufflePlayersWithSeed<T>(players: T[], seed: string): T[] {
  // This function is kept for backward compatibility but is no longer used
  // The usePlayerQueue hook now handles all player shuffling
  return [...players];
}

/**
 * Load and shuffle players for the auction with room-specific randomization
 */
async function loadShuffledPlayers(roomId?: string): Promise<any[]> {
  try {
    // First try to load players from database
    const { data: players, error } = await supabase
      .from('players')
      .select('*')
      .order('base_price', { ascending: false });

    let playersToShuffle = players && players.length > 0 ? players : SAMPLE_PLAYERS;

    // Create room-specific seed that doesn't change over time for the same room
    const roomSeed = roomId ? `auction_room_${roomId}_shuffle` : `fallback_${Date.now()}`;

    return shufflePlayersWithSeed(playersToShuffle, roomSeed);
  } catch (error) {
    // Fallback to sample players on any error with room-specific shuffle
    const seed = roomId ? `error_room_${roomId}_shuffle` : `error-fallback-${Date.now()}`;
    return shufflePlayersWithSeed(SAMPLE_PLAYERS, seed);
  }
}

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
  // Add sale notification for real-time broadcasting
  sale_notification?: {
    player_name: string;
    team_name: string;
    sold_amount: number;
    timestamp: string;
  } | null;
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
 * Now accepts shuffled players from usePlayerQueue to avoid duplication
 */
export function useAuctionRealtime(
  roomId: string,
  userId: string | null = null,
  shuffledPlayers: Player[] = []
) {
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
      setParticipants([]);
      return;
    }

    try {
      // Get auction participants - Fix: use correct column name
      const { data: participantsData, error: participantsError } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', roomId); // Fixed: was 'room_id', should be 'auction_room_id'

      if (participantsError) {
        setParticipants([]);
        return;
      }

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
            // Silent error handling for user profile loading
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
              // Silent error handling for franchise loading
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

        setParticipants(enrichedParticipants);
      } else {
        setParticipants([]);
      }

    } catch (error) {
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
        setError('Failed to load auction state');
        return;
      }

      // Ensure player_queue is always an array and properly populated
      if (stateData) {
        // If player_queue is missing or empty, load players from database
        if (!stateData.player_queue || !Array.isArray(stateData.player_queue) || stateData.player_queue.length === 0) {

          try {
            const { data: players, error: playersError } = await supabase
              .from('players')
              .select('*')
              .order('base_price', { ascending: false });

            if (playersError) {
              stateData.player_queue = [];
            } else {
              stateData.player_queue = players || [];
            }
          } catch (error) {
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
            // Prevent duplicate updates by checking timestamp
            if (payload.new?.updated_at && payload.new.updated_at === lastUpdateRef.current) {
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
        // Add subscription for auction room status changes
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'auction_rooms',
            filter: `id=eq.${roomId}`
          },
          (payload) => {
            // If room status changed to completed, trigger page refresh
            if (payload.new?.status === 'completed') {
              // Force a page refresh to show the "Auction Has Ended" page
              window.location.reload();
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
            // Add new bid to recent bids without triggering full refresh
            setRecentBids(prev => [payload.new as BidData, ...prev.slice(0, 19)]);
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');

          if (status === 'CLOSED') {
            setIsConnected(false);
          }
        });

      channelRef.current = channel;
    } catch (error) {
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
        // Use the shuffled players provided by usePlayerQueue instead of loading our own
        if (!shuffledPlayers || shuffledPlayers.length === 0) {
          throw new Error('No shuffled players provided. Make sure usePlayerQueue is loaded first.');
        }

        const firstPlayer = shuffledPlayers[0];

        // Get room data for timer settings
        const { data: roomData } = await supabase
          .from('auction_rooms')
          .select('timer_seconds')
          .eq('id', roomId)
          .single();

        const timerSeconds = roomData?.timer_seconds || 30;

        console.log(`🔄 Starting auction with ${shuffledPlayers.length} shuffled players for room ${roomId}`);
        console.log(`🎯 Starting with player: ${firstPlayer.name}`);

        // Update auction state to start with the properly shuffled queue from usePlayerQueue
        const { error } = await supabase
          .from('auction_state')
          .update({
            is_active: true,
            is_paused: false,
            current_player_id: firstPlayer.id,
            current_player_index: 0,
            current_bid: 0,
            base_price: firstPlayer.basePrice || firstPlayer.base_price,
            leading_team: null,
            current_bidder_id: null,
            time_remaining: timerSeconds,
            total_players: shuffledPlayers.length,
            player_queue: shuffledPlayers, // Use the shuffled players from usePlayerQueue
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
          base_price: firstPlayer.basePrice || firstPlayer.base_price,
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

      // Ensure we have a valid player queue - if missing, reload with fresh randomization
      let playerQueue = currentState?.player_queue;
      if (!playerQueue || !Array.isArray(playerQueue) || playerQueue.length === 0) {
        console.log('🔧 Player queue missing during resume, reloading with fresh randomization...');
        const shuffledPlayers = await loadShuffledPlayers();
        playerQueue = shuffledPlayers;
      }

      // Update database first, then immediately update local state
      const { error } = await supabase
        .from('auction_state')
        .update({
          is_paused: false,
          player_queue: playerQueue, // Ensure queue is preserved/restored
          total_players: playerQueue.length,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) throw error;

      // Immediate local state update to prevent UI flicker
      setAuctionState(prev => prev ? {
        ...prev,
        is_paused: false,
        player_queue: playerQueue,
        total_players: playerQueue.length
      } : null);
    },

    nextPlayer: async () => {
      if (!roomId || !auctionState) throw new Error('Invalid state');

      // PAUSE AUCTION FIRST - Ensure clean state transition
      if (auctionState.is_active && !auctionState.is_paused) {
        console.log('⏸️ Pausing auction before moving to next player...');
        await supabase
          .from('auction_state')
          .update({
            is_paused: true,
            updated_at: new Date().toISOString()
          })
          .eq('room_id', roomId);

        // Wait for pause to take effect
        await new Promise(resolve => setTimeout(resolve, 500));
      }

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

      // If queue is invalid, use the shuffled players from usePlayerQueue instead of reloading from DB
      if (!currentQueue || !Array.isArray(currentQueue) || currentQueue.length === 0) {
        console.log('🔧 Player queue is invalid, using shuffled players from usePlayerQueue...');

        if (!shuffledPlayers || shuffledPlayers.length === 0) {
          throw new Error('No shuffled players available from usePlayerQueue. Make sure usePlayerQueue is loaded first.');
        }

        console.log(`✅ Using ${shuffledPlayers.length} shuffled players from usePlayerQueue`);

        // Update the auction state in database with shuffled queue
        const { error: updateError } = await supabase
          .from('auction_state')
          .update({
            player_queue: shuffledPlayers,
            total_players: shuffledPlayers.length,
            updated_at: new Date().toISOString()
          })
          .eq('room_id', roomId);

        if (updateError) {
          console.error('❌ Error updating auction state with shuffled queue:', updateError);
          throw new Error('Failed to update auction state');
        }

        // Update local state immediately
        setAuctionState(prev => prev ? {
          ...prev,
          player_queue: shuffledPlayers,
          total_players: shuffledPlayers.length
        } : null);

        // Use shuffled queue for current operation
        currentQueue = shuffledPlayers;

        console.log('✅ Shuffled player queue restored successfully');
      }

      // Final validation - ensure we have a valid queue
      if (!currentQueue || !Array.isArray(currentQueue) || currentQueue.length === 0) {
        throw new Error('Player queue is still invalid after using shuffled players');
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

      // Get room data for timer settings
      const { data: roomData } = await supabase
        .from('auction_rooms')
        .select('timer_seconds')
        .eq('id', roomId)
        .single();

      const timerSeconds = roomData?.timer_seconds || 30;

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
          time_remaining: timerSeconds, // Use room's timer setting instead of hardcoded 30
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

      // PAUSE AUCTION FIRST - Ensure clean state transition
      if (auctionState.is_active && !auctionState.is_paused) {
        console.log('⏸️ Pausing auction before adding time...');
        await supabase
          .from('auction_state')
          .update({
            is_paused: true,
            updated_at: new Date().toISOString()
          })
          .eq('room_id', roomId);

        // Wait for pause to take effect
        await new Promise(resolve => setTimeout(resolve, 500));
      }

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

      console.log(`⏰ Added ${seconds} seconds to auction timer. New time: ${newTimeRemaining}`);
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

      // Enhanced budget validation with detailed messages
      if (amount > participant.budget_remaining) {
        const shortfall = amount - participant.budget_remaining;
        throw new Error(`Insufficient budget! You need ₹${shortfall}L more. Your remaining budget: ₹${participant.budget_remaining}L`);
      }

      // Check if auction is active
      if (!auctionState.is_active || auctionState.is_paused) {
        throw new Error('Cannot place bid when auction is paused or inactive');
      }

      // Check if there's a current player
      if (!auctionState.current_player_id) {
        throw new Error('No player is currently up for auction');
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
    },

    // Helper function to check if a user can afford a bid
    canAffordBid: (amount: number, userIdToCheck: string): { canAfford: boolean; message?: string } => {
      const participant = participants.find(p => p.user_id === userIdToCheck);
      if (!participant) {
        return { canAfford: false, message: 'Participant not found' };
      }

      if (amount > participant.budget_remaining) {
        const shortfall = amount - participant.budget_remaining;
        return {
          canAfford: false,
          message: `Insufficient budget! Need ₹${shortfall}L more. Remaining: ₹${participant.budget_remaining}L`
        };
      }

      return { canAfford: true };
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
