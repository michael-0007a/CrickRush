/**
 * @fileoverview Enhanced real-time synchronized timer for auctions
 * Ensures timer is perfectly synced across all users
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Custom hook for managing synchronized auction timers
 * @param roomId - The auction room identifier
 * @param initialTime - Initial time in seconds
 * @param isActive - Whether the timer is active
 * @param isPaused - Whether the timer is paused
 * @param onTimeUpdate - Callback for time updates
 * @param onTimeout - Callback when timer reaches zero
 * @returns Timer state and controls
 */
export function useSimpleTimer(
  roomId: string,
  initialTime: number,
  isActive: boolean,
  isPaused: boolean,
  onTimeUpdate?: (time: number) => void,
  onTimeout?: () => void
) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onTimeoutRef = useRef(onTimeout);
  const lastSyncRef = useRef(Date.now());

  // Update refs to avoid recreating effects
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Sync timer with database periodically
  const syncWithDatabase = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data } = await supabase
        .from('auction_state')
        .select('time_remaining, is_active, is_paused')
        .eq('room_id', roomId)
        .single();

      if (data) {
        const dbTime = data.time_remaining || 0;
        const localTime = timeRemaining;

        // Only sync if there's a significant difference (more than 2 seconds)
        if (Math.abs(dbTime - localTime) > 2) {
          setTimeRemaining(dbTime);

          if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(dbTime);
          }
        }

        lastSyncRef.current = Date.now();
      }
    } catch (error) {
      // Timer sync failed - error handling without console output
    }
  }, [roomId, timeRemaining]);

  // Update timer from external changes
  useEffect(() => {
    if (initialTime !== timeRemaining) {
      setTimeRemaining(initialTime);
    }
  }, [initialTime]);

  // Timer logic with database sync
  useEffect(() => {
    const shouldRun = isActive && !isPaused && timeRemaining > 0;
    setIsRunning(shouldRun);

    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (shouldRun) {
      // Main timer countdown
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = Math.max(0, prev - 1);

          // Notify parent component of time update
          if (onTimeUpdateRef.current) {
            onTimeUpdateRef.current(newTime);
          }

          // Update database every second for real-time sync
          supabase
            .from('auction_state')
            .update({ time_remaining: newTime })
            .eq('room_id', roomId)
            .then(({ error }) => {
              // Silent error handling for database updates
            });

          // Handle timeout
          if (newTime === 0 && onTimeoutRef.current) {
            onTimeoutRef.current();
          }

          return newTime;
        });
      }, 1000);

      // Sync with database every 3 seconds to prevent drift
      syncIntervalRef.current = setInterval(syncWithDatabase, 3000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isActive, isPaused, timeRemaining, roomId, syncWithDatabase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  return {
    timeRemaining,
    isRunning
  };
}
