/**
 * @fileoverview Enhanced Real-time auction state management hook for CrickRush
 * Manages live auction data synchronization using Supabase real-time subscriptions
 * Handles current player, bidding state, participant updates, and all auction controls
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Interface representing the current auction state
 */
interface AuctionState {
  id: string;
  room_id: string;
  is_active: boolean;
  is_paused: boolean;
  current_player_id: string | null;
  current_player: any;
  current_bid: number;
  base_price: number;
  current_bidder_id: string | null;
  leading_team: string | null;
  time_remaining: number;
  current_player_index: number;
  total_players: number;
  player_queue: any[];
  sold_players: any[];
  unsold_players: any[];
  updated_at: string;
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
  players_count?: number;
  is_auctioneer?: boolean;
  team_id?: string;
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
  const participantUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Force refresh participant data from database
   */
  const forceRefreshParticipants = useCallback(async () => {
    if (!roomId) return;

    try {
      // Try multiple approaches to load participants data
      let participantsData = null;
      let participantsError = null;

      // Approach 1: Try the simplest possible query first (without created_at)
      try {
        const result = await supabase
          .from('auction_participants')
          .select('*')
          .eq('auction_room_id', roomId);

        participantsData = result.data;
        participantsError = result.error;

        if (result.error) {
          console.warn('Approach 1 failed with error:', {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
            hint: result.error.hint
          });
        } else {
          console.log('✅ Approach 1 succeeded - loaded participants:', result.data?.length || 0);
        }
      } catch (err) {
        console.warn('Approach 1 failed with exception:', err);
        participantsError = err;
      }

      // Approach 2: If first approach fails, try with specific columns only
      if (participantsError) {
        console.log('Trying alternative participant loading method...');
        try {
          const result = await supabase
            .from('auction_participants')
            .select('id, user_id, team_id, budget_remaining, is_auctioneer, auction_room_id')
            .eq('auction_room_id', roomId);

          participantsData = result.data;
          participantsError = result.error;

          if (result.error) {
            console.warn('Approach 2 failed with error:', {
              message: result.error.message,
              code: result.error.code,
              details: result.error.details,
              hint: result.error.hint
            });
          } else {
            console.log('✅ Approach 2 succeeded - loaded participants:', result.data?.length || 0);
          }
        } catch (err) {
          console.warn('Approach 2 failed with exception:', err);
          participantsError = err;
        }
      }

      // If we still have errors, log them but continue with empty array
      if (participantsError) {
        const errorDetails = {
          message: participantsError?.message || 'Unknown error',
          code: participantsError?.code || 'NO_CODE',
          details: participantsError?.details || 'No details',
          hint: participantsError?.hint || 'No hint',
          status: participantsError?.status || 'No status',
          statusText: participantsError?.statusText || 'No status text',
          name: participantsError?.name || 'Error',
          stack: participantsError?.stack || 'No stack trace'
        };

        console.error('All participant loading approaches failed:', errorDetails);
        console.warn('This might be due to RLS policies or table permissions');
        console.warn('Continuing with empty participants array - users may need to rejoin');
        setParticipants([]);
        return;
      }

      if (!participantsData || participantsData.length === 0) {
        console.log('No participants found for room:', roomId);
        setParticipants([]);
        return;
      }

      // Load user profiles and team information
      const participantsWithProfiles = await Promise.all(
        participantsData.map(async (participant) => {
          try {
            // Load user profile
            const { data: profile } = await supabase
              .from('users_profiles')
              .select('full_name, avatar_url')
              .eq('id', participant.user_id)
              .single();

            // Load team information
            let teamName = 'Unknown Team';
            let teamShortName = 'Unknown';
            if (participant.team_id) {
              const { data: teamData } = await supabase
                .from('ipl_franchises')
                .select('short_name, name')
                .eq('id', participant.team_id)
                .single();

              if (teamData?.short_name) {
                teamName = teamData.name || teamData.short_name;
                teamShortName = teamData.short_name;
              }
            }

            return {
              ...participant,
              user_name: profile?.full_name || 'Unknown User',
              user_avatar: profile?.avatar_url || null,
              team_name: teamName,
              team_short_name: teamShortName,
              budget: participant.budget_remaining || 0,
              updated_at: new Date().toISOString() // Add a default timestamp
            };
          } catch (err) {
            console.warn('Failed to load profile/team for participant:', participant.user_id, err);
            return {
              ...participant,
              user_name: 'Unknown User',
              user_avatar: null,
              team_name: 'Unknown Team',
              team_short_name: 'Unknown',
              budget: participant.budget_remaining || 0,
              updated_at: new Date().toISOString() // Add a default timestamp
            };
          }
        })
      );

      console.log('🔄 Participants refreshed successfully:', participantsWithProfiles);
      setParticipants(participantsWithProfiles);
    } catch (err) {
      console.error('Critical error in forceRefreshParticipants:', err);
      // Set empty array on critical error
      setParticipants([]);
    }
  }, [roomId]);

