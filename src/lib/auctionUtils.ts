import { supabase } from '@/lib/supabase';

interface BidData {
  roomId: string;
  playerId: number;
  teamId: string;
  bidAmount: number;
}

// COMMENTED OUT: All bidding history and player queue logic is disabled for maintenance
// export async function insertBid({ roomId, playerId, teamId, bidAmount }: BidData) {
//   try {
//     const { data, error } = await supabase
//       .from('bidding_history')
//       .insert({
//         room_id: roomId,
//         player_id: playerId,
//         team_id: teamId,
//         bid_amount: bidAmount,
//         bid_time: new Date().toISOString()
//       })
//       .select();

//     if (error) {
//       console.error('Error inserting bid:', error);
//       return { success: false, error };
//     }

//     return { success: true, data };
//   } catch (error) {
//     console.error('Error inserting bid:', error);
//     return { success: false, error };
//   }
// }

// export async function getBiddingHistory(roomId: string, playerId: number, limit: number = 10) {
//   try {
//     const { data, error } = await supabase
//       .from('bidding_history')
//       .select('*')
//       .eq('room_id', roomId)
//       .eq('player_id', playerId)
//       .order('bid_time', { ascending: false })
//       .limit(limit);

//     if (error) {
//       console.error('Error fetching bidding history:', error);
//       return { success: false, error };
//     }

//     return { success: true, data };
//   } catch (error) {
//     console.error('Error fetching bidding history:', error);
//     return { success: false, error };
//   }
// }

// Player queue management functions
// export async function getPlayerQueue(roomId: string) {
//   try {
//     const { data, error } = await supabase
//       .from('player_queue')
//       .select('*')
//       .eq('room_id', roomId)
//       .order('queue_position', { ascending: true });

//     if (error) {
//       console.error('Error fetching player queue:', error);
//       return { success: false, error };
//     }

//     return { success: true, data };
//   } catch (error) {
//     console.error('Error fetching player queue:', error);
//     return { success: false, error };
//   }
// }

// export async function updatePlayerQueue(roomId: string, players: any[]) {
//   try {
//     // First, delete existing queue for this room
//     await supabase
//       .from('player_queue')
//       .delete()
//       .eq('room_id', roomId);

//     // Insert new queue
//     const queueData = players.map((player, index) => ({
//       room_id: roomId,
//       player_id: player.id,
//       queue_position: index,
//       player_data: player
//     }));

//     const { data, error } = await supabase
//       .from('player_queue')
//       .insert(queueData)
//       .select();

//     if (error) {
//       console.error('Error updating player queue:', error);
//       return { success: false, error };
//     }

//     return { success: true, data };
//   } catch (error) {
//     console.error('Error updating player queue:', error);
//     return { success: false, error };
//   }
// }

// export async function removePlayerFromQueue(roomId: string, playerId: number) {
//   try {
//     const { error } = await supabase
//       .from('player_queue')
//       .delete()
//       .eq('room_id', roomId)
//       .eq('player_id', playerId);

//     if (error) {
//       console.error('Error removing player from queue:', error);
//       return { success: false, error };
//     }

//     // Reorder remaining players
//     const { data: remainingPlayers, error: fetchError } = await supabase
//       .from('player_queue')
//       .select('*')
//       .eq('room_id', roomId)
//       .order('queue_position', { ascending: true });

//     if (fetchError) {
//       console.error('Error fetching remaining players:', fetchError);
//       return { success: false, error: fetchError };
//     }

//     // Update positions
//     const updates = remainingPlayers.map((player, index) => ({
//       id: player.id,
//       queue_position: index
//     }));

//     for (const update of updates) {
//       await supabase
//         .from('player_queue')
//         .update({ queue_position: update.queue_position })
//         .eq('id', update.id);
//     }

//     return { success: true };
//   } catch (error) {
//     console.error('Error removing player from queue:', error);
//     return { success: false, error };
//   }
// }

export async function insertBid({ roomId, playerId, teamId, bidAmount }: BidData) {
  return { success: false, error: 'Bidding history is disabled.' };
}

export async function getBiddingHistory(roomId: string, playerId: number, limit: number = 10) {
  return { success: false, data: [] };
}

export async function getPlayerQueue(roomId: string) {
  return { success: false, data: [] };
}

export async function updatePlayerQueue(roomId: string, players: any[]) {
  return { success: false, error: 'Player queue is disabled.' };
}

export async function removePlayerFromQueue(roomId: string, playerId: number) {
  return { success: false, error: 'Player queue is disabled.' };
}
