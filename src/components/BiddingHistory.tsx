'use client';

// COMMENTED OUT: BiddingHistory component and all logic are disabled for maintenance
// import { useState, useEffect } from 'react';
// import { supabase } from '@/lib/supabase';
// import FranchiseLogo from './FranchiseLogo';
//
// interface BiddingHistoryProps {
//   roomId: string;
//   playerId: number;
//   participants: Array<{
//     id: string;
//     user_id: string;
//     team_id: string;
//     team_short_name?: string;
//     budget_remaining: number;
//     players_count: number;
//     is_auctioneer: boolean;
//   }>;
// }
//
// interface BidRecord {
//   id: string;
//   bid_amount: number;
//   team_id: string;
//   bid_time: string;
//   created_at: string;
// }
//
// export default function BiddingHistory({ roomId, playerId, participants }: BiddingHistoryProps) {
//   const [bids, setBids] = useState<BidRecord[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [usingFallback, setUsingFallback] = useState(false);
//
//   useEffect(() => {
//     loadBiddingHistory();
//
//     // Set up real-time subscription for new bids
//     const channel = supabase
//       .channel(`bidding_history_${roomId}_${playerId}`)
//       .on('postgres_changes', {
//         event: 'INSERT',
//         schema: 'public',
//         table: usingFallback ? 'auction_bids' : 'bidding_history',
//         filter: usingFallback
//           ? `room_id=eq.${roomId}.and.player_id=eq.${playerId}`
//           : `room_id=eq.${roomId}.and.player_id=eq.${playerId}`
//       }, (payload) => {
//         const newBid = payload.new;
//         const bidRecord = usingFallback
//           ? {
//               id: newBid.id,
//               bid_amount: newBid.amount,
//               team_id: newBid.team_id,
//               bid_time: newBid.timestamp,
//               created_at: newBid.timestamp
//             }
//           : newBid as BidRecord;
//
//         setBids(current => [bidRecord, ...current].slice(0, 10));
//       })
//       .subscribe();
//
//     return () => {
//       channel.unsubscribe();
//     };
//   }, [roomId, playerId, usingFallback]);
//
//   const loadBiddingHistory = async () => {
//     try {
//       setLoading(true);
//
//       // Try new bidding_history table first
//       const { data: newData, error: newError } = await supabase
//         .from('bidding_history')
//         .select('*')
//         .eq('room_id', roomId)
//         .eq('player_id', playerId)
//         .order('bid_time', { ascending: false })
//         .limit(10);
//
//       if (!newError && newData) {
//         setBids(newData);
//         setUsingFallback(false);
//         return;
//       }
//
//       // Fallback to auction_bids table
//       console.log('Falling back to auction_bids table');
//       const { data: fallbackData, error: fallbackError } = await supabase
//         .from('auction_bids')
//         .select('*')
//         .eq('room_id', roomId)
//         .eq('player_id', playerId)
//         .order('timestamp', { ascending: false })
//         .limit(10);
//
//       if (fallbackError) {
//         console.error('Error loading bidding history from both tables:', fallbackError);
//         setBids([]);
//         return;
//       }
//
//       // Transform auction_bids data to match BidRecord format
//       const transformedBids = (fallbackData || []).map(bid => ({
//         id: bid.id,
//         bid_amount: bid.amount,
//         team_id: bid.team_id,
//         bid_time: bid.timestamp,
//         created_at: bid.timestamp
//       }));
//
//       setBids(transformedBids);
//       setUsingFallback(true);
//
//     } catch (error) {
//       console.error('Error loading bidding history:', error);
//       setBids([]);
//     } finally {
//       setLoading(false);
//     }
//   };
//
//   const formatCurrency = (amount: number) => {
//     if (!amount || amount === 0) return '₹0L';
//
//     if (amount >= 100) {
//       const crores = amount / 100;
//       return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
//     } else {
//       return amount % 1 === 0 ? `₹${amount}L` : `₹${amount.toFixed(1)}L`;
//     }
//   };
//
//   const formatTime = (timestamp: string) => {
//     const date = new Date(timestamp);
//     return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
//   };
//
//   const getParticipantByTeamId = (teamId: string) => {
//     return participants.find(p => p.team_id === teamId);
//   };
//
//   if (loading) {
//     return (
//       <div className="text-center py-4">
//         <div className="spinner-sm mx-auto mb-2"></div>
//         <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading bidding history...</p>
//       </div>
//     );
//   }
//
//   if (bids.length === 0) {
//     return (
//       <div className="text-center py-8">
//         <div className="text-2xl mb-2">💰</div>
//         <p style={{ color: 'var(--text-muted)' }}>No bids placed yet</p>
//         {usingFallback && (
//           <p className="text-xs mt-2 text-yellow-500">
//             Using fallback table - run database setup for full features
//           </p>
//         )}
//       </div>
//     );
//   }
//
//   return (
//     <div className="space-y-2">
//       <div className="flex items-center justify-between mb-3">
//         <h3 className="text-lg font-semibold">Bidding History</h3>
//         <span className="text-sm text-gray-500">
//           Last {bids.length} bids {usingFallback && '(fallback)'}
//         </span>
//       </div>
//
//       <div className="max-h-80 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
//         {bids.map((bid, index) => {
//           const participant = getParticipantByTeamId(bid.team_id);
//           const isHighest = index === 0;
//           const isRecent = index < 3;
//
//           return (
//             <div
//               key={bid.id}
//               className={`p-4 rounded-lg border transition-all duration-200 ${
//                 isHighest
//                   ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/40 shadow-lg'
//                   : isRecent
//                   ? 'bg-gradient-to-r from-blue-500/15 to-purple-500/15 border-blue-500/30'
//                   : 'bg-gradient-to-r from-gray-500/5 to-gray-600/5 border-gray-500/20'
//               }`}
//             >
//               <div className="flex items-center justify-between">
//                 <div className="flex items-center gap-3">
//                   <div className="relative">
//                     <FranchiseLogo
//                       franchiseCode={participant?.team_short_name || ''}
//                       size="sm"
//                     />
//                     {isHighest && (
//                       <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
//                     )}
//                   </div>
//                   <div>
//                     <div className="flex items-center gap-2">
//                       <span className="font-medium text-sm">
//                         {participant?.team_short_name || 'Unknown Team'}
//                       </span>
//                       {isHighest && (
//                         <span className="text-xs bg-green-500/30 text-green-300 px-2 py-1 rounded-full font-medium">
//                           HIGHEST
//                         </span>
//                       )}
//                     </div>
//                     <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
//                       {formatTime(bid.bid_time)}
//                     </div>
//                   </div>
//                 </div>
//                 <div className="text-right">
//                   <div className={`font-bold text-lg ${
//                     isHighest ? 'text-green-400' :
//                     isRecent ? 'text-blue-400' : 'text-gray-400'
//                   }`}>
//                     {formatCurrency(bid.bid_amount)}
//                   </div>
//                   {index > 0 && (
//                     <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
//                       #{index + 1}
//                     </div>
//                   )}
//                 </div>
//               </div>
//
//               {/* Add a subtle progress bar for recent bids */}
//               {isRecent && (
//                 <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
//                   <div
//                     className={`h-full transition-all duration-300 ${
//                       isHighest ? 'bg-green-500' : 'bg-blue-500'
//                     }`}
//                     style={{ width: `${100 - (index * 20)}%` }}
//                   ></div>
//                 </div>
//               )}
//             </div>
//           );
//         })}
//       </div>
//
//       {bids.length >= 10 && (
//         <div className="text-center py-2">
//           <p className="text-xs text-gray-500">
//             Showing latest 10 bids • {usingFallback ? 'Fallback mode' : 'Older bids auto-archived'}
//           </p>
//         </div>
//       )}
//     </div>
//   );
// }

// Dummy fallback to avoid import/render errors
export default function BiddingHistory() { return null; }
