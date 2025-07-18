// COMMENTED OUT: Player queue logic is disabled for maintenance
// import { useState, useEffect, useCallback } from 'react';
// import { supabase } from '@/lib/supabase';
// import { getPlayerQueue, updatePlayerQueue } from '@/lib/auctionUtils';
//
// interface PlayerQueueData {
//   id: string;
//   room_id: string;
//   player_id: number;
//   queue_position: number;
//   player_data: any;
// }
//
// export function usePlayerQueue(roomId: string) {
//   const [players, setPlayers] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//
//   // Load initial queue
//   const loadQueue = useCallback(async () => {
//     if (!roomId) return;
//
//     try {
//       setLoading(true);
//       const result = await getPlayerQueue(roomId);
//
//       if (result.success && result.data) {
//         const sortedPlayers = result.data
//           .sort((a, b) => a.queue_position - b.queue_position)
//           .map(item => item.player_data);
//         setPlayers(sortedPlayers);
//       } else {
//         setPlayers([]);
//       }
//     } catch (err) {
//       console.error('Error loading player queue:', err);
//       setError('Failed to load player queue');
//     } finally {
//       setLoading(false);
//     }
//   }, [roomId]);
//
//   // Update queue
//   const updateQueue = useCallback(async (newPlayers: any[]) => {
//     if (!roomId) return;
//
//     try {
//       const result = await updatePlayerQueue(roomId, newPlayers);
//       if (result.success) {
//         setPlayers(newPlayers);
//       }
//     } catch (err) {
//       console.error('Error updating player queue:', err);
//       setError('Failed to update player queue');
//     }
//   }, [roomId]);
//
//   // Remove player from queue
//   const removePlayer = useCallback(async (playerId: number) => {
//     if (!roomId) return;
//
//     try {
//       const updatedPlayers = players.filter(p => p.id !== playerId);
//       await updateQueue(updatedPlayers);
//     } catch (err) {
//       console.error('Error removing player from queue:', err);
//       setError('Failed to remove player from queue');
//     }
//   }, [roomId, players, updateQueue]);
//
//   useEffect(() => {
//     loadQueue();
//
//     // Set up real-time subscription for queue changes
//     const channel = supabase
//       .channel(`player_queue_${roomId}`)
//       .on('postgres_changes', {
//         event: '*',
//         schema: 'public',
//         table: 'player_queue',
//         filter: `room_id=eq.${roomId}`
//       }, () => {
//         // Debounce queue updates to prevent flickering
//         setTimeout(() => {
//           loadQueue();
//         }, 100);
//       })
//       .subscribe();
//
//     return () => {
//       channel.unsubscribe();
//     };
//   }, [roomId, loadQueue]);
//
//   return {
//     players,
//     loading,
//     error,
//     updateQueue,
//     removePlayer,
//     refreshQueue: loadQueue
//   };
// }

// Dummy export to avoid import errors
export function usePlayerQueue() {
  return { players: [], loading: false, error: null, updateQueue: async () => {}, removePlayer: async () => {}, refreshQueue: async () => {} };
}