  /**
   * Loads the initial auction state from the database
   */
  const loadInitialState = useCallback(async () => {
    if (!roomId) return;

    try {
      setLoading(true);
      setError(null);

      // Load auction state
      const { data: auctionData, error: auctionError } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (auctionError && auctionError.code !== 'PGRST116') {
        setError('Failed to load auction state');
        return;
      }

      // Load current player details if available
      let currentPlayer = null;
      if (auctionData?.current_player_id) {
        const { data: playerData } = await supabase
          .from('players')
          .select('*')
          .eq('id', auctionData.current_player_id)
          .single();
        currentPlayer = playerData;
      }

      // Load participants
      await forceRefreshParticipants();

      // Load recent bids with better error handling
      const { data: bidsData, error: bidsError } = await supabase
        .from('auction_bids')
        .select(`
          *,
          players (
            name,
            role,
            country
          )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (bidsError) {
        console.error('Failed to load bids:', bidsError);
        setRecentBids([]);
      } else {
        setRecentBids(bidsData || []);
      }

      // Set auction state
      if (auctionData) {
        setAuctionState({
          ...auctionData,
          current_player: currentPlayer
        });
        lastUpdateRef.current = auctionData.updated_at;
      }

    } catch (err) {
      console.error('Error loading initial state:', err);
      setError('Failed to load auction data');
    } finally {
      setLoading(false);
    }
  }, [roomId, forceRefreshParticipants]);

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

            // Prevent duplicate updates
            if (payload.new?.updated_at === lastUpdateRef.current) {
              console.log('⏭️ Skipping duplicate update');
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

            console.log('✅ Applying real-time auction state update:', newState);
            setAuctionState(newState);
            lastUpdateRef.current = payload.new?.updated_at || '';

            // Force refresh participants after state changes to ensure budget sync
            if (participantUpdateTimeoutRef.current) {
              clearTimeout(participantUpdateTimeoutRef.current);
            }
            participantUpdateTimeoutRef.current = setTimeout(() => {
              forceRefreshParticipants();
            }, 100);
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
          async (payload) => {
            console.log('👥 Participants update received:', payload);

            if (payload.eventType === 'INSERT') {
              // Load user profile and team info for new participant
              try {
                const { data: profile } = await supabase
                  .from('users_profiles')
                  .select('full_name, avatar_url')
                  .eq('id', payload.new.user_id)
                  .single();

                let teamName = 'Unknown Team';
                if (payload.new.team_id) {
                  const { data: teamData } = await supabase
                    .from('ipl_franchises')
                    .select('short_name, name')
                    .eq('id', payload.new.team_id)
                    .single();

                  if (teamData?.short_name) {
                    teamName = teamData.name || teamData.short_name;
                  }
                }

                const newParticipant = {
                  ...payload.new,
                  user_name: profile?.full_name || 'Unknown User',
                  user_avatar: profile?.avatar_url || null,
                  team_name: teamName,
                  budget: payload.new.budget_remaining || 0
                } as ParticipantData;

                setParticipants(prev => [...prev, newParticipant]);
              } catch (err) {
                console.error('Error loading new participant details:', err);
                // Force refresh on error
                await forceRefreshParticipants();
              }
            } else if (payload.eventType === 'UPDATE') {
              console.log('💰 Budget update for participant:', payload.new.id);

              // Update participant immediately for live budget updates
              setParticipants(prev =>
                prev.map(p => {
                  if (p.id === payload.new?.id) {
                    return {
                      ...p,
                      budget_remaining: payload.new.budget_remaining,
                      budget: payload.new.budget_remaining,
                      ...payload.new
                    } as ParticipantData;
                  }
                  return p;
                })
              );
            } else if (payload.eventType === 'DELETE') {
              setParticipants(prev => prev.filter(p => p.id !== payload.old?.id));
            }
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
          async (payload) => {
            console.log('💰 New bid received:', payload);

            // Load player details for the bid
            let bidWithPlayer = payload.new as BidData;
            try {
              const { data: playerData } = await supabase
                .from('players')
                .select('name, role, country')
                .eq('id', payload.new.player_id)
                .single();

              bidWithPlayer = {
                ...payload.new,
                players: playerData
              } as any;
            } catch (err) {
              console.warn('Could not load player details for bid');
            }

            setRecentBids(prev => [bidWithPlayer, ...prev.slice(0, 49)]);
          }
        )
        .subscribe((status) => {
          console.log('🔗 Realtime subscription status:', status);
          setIsConnected(status === 'SUBSCRIBED');

          if (status === 'SUBSCRIBED') {
            console.log('✅ Real-time connection established');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Real-time connection error');
            setError('Real-time connection failed');
          }
        });

      channelRef.current = channel;
    } catch (err) {
      console.error('Error setting up realtime subscriptions:', err);
      setError('Failed to connect to real-time updates');
    }
  }, [roomId, forceRefreshParticipants]);

  /**
   * Cleanup subscriptions
   */
  const cleanupSubscriptions = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (participantUpdateTimeoutRef.current) {
      clearTimeout(participantUpdateTimeoutRef.current);
      participantUpdateTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  /**
   * Auction control actions for auctioneer
   */
  const auctionControls = {
    startAuction: async () => {
      if (!roomId) return;

      const { error } = await supabase
        .from('auction_state')
        .update({
          is_active: true,
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error starting auction:', error);
        throw error;
      }
    },

    pauseAuction: async () => {
      if (!roomId) return;

      const { error } = await supabase
        .from('auction_state')
        .update({
          is_paused: true,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error pausing auction:', error);
        throw error;
      }
    },

    resumeAuction: async () => {
      if (!roomId) return;

      const { error } = await supabase
        .from('auction_state')
        .update({
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error resuming auction:', error);
        throw error;
      }
    },

    nextPlayer: async () => {
      if (!roomId || !auctionState) return;

      const nextIndex = (auctionState.current_player_index || 0) + 1;
      const nextPlayer = auctionState.player_queue?.[nextIndex];

      const { error } = await supabase
        .from('auction_state')
        .update({
          current_player_index: nextIndex,
          current_player_id: nextPlayer?.id || null,
          current_bid: 0,
          base_price: nextPlayer?.base_price || 50,
          current_bidder_id: null,
          leading_team: null,
          time_remaining: 30,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error moving to next player:', error);
        throw error;
      }
    },

    resetTimer: async () => {
      if (!roomId) return;

      const { error } = await supabase
        .from('auction_state')
        .update({
          time_remaining: 30,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error resetting timer:', error);
        throw error;
      }
    },

    addTime: async (seconds: number) => {
      if (!roomId || !auctionState) return;

      const { error } = await supabase
        .from('auction_state')
        .update({
          time_remaining: (auctionState.time_remaining || 0) + seconds,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (error) {
        console.error('Error adding time:', error);
        throw error;
      }
    }
  };

  /**
   * Bidding actions for participants
   */
  const biddingActions = {
    placeBid: async (amount: number) => {
      if (!roomId || !userId || !auctionState?.current_player_id) return;

      // Find participant to update their budget
      const participant = participants.find(p => p.user_id === userId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      if (!participant.team_id) {
        throw new Error('You need to select a team before placing bids');
      }

      // Insert bid record with team_id
      const { error: bidError } = await supabase
        .from('auction_bids')
        .insert({
          room_id: roomId,
          player_id: auctionState.current_player_id,
          bidder_id: userId,
          team_id: participant.team_id, // Add the required team_id
          bid_amount: amount
        });

      if (bidError) {
        console.error('Error placing bid:', bidError);
        throw bidError;
      }

      // Update auction state with leading team
      const { error: stateError } = await supabase
        .from('auction_state')
        .update({
          current_bid: amount,
          current_bidder_id: userId,
          leading_team: participant.team_id, // Set the leading team
          time_remaining: 30, // Reset timer on bid
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);

      if (stateError) {
        console.error('Error updating auction state:', stateError);
        throw stateError;
      }
    }
  };

  // Initialize and setup subscriptions
  useEffect(() => {
    loadInitialState();
    setupRealtimeSubscriptions();

    return () => {
      cleanupSubscriptions();
    };
  }, [roomId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, []);

  return {
    auctionState,
    participants,
    recentBids,
    loading,
    error,
    isConnected,
    auctionControls,
    biddingActions,
    refresh: loadInitialState
  };
}
