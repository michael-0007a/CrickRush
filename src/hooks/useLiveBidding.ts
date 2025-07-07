/**
 * @fileoverview Custom hook for managing live bidding functionality in auction rooms
 * Handles real-time bid updates, auction state management, and bid placement using Supabase only
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Interface representing a bid in the auction
 */
interface Bid {
  id: string;
  room_id: string;
  participant_id: string;
  team_id: string;
  amount: number;
  timestamp: string;
  bidder_name: string;
  team_name: string;
}

/**
 * Interface representing the current auction state
 */
interface AuctionState {
  is_active: boolean;
  is_paused: boolean;
  current_player: any;
  current_bid: number;
  leading_team: string | null;
  leading_bidder: string | null;
  time_remaining: number;
}

/**
 * Custom hook to manage live bidding functionality with Supabase real-time subscriptions
 *
 * @param roomId - The ID of the auction room
 * @param userId - The ID of the current user (not participant ID)
 * @returns Object containing bid data, auction state, and bidding functions
 */
export function useLiveBidding(roomId: string, userId: string | null) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [auctionState, setAuctionState] = useState<AuctionState>({
    is_active: false,
    is_paused: false,
    current_player: null,
    current_bid: 0,
    leading_team: null,
    leading_bidder: null,
    time_remaining: 30
  });
  const [loading, setLoading] = useState(false);

  /**
   * Loads the current auction state from the database
   */
  const loadAuctionState = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data: state } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (state) {
        setAuctionState({
          is_active: state.is_active,
          is_paused: state.is_paused,
          current_player: state.current_player,
          current_bid: state.current_bid || 0,
          leading_team: state.leading_team,
          leading_bidder: state.leading_bidder,
          time_remaining: state.time_remaining || 30
        });
      }
    } catch (error) {
      console.error('Error loading auction state:', error);
    }
  }, [roomId]);

  /**
   * Loads recent bids and enriches them with user and team information
   */
  const loadBids = useCallback(async () => {
    if (!roomId) return;

    try {
      // First, let's try a simpler query without the user_name column
      const { data: rawBids } = await supabase
        .from('auction_bids')
        .select(`
          *,
          auction_participants!inner (
            team_id
          )
        `)
        .eq('room_id', roomId)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (rawBids) {
        const enrichedBids: Bid[] = rawBids.map(bid => ({
          id: bid.id,
          room_id: bid.room_id,
          participant_id: bid.user_id,
          team_id: bid.team_id,
          amount: bid.amount,
          timestamp: bid.timestamp,
          bidder_name: 'Bidder', // Use generic name since user_name doesn't exist
          team_name: bid.team_id || 'Unknown Team'
        }));

        setBids(enrichedBids);

        // Update auction state with latest bid info
        if (enrichedBids.length > 0) {
          const latestBid = enrichedBids[0];
          setAuctionState(prev => ({
            ...prev,
            current_bid: latestBid.amount,
            leading_team: latestBid.team_id,
            leading_bidder: latestBid.bidder_name
          }));
        }
      }
    } catch (error) {
      console.error('Error loading bids:', error);
    }
  }, [roomId]);

  /**
   * Places a bid for the current player in the auction
   */
  const placeBid = useCallback(async (amount: number) => {
    if (!roomId || !userId) {
      throw new Error('Missing room ID or user ID');
    }

    setLoading(true);
    try {
      console.log('🔍 Debug: Attempting to place bid with:', { roomId, userId, amount });

      // First, let's try a simpler query to see if we can access the table at all
      const { data: allParticipants, error: listError } = await supabase
        .from('auction_participants')
        .select('*')
        .eq('auction_room_id', roomId);

      console.log('🔍 Debug: All participants in room:', { allParticipants, listError });

      // Now try the specific query without user_name column
      const { data: participant, error: participantError } = await supabase
        .from('auction_participants')
        .select('team_id, user_id, id')
        .eq('user_id', userId)
        .eq('auction_room_id', roomId)
        .maybeSingle(); // Use maybeSingle instead of single to avoid throwing on no results

      console.log('🔍 Debug: Participant query result:', { participant, participantError });

      if (participantError) {
        console.error('Error fetching participant:', participantError);
        throw new Error(`Database error: ${participantError.message || 'Unknown error'}`);
      }

      if (!participant) {
        console.log('🔍 Debug: No participant found for userId:', userId, 'in room:', roomId);
        throw new Error('You are not registered for this auction. Please join the auction first.');
      }

      if (!participant.team_id) {
        throw new Error('You need to select a team before placing bids. Please refresh the page and try again.');
      }

      console.log('✅ Debug: Participant found:', participant);

      // Get current auction state to validate bid
      const { data: auctionStateData, error: stateError } = await supabase
        .from('auction_state')
        .select('current_player, current_bid, is_active, is_paused')
        .eq('room_id', roomId)
        .single();

      if (stateError) {
        console.error('Error fetching auction state:', stateError);
        throw new Error('Unable to get current auction state. Please try again.');
      }

      if (!auctionStateData?.current_player?.id) {
        throw new Error('No current player found in auction');
      }

      if (!auctionStateData.is_active || auctionStateData.is_paused) {
        throw new Error('Auction is not currently active');
      }

      // Validate minimum bid amount
      const currentBid = auctionStateData.current_bid || 0;
      const basePrice = auctionStateData.current_player.base_price || 50;
      const minimumBid = currentBid === 0 ? basePrice : currentBid + 25;

      if (amount < minimumBid) {
        throw new Error(`Bid must be at least ₹${minimumBid}L`);
      }

      console.log('🔍 Debug: Placing bid with data:', {
        room_id: roomId,
        user_id: userId,
        team_id: participant.team_id,
        player_id: auctionStateData.current_player.id,
        amount: amount
      });

      // Insert bid into database
      const { error: bidError } = await supabase
        .from('auction_bids')
        .insert({
          room_id: roomId,
          user_id: userId,
          team_id: participant.team_id,
          player_id: auctionStateData.current_player.id,
          amount: amount,
          timestamp: new Date().toISOString()
        });

      if (bidError) {
        console.error('Error inserting bid:', bidError);
        throw new Error('Failed to place bid. Please try again.');
      }

      console.log('🔍 Debug: Bid inserted successfully, now updating auction state...');

      // Update local auction state immediately since the bid was successful
      setAuctionState(prev => ({
        ...prev,
        current_bid: amount,
        leading_team: participant.team_id,
        leading_bidder: 'Bidder',
        time_remaining: Math.min(prev.time_remaining + 5, 60) // Add 5 seconds, max 60 seconds
      }));

      console.log('✅ Local auction state updated immediately');

      // Try to update database auction state (but don't fail if this doesn't work)
      try {
        const { data: existingState, error: checkError } = await supabase
          .from('auction_state')
          .select('*')
          .eq('room_id', roomId)
          .maybeSingle();

        console.log('🔍 Debug: Existing auction state check:', { existingState, checkError, roomId });

        const newTimeRemaining = Math.min((existingState?.time_remaining || 0) + 5, 60);

        const updateData = {
          current_bid: amount,
          leading_team: participant.team_id,
          leading_bidder: 'Bidder',
          time_remaining: newTimeRemaining
        };

        console.log('🔍 Debug: Auction state update data:', updateData);

        if (existingState) {
          console.log('🔍 Debug: Updating existing auction state...');
          const result = await supabase
            .from('auction_state')
            .update(updateData)
            .eq('room_id', roomId);

          if (result.error) {
            console.log('⚠️ Database auction state update failed, but local state is updated:', result.error);
          } else {
            console.log('✅ Database auction state updated successfully');
          }
        } else {
          console.log('🔍 Debug: No existing auction state found - skipping database update');
        }
      } catch (dbError) {
        console.log('⚠️ Database auction state update failed, but local state is updated:', dbError);
      }

      console.log('✅ Bid placed successfully:', amount);

    } catch (error) {
      console.error('Error placing bid:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  /**
   * Setup real-time subscriptions for database changes
   */
  useEffect(() => {
    if (!roomId) return;

    console.log('🔍 Setting up real-time subscriptions for room:', roomId);

    // Load initial data
    loadAuctionState();
    loadBids();

    // Subscribe to auction state changes
    const stateSubscription = supabase
      .channel(`auction_state_${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_state',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        console.log('🔴 Real-time auction state update received:', payload);
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const newState = payload.new;

          setAuctionState(prev => {
            const incomingBid = newState.current_bid || 0;
            const currentBid = prev.current_bid || 0;

            // Check if this is a player change (different player ID)
            const isPlayerChange = prev.current_player?.id !== newState.current_player?.id;

            console.log('🔄 Auction state update:', {
              isPlayerChange,
              incomingBid,
              currentBid,
              newPlayer: newState.current_player?.name,
              prevPlayer: prev.current_player?.name
            });

            // If player changed, always use the new state (reset bids)
            // Otherwise, only update current_bid if incoming bid is higher
            if (isPlayerChange) {
              console.log('🔄 Player changed - resetting to new state');
              return {
                is_active: newState.is_active,
                is_paused: newState.is_paused,
                current_player: newState.current_player,
                current_bid: incomingBid, // Use incoming bid (should be 0 for new player)
                leading_team: newState.leading_team,
                leading_bidder: newState.leading_bidder,
                time_remaining: newState.time_remaining || 30
              };
            } else {
              // Same player, only update if incoming bid is higher
              // For timer: use the higher of incoming time or current time to prevent reversion
              const incomingTime = newState.time_remaining || 30;
              const currentTime = prev.time_remaining || 30;

              return {
                is_active: newState.is_active,
                is_paused: newState.is_paused,
                current_player: newState.current_player,
                current_bid: Math.max(incomingBid, currentBid), // Keep the higher bid
                leading_team: incomingBid > currentBid ? newState.leading_team : prev.leading_team,
                leading_bidder: incomingBid > currentBid ? newState.leading_bidder : prev.leading_bidder,
                time_remaining: Math.max(incomingTime, currentTime) // Keep the higher time to prevent timer reversion
              };
            }
          });
        }
      })
      .subscribe();

    // Subscribe to bid changes - more comprehensive approach
    const bidSubscription = supabase
      .channel(`auction_bids_${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'auction_bids',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        console.log('🔴 Real-time bid update received:', payload);

        // Immediately reload bids when new bid is inserted
        loadBids();

        // Also update local state immediately if this is a new bid
        if (payload.new) {
          const newBid = payload.new;
          setAuctionState(prev => ({
            ...prev,
            current_bid: newBid.amount,
            leading_team: newBid.team_id,
            leading_bidder: 'Bidder',
            time_remaining: Math.min(prev.time_remaining + 5, 60) // Add 5 seconds for new bids, max 60
          }));
        }
      })
      .subscribe();

    // Add subscription status logging
    stateSubscription.subscribe((status) => {
      console.log('🔍 Auction state subscription status:', status);
    });

    bidSubscription.subscribe((status) => {
      console.log('🔍 Bid subscription status:', status);
    });

    // Cleanup function
    return () => {
      console.log('🔍 Cleaning up real-time subscriptions for room:', roomId);
      stateSubscription.unsubscribe();
      bidSubscription.unsubscribe();
    };
  }, [roomId, loadAuctionState, loadBids]);

  return {
    bids,
    auctionState,
    loading,
    placeBid,
    refetch: () => {
      loadAuctionState();
      loadBids();
    }
  };
}
