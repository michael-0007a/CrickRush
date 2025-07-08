'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import FranchiseLogo from './FranchiseLogo';

interface BiddingHistoryProps {
  roomId: string;
  playerId: number;
  participants: Array<{
    id: string;
    user_id: string;
    team_id: string;
    team_short_name?: string;
    budget_remaining: number;
    players_count: number;
    is_auctioneer: boolean;
  }>;
}

interface BidRecord {
  id: string;
  bid_amount: number;
  team_id: string;
  team_short_name: string;
  timestamp: string;
}

export default function BiddingHistory({ roomId, playerId, participants }: BiddingHistoryProps) {
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentAuctionState, setCurrentAuctionState] = useState<any>(null);

  useEffect(() => {
    loadCurrentAuctionState();

    // Set up real-time subscription for auction state changes
    const channel = supabase
      .channel(`auction_state_${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'auction_state',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        const newState = payload.new;
        // Only add to history if this is for the current player and there's a valid bid
        if (newState.current_player_id === playerId && newState.current_bid > 0 && newState.leading_team) {
          const participant = participants.find(p => p.team_id === newState.leading_team);
          if (participant) {
            const newBid: BidRecord = {
              id: `${newState.leading_team}_${newState.current_bid}_${Date.now()}`,
              bid_amount: newState.current_bid,
              team_id: newState.leading_team,
              team_short_name: participant.team_short_name || 'Unknown',
              timestamp: new Date().toISOString()
            };

            setBids(current => {
              // Avoid duplicates by checking if this exact bid already exists
              const exists = current.some(bid =>
                bid.team_id === newBid.team_id &&
                bid.bid_amount === newBid.bid_amount
              );

              if (!exists) {
                return [newBid, ...current].slice(0, 10); // Keep only last 10 bids
              }
              return current;
            });
          }
        }
        setCurrentAuctionState(newState);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, playerId, participants]);

  const loadCurrentAuctionState = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('auction_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (error) {
        console.log('No auction state found yet');
        setBids([]);
        return;
      }

      setCurrentAuctionState(data);

      // If there's a current bid for this player, show it as the initial bid
      if (data.current_player_id === playerId && data.current_bid > 0 && data.leading_team) {
        const participant = participants.find(p => p.team_id === data.leading_team);
        if (participant) {
          const currentBid: BidRecord = {
            id: `current_${data.leading_team}_${data.current_bid}`,
            bid_amount: data.current_bid,
            team_id: data.leading_team,
            team_short_name: participant.team_short_name || 'Unknown',
            timestamp: data.updated_at || new Date().toISOString()
          };
          setBids([currentBid]);
        }
      } else {
        setBids([]);
      }
    } catch (error) {
      console.error('Error loading auction state:', error);
      setBids([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount || amount === 0) return '₹0L';

    if (amount >= 100) {
      const crores = amount / 100;
      return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
    } else {
      return amount % 1 === 0 ? `₹${amount}L` : `₹${amount.toFixed(1)}L`;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getParticipantByTeamId = (teamId: string) => {
    return participants.find(p => p.team_id === teamId);
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-sm mx-auto mb-2"></div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading bidding history...</p>
      </div>
    );
  }

  if (bids.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-2">💰</div>
        <p style={{ color: 'var(--text-muted)' }}>No bids placed yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {bids.map((bid, index) => {
        const participant = getParticipantByTeamId(bid.team_id);
        const isHighest = index === 0;

        return (
          <div
            key={bid.id}
            className={`p-3 rounded-lg border ${
              isHighest
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30'
                : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FranchiseLogo franchiseCode={participant?.team_short_name || ''} size="sm" />
                <div>
                  <div className="font-medium text-sm">
                    {participant?.team_short_name || bid.team_short_name || 'Unknown Team'}
                    {isHighest && (
                      <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                        HIGHEST
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(bid.timestamp)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${isHighest ? 'text-green-400' : 'text-blue-400'}`}>
                  {formatCurrency(bid.bid_amount)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
