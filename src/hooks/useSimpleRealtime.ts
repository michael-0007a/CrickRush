/**
 * @fileoverview Enhanced real-time updates for auction with comprehensive synchronization
 * Ensures all auction actions are immediately synced across all users
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useSimpleRealtime(roomId: string, onUpdate?: () => void) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  // Update the ref when onUpdate changes to avoid recreating the effect
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const triggerUpdate = useCallback(() => {
    console.log('🔄 Real-time update triggered');
    setLastUpdateTime(Date.now());
    if (onUpdateRef.current) {
      onUpdateRef.current();
    }
  }, []);

  const setupConnection = useCallback(() => {
    if (!roomId) return;

    // Clean up existing connection first
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    console.log('🚀 Setting up comprehensive real-time connection for room:', roomId);

    // Create comprehensive channel for all auction-related updates
    const channel = supabase
      .channel(`auction-realtime-${roomId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: roomId }
        }
      })
      // Auction state changes (bids, pause, resume, timer, current player, etc.)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_state',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('🎯 Auction state changed:', payload.eventType, payload.new);
          triggerUpdate();
        }
      )
      // Participant changes (budget updates, team changes)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_participants',
          filter: `auction_room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('👥 Participant data changed:', payload.eventType, payload.new);
          triggerUpdate();
        }
      )
      // Player purchases/sales (for squad updates)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_players',
          filter: `auction_room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('💰 Player purchase/sale:', payload.eventType, payload.new);
          triggerUpdate();
        }
      )
      // Room status changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          console.log('🏠 Room status changed:', payload.eventType, payload.new);
          triggerUpdate();
        }
      )
      // Bidding history updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bidding_history'
        },
        (payload) => {
          // Only trigger if it's for this room's current auction
          if (payload.new && payload.new.auction_room_id === roomId) {
            console.log('📈 Bidding history updated:', payload.eventType);
            triggerUpdate();
          }
        }
      )
      // Broadcast channel for instant updates
      .on('broadcast', { event: 'auction_update' }, (payload) => {
        console.log('📡 Broadcast update received:', payload);
        triggerUpdate();
      })
      .subscribe((status) => {
        console.log('📡 Real-time connection status:', status);

        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time connection established for room:', roomId);
          setIsConnected(true);
          // Trigger initial update when connected
          triggerUpdate();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time connection error - attempting to reconnect...');
          setIsConnected(false);

          // Attempt to reconnect after a short delay
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect real-time...');
            setupConnection();
          }, 2000);
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Real-time connection closed');
          setIsConnected(false);

          // Attempt to reconnect
          setTimeout(() => {
            console.log('🔄 Reconnecting after connection closed...');
            setupConnection();
          }, 1000);
        } else {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;
  }, [roomId, triggerUpdate]);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      console.log('🧹 Cleaning up real-time connection');
      channelRef.current.unsubscribe();
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    setupConnection();
    return cleanup;
  }, [setupConnection, cleanup]);

  // Auto-reconnect if connection is lost
  useEffect(() => {
    if (!isConnected && roomId) {
      const reconnectTimer = setTimeout(() => {
        console.log('🔄 Attempting to reconnect real-time...');
        cleanup();
        setupConnection();
      }, 3000);

      return () => clearTimeout(reconnectTimer);
    }
  }, [isConnected, roomId, cleanup, setupConnection]);

  return {
    isConnected,
    lastUpdateTime,
    forceUpdate: triggerUpdate
  };
}
