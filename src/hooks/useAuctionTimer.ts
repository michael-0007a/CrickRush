/**
 * @fileoverview Synchronized auction timer hook for CrickRush
 * Manages real-time synchronized countdown timer across all auction participants
 * Automatically adds time when bids are placed and handles pause/resume functionality
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Interface representing the timer state in the database
 */
interface TimerState {
  /** Remaining time in seconds */
  time_remaining: number;
  /** Whether the timer is currently running */
  is_running: boolean;
  /** Timestamp of last timer update */
  last_updated: string;
  /** Server timestamp for synchronization */
  server_time: string;
}

/**
 * Custom hook for managing synchronized auction timer
 *
 * @param roomId - The auction room ID to sync timer with
 * @param isAuctioneer - Whether the current user is the auctioneer (can control timer)
 * @returns Object containing timer state and control functions
 *
 * @example
 * ```typescript
 * const {
 *   timeRemaining,
 *   isRunning,
 *   loading,
 *   hasExpired,
 *   startTimer,
 *   stopTimer,
 *   resetTimer,
 *   addTime
 * } = useAuctionTimer(roomId, isAuctioneer);
 * ```
 */
export function useAuctionTimer(roomId: string, isAuctioneer: boolean = false) {
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasExpired, setHasExpired] = useState<boolean>(false);

  // Refs for managing intervals and synchronization
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);
  const serverTimeOffsetRef = useRef<number>(0);

  /**
   * Calculates the time offset between client and server
   * Used for accurate timer synchronization across all users
   */
  const calculateServerTimeOffset = useCallback(async () => {
    try {
      const clientTime = Date.now();

      // Try to get server time, but provide fallback if function doesn't exist
      const { data, error } = await supabase.rpc('get_server_time');

      if (error) {
        // Fallback: assume no offset if server function doesn't exist
        serverTimeOffsetRef.current = 0;
        return;
      }

      const serverTime = new Date(data).getTime();
      serverTimeOffsetRef.current = serverTime - clientTime;

    } catch (error) {
      // Fallback: assume no offset if there's any error
      serverTimeOffsetRef.current = 0;
    }
  }, []);

  /**
   * Get current synchronized time
   * Accounts for server time offset
   */
  const getCurrentTime = useCallback(() => {
    return Date.now() + serverTimeOffsetRef.current;
  }, []);

  /**
   * Loads the current timer state from the database
   * Initializes timer values and starts the countdown
   */
  const loadTimerState = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data: timerData, error } = await supabase
        .from('auction_timer')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // Fallback: use default timer values if table doesn't exist
        setTimeRemaining(30);
        setIsRunning(false);
        setLoading(false);
        return;
      }

      if (timerData) {
        const lastUpdated = new Date(timerData.last_updated).getTime();
        const currentTime = getCurrentTime();

        // Calculate elapsed time since last update
        const elapsedMs = currentTime - lastUpdated;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);

        // Calculate remaining time
        let remainingTime = timerData.time_remaining;

        if (timerData.is_running && elapsedSeconds > 0) {
          remainingTime = Math.max(0, timerData.time_remaining - elapsedSeconds);
        }

        setTimeRemaining(remainingTime);
        setIsRunning(timerData.is_running && remainingTime > 0);
      } else {
        // No timer data found, use defaults
        setTimeRemaining(30);
        setIsRunning(false);
      }
    } catch (error) {
      // Fallback: use default timer values
      setTimeRemaining(30);
      setIsRunning(false);
    } finally {
      setLoading(false);
    }
  }, [roomId, getCurrentTime]);

  /**
   * Updates the timer state in the database
   * Auctioneer only - syncs the current timer values to the server
   *
   * @param newTime - The new time remaining in seconds
   * @param running - Whether the timer is running or paused
   */
  const updateTimerState = useCallback(async (newTime: number, running: boolean) => {
    if (!roomId || !isAuctioneer) return;

    try {
      const currentTime = getCurrentTime();

      const { error } = await supabase
        .from('auction_timer')
        .upsert({
          room_id: roomId,
          time_remaining: newTime,
          is_running: running,
          last_updated: new Date(currentTime).toISOString(),
          server_time: new Date(currentTime).toISOString()
        }, {
          onConflict: 'room_id'
        });

      if (error) {
        // Continue with local timer even if database update fails
      }
    } catch (error) {
      // Continue with local timer even if database update fails
    }
  }, [roomId, isAuctioneer, getCurrentTime]);

  /**
   * Starts the auction timer
   * Only auctioneer can start the timer
   *
   * @param duration - Timer duration in seconds (default: 30)
   */
  const startTimer = useCallback(async (duration: number = 30) => {
    if (!isAuctioneer) {
      return;
    }

    setTimeRemaining(duration);
    setIsRunning(true);
    await updateTimerState(duration, true);
  }, [isAuctioneer, updateTimerState]);

  /**
   * Stops the auction timer
   * Only auctioneer can stop the timer
   */
  const stopTimer = useCallback(async () => {
    if (!isAuctioneer) {
      return;
    }

    setIsRunning(false);
    await updateTimerState(timeRemaining, false);
  }, [isAuctioneer, timeRemaining, updateTimerState]);

  /**
   * Resets the timer to a new duration
   * Only auctioneer can reset the timer
   *
   * @param duration - New timer duration in seconds
   */
  const resetTimer = useCallback(async (duration: number) => {
    if (!isAuctioneer) {
      return;
    }

    setTimeRemaining(duration);
    setIsRunning(true);
    await updateTimerState(duration, true);
  }, [isAuctioneer, updateTimerState]);

  /**
   * Adds time to the current timer
   * Typically used when a bid is placed to extend bidding time
   *
   * @param seconds - Number of seconds to add
   */
  const addTime = useCallback(async (seconds: number) => {
    if (!isAuctioneer) {
      return;
    }

    const newTime = Math.max(seconds, timeRemaining + seconds);
    setTimeRemaining(newTime);
    setIsRunning(true);
    await updateTimerState(newTime, true);
  }, [isAuctioneer, timeRemaining, updateTimerState]);

  // Local countdown effect
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Alert when timer runs out
      if (timeRemaining <= 0 && isRunning && !hasExpired) {
        setIsRunning(false);
        setHasExpired(true);
        if (isAuctioneer) {
          setTimeout(() => {
            alert('⏰ Timer has run out! Please sell the player or move to the next player.');
          }, 100);
          updateTimerState(0, false);
        }
      }

      return;
    }

    // Reset expired flag when timer is running
    if (isRunning && timeRemaining > 0) {
      setHasExpired(false);
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1;

        // If timer hits 0, stop and alert
        if (newTime <= 0) {
          if (isAuctioneer && !hasExpired) {
            setTimeout(() => {
              alert('⏰ Timer has run out! Please sell the player or move to the next player.');
            }, 100);
            updateTimerState(0, false);
          }
          setIsRunning(false);
          setHasExpired(true);
          return 0;
        }

        return newTime;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, timeRemaining, isAuctioneer, updateTimerState, hasExpired]);

  // Sync timer state every 2 seconds to prevent drift (reduced from 5 seconds)
  useEffect(() => {
    if (!roomId || isAuctioneer) return; // Only non-auctioneers sync

    const syncInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastSyncRef.current > 2000) { // Sync every 2 seconds for better accuracy
        loadTimerState();
        lastSyncRef.current = now;
      }
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [roomId, isAuctioneer, loadTimerState]);

  // Real-time subscription for timer updates
  useEffect(() => {
    if (!roomId) return;

    const subscription = supabase
      .channel(`auction_timer_${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_timer',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const timerData = payload.new as any;

          // Update for all users (both auctioneer and participants)
          const lastUpdated = new Date(timerData.last_updated).getTime();
          const currentTime = getCurrentTime();
          const elapsedMs = currentTime - lastUpdated;
          const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000)); // Ensure non-negative

          let remainingTime = timerData.time_remaining;

          if (timerData.is_running && elapsedSeconds > 0) {
            remainingTime = Math.max(0, timerData.time_remaining - elapsedSeconds);
          }

          setTimeRemaining(remainingTime);
          setIsRunning(timerData.is_running && remainingTime > 0);

          // Reset expired flag when timer is updated (e.g., when time is added)
          if (remainingTime > 0) {
            setHasExpired(false);
          }
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [roomId, isAuctioneer, getCurrentTime]);

  // Initialize timer
  useEffect(() => {
    if (!roomId) return;

    const initialize = async () => {
      await calculateServerTimeOffset();
      await loadTimerState();
    };

    initialize();
  }, [roomId, calculateServerTimeOffset, loadTimerState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    /** Current time remaining in seconds */
    timeRemaining,
    /** Whether the timer is currently running */
    isRunning,
    /** Whether the hook is loading initial timer state */
    loading,
    /** Whether the timer has expired (reached 0) */
    hasExpired,
    /** Function to start the timer (auctioneer only) */
    startTimer,
    /** Function to stop the timer (auctioneer only) */
    stopTimer,
    /** Function to reset the timer (auctioneer only) */
    resetTimer,
    /** Function to add time to the timer (auctioneer only) */
    addTime
  };
}
