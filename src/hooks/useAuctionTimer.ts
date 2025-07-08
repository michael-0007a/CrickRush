/**
 * @fileoverview Enhanced Real-time Auction Timer Hook for CrickRush
 * Manages synchronized timer state across all users in real-time
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface TimerState {
  time_remaining: number;
  is_running: boolean;
  last_updated: string;
  room_id: string;
}

export function useAuctionTimer(roomId: string, isAuctioneer: boolean = false) {
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasExpired, setHasExpired] = useState<boolean>(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(Date.now());

  /**
   * Loads initial timer state from database
   */
  const loadTimerState = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data, error } = await supabase
        .from('auction_state')
        .select('time_remaining, is_active, is_paused, updated_at')
        .eq('room_id', roomId)
        .single();

      if (error) {
        console.error('Error loading timer state:', error);
        return;
      }

      if (data) {
        const currentTime = Date.now();
        const lastUpdate = new Date(data.updated_at).getTime();
        const timePassed = Math.floor((currentTime - lastUpdate) / 1000);

        // Calculate actual time remaining considering time passed
        const actualTimeRemaining = Math.max(0, (data.time_remaining || 0) - timePassed);

        setTimeRemaining(actualTimeRemaining);
        setIsRunning(data.is_active && !data.is_paused && actualTimeRemaining > 0);
        setHasExpired(actualTimeRemaining <= 0);
        lastSyncRef.current = currentTime;
      }
    } catch (err) {
      console.error('Error loading timer state:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  /**
   * Sets up real-time timer synchronization
   */
  const setupTimerSync = useCallback(() => {
    if (!roomId || channelRef.current) return;

    const channel = supabase
      .channel(`timer_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auction_state',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.new) {
            const currentTime = Date.now();
            const lastUpdate = new Date(payload.new.updated_at).getTime();
            const timePassed = Math.floor((currentTime - lastUpdate) / 1000);

            // Calculate synced time remaining
            const syncedTimeRemaining = Math.max(0, (payload.new.time_remaining || 0) - timePassed);

            setTimeRemaining(syncedTimeRemaining);
            setIsRunning(payload.new.is_active && !payload.new.is_paused && syncedTimeRemaining > 0);
            setHasExpired(syncedTimeRemaining <= 0);
            lastSyncRef.current = currentTime;
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, [roomId]);

  /**
   * Cleanup timer and subscriptions
   */
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  /**
   * Sync timer to database (auctioneer only)
   */
  const syncToDatabase = useCallback(async (newTime: number) => {
    if (!isAuctioneer || !roomId) return;

    try {
      await supabase
        .from('auction_state')
        .update({
          time_remaining: newTime,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);
    } catch (err) {
      console.error('Error syncing timer to database:', err);
    }
  }, [isAuctioneer, roomId]);

  /**
   * Start the local timer countdown
   */
  const startLocalTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prevTime => {
        const newTime = Math.max(0, prevTime - 1);

        if (newTime <= 0) {
          setIsRunning(false);
          setHasExpired(true);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }

        // Sync to database every 5 seconds or when time expires
        const now = Date.now();
        if (isAuctioneer && (now - lastSyncRef.current > 5000 || newTime <= 0)) {
          syncToDatabase(newTime);
          lastSyncRef.current = now;
        }

        return newTime;
      });
    }, 1000);
  }, [isAuctioneer, syncToDatabase]);

  /**
   * Timer control actions (auctioneer only)
   */
  const startTimer = useCallback(async () => {
    if (!isAuctioneer || !roomId) return;

    try {
      await supabase
        .from('auction_state')
        .update({
          is_active: true,
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);
    } catch (err) {
      console.error('Error starting timer:', err);
    }
  }, [isAuctioneer, roomId]);

  const stopTimer = useCallback(async () => {
    if (!isAuctioneer || !roomId) return;

    try {
      await supabase
        .from('auction_state')
        .update({
          is_paused: true,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);
    } catch (err) {
      console.error('Error stopping timer:', err);
    }
  }, [isAuctioneer, roomId]);

  const resetTimer = useCallback(async (newTime: number = 30) => {
    if (!isAuctioneer || !roomId) return;

    try {
      await supabase
        .from('auction_state')
        .update({
          time_remaining: newTime,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);
    } catch (err) {
      console.error('Error resetting timer:', err);
    }
  }, [isAuctioneer, roomId]);

  const addTime = useCallback(async (seconds: number) => {
    if (!isAuctioneer || !roomId) return;

    try {
      const newTime = Math.max(0, timeRemaining + seconds);
      await supabase
        .from('auction_state')
        .update({
          time_remaining: newTime,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', roomId);
    } catch (err) {
      console.error('Error adding time:', err);
    }
  }, [isAuctioneer, roomId, timeRemaining]);

  // Initialize timer
  useEffect(() => {
    loadTimerState();
    setupTimerSync();

    return cleanup;
  }, [roomId]);

  // Handle timer running state
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      startLocalTimer();
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, timeRemaining, startLocalTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    timeRemaining,
    isRunning,
    loading,
    hasExpired,
    startTimer,
    stopTimer,
    resetTimer,
    addTime
  };
}
