/**
 * @fileoverview Live Auction Client Component
 * Contains the main auction room logic with useParams() hook
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime';
import { useMySquad } from '@/hooks/useMySquad';
import { usePlayerQueue } from '@/hooks/usePlayerQueue';
import FranchiseLogo from '@/components/FranchiseLogo';
import {
  Trophy, Users, Pause, Play, SkipForward, LogOut,
  Crown, Timer, User, ChevronDown, Trash2
} from 'lucide-react';
import BiddingHistory from '@/components/BiddingHistory';
import { useSimpleTimer } from '@/hooks/useSimpleTimer';

interface AuctionRoom {
  id: string;
  room_key: string;
  name: string;
  creator_id: string;
  status: string;
  max_participants: number;
  budget_per_team: number;
  players_per_team: number;
  timer_seconds: number;
}

interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface IPLTeam {
  id: string;
  name: string;
  short_name: string;
  color: string;
  logo: string;
  city: string;
  available?: boolean;
}

interface Participant {
  id: string;
  user_id: string;
  team_id: string;
  team_short_name?: string;
  budget_remaining: number;
  players_count: number;
  is_auctioneer: boolean;
}

export default function LiveAuctionClient() {
  const params = useParams();
  const router = useRouter();
  const roomKey = params.roomKey as string;
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [room, setRoom] = useState<AuctionRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuctioneer, setIsAuctioneer] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<{[key: string]: UserProfile}>({});

  // UI state
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<IPLTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [showCustomBid, setShowCustomBid] = useState(false);
  const [customBidAmount, setCustomBidAmount] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // New bidding control states
  const [lastBiddingTeam, setLastBiddingTeam] = useState<string | null>(null);
  const [bidCooldownTime, setBidCooldownTime] = useState<number>(0);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sale notification state
  const [saleNotification, setSaleNotification] = useState<{
    playerName: string;
    teamName: string;
    soldAmount: number;
    isVisible: boolean;
  }>({
    playerName: '',
    teamName: '',
    soldAmount: 0,
    isVisible: false
  });

  // Use the player queue hook for proper shuffling - load cricketers from database
  const {
    currentPlayer: queueCurrentPlayer,
    nextPlayer: queueNextPlayer,
    players: queuePlayers,
    moveToNextPlayer: queueMoveToNextPlayer,
    isLoading: queueLoading,
    totalPlayers,
    remainingCount
  } = usePlayerQueue(room?.id || '');

  // Use the auction realtime hook with shuffled players from usePlayerQueue
  const {
    auctionState,
    participants,
    recentBids,
    loading: auctionLoading,
    error: auctionError,
    isConnected,
    auctionControls,
    biddingActions,
    refresh
  } = useAuctionRealtime(room?.id || '', user?.id || null, queuePlayers);

  // Get myParticipant from participants
  const myParticipant = participants.find(p => p.user_id === user?.id);

  const {
    myPlayers,
    addPlayer
  } = useMySquad(room?.id || '', myParticipant?.id || null);

  // Listen for sale notifications from auction state
  useEffect(() => {
    if (auctionState?.sale_notification && auctionState.sale_notification.timestamp) {
      const notification = auctionState.sale_notification;

      // Show the notification to all participants
      setSaleNotification({
        playerName: notification.player_name,
        teamName: notification.team_name,
        soldAmount: notification.sold_amount,
        isVisible: true
      });

      // Clear the notification from auction state after 2 seconds to prevent re-showing
      setTimeout(async () => {
        if (isAuctioneer) {
          await supabase
            .from('auction_state')
            .update({
              sale_notification: null,
              updated_at: new Date().toISOString()
            })
            .eq('room_id', room?.id);
        }
      }, 2000);
    }
  }, [auctionState?.sale_notification, isAuctioneer, room?.id]);

  // Listen for sale notifications from real-time channel
  useEffect(() => {
    if (!room?.id) return;

    // Subscribe to sale notifications channel
    const saleChannel = supabase.channel(`auction_sale_${room.id}`);

    saleChannel
      .on('broadcast', { event: 'player_sold' }, (payload) => {
        console.log('Sale notification received:', payload);

        // Show the notification to all participants
        setSaleNotification({
          playerName: payload.payload.player_name,
          teamName: payload.payload.team_name,
          soldAmount: payload.payload.sold_amount,
          isVisible: true
        });
      })
      .subscribe((status) => {
        console.log('Sale notification channel status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(saleChannel);
    };
  }, [room?.id]);

  // Use the enhanced timer hook with real-time sync
  const { timeRemaining, isRunning } = useSimpleTimer(
    room?.id || '',
    auctionState?.time_remaining || 0,
    auctionState?.is_active || false,
    auctionState?.is_paused || false,
    undefined, // onTimeUpdate - handled by auction state
    async () => {
      // Show alert to auctioneer when timer reaches 0
      if (isAuctioneer && auctionState?.current_player) {
        const leadingTeamName = auctionState.leading_team
          ? participants.find(p => p.team_id === auctionState.leading_team)?.team_short_name || 'Unknown'
          : 'No bidder';

        const action = confirm(
          `Timer has expired for ${auctionState.current_player.name}!\n\n` +
          `Current highest bid: ₹${auctionState.current_bid}L by ${leadingTeamName}\n\n` +
          `Choose action:\n` +
          `OK = Sell player to highest bidder\n` +
          `Cancel = Add 15 more seconds`
        );

        if (action) {
          // Sell player to highest bidder
          if (auctionState.leading_team && auctionState.current_bid > 0) {
            await sellPlayer();
          } else {
            alert('No valid bids to sell player. Moving to next player.');
            await handleNextPlayer();
          }
        } else {
          // Add 15 seconds more time
          await handleAddTime(15);
        }
      }
    }
  );

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoading(true);

        // Get user session with error handling for expired tokens
        let session;
        try {
          const { data: { session: userSession }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            // If there's an auth error (like invalid refresh token), redirect to login
            if (sessionError.message?.includes('Refresh Token') || sessionError.message?.includes('Invalid')) {
              router.push('/auth');
              return;
            }
          }

          session = userSession;
        } catch (authError) {
          // Catch any other auth-related errors and redirect to login
          router.push('/auth');
          return;
        }

        if (!session?.user) {
          router.push('/auth');
          return;
        }

        setUser(session.user);

        // Load user profile
        const { data: profile } = await supabase
          .from('users_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setUserProfile(profile);

        // Load room
        const { data: roomData, error: roomError } = await supabase
          .from('auction_rooms')
          .select('*')
          .eq('room_key', roomKey.toUpperCase())
          .single();

        if (roomError || !roomData) {
          router.push('/dashboard');
          return;
        }

        // Check if auction has ended
        if (roomData.status === 'completed') {
          // Show ended auction message for both auctioneer and participants
          setRoom(roomData);
          setIsAuctioneer(roomData.creator_id === session.user.id); // Fix: Set isAuctioneer even for completed auctions
          setLoading(false);
          return;
        }

        setRoom(roomData);
        setIsAuctioneer(roomData.creator_id === session.user.id);

        // Initialize auction state if it doesn't exist
        if (roomData.creator_id === session.user.id) {
          const { data: existingState } = await supabase
            .from('auction_state')
            .select('*')
            .eq('room_id', roomData.id)
            .single();

          if (!existingState) {
            // Create initial auction state
            await supabase
              .from('auction_state')
              .insert({
                room_id: roomData.id,
                is_active: false,
                is_paused: false,
                current_player_id: null,
                current_player_index: 0,
                current_bid: 0,
                base_price: 0,
                leading_team: null,
                current_bidder_id: null,
                time_remaining: roomData.timer_seconds || 30,
                total_players: 0,
                player_queue: [],
                sold_players: [],
                unsold_players: []
              });
          }
        }

      } catch (error) {
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, [roomKey, router]);

  // Load participant profiles when participants change
  useEffect(() => {
    const loadParticipantProfiles = async () => {
      if (!participants.length) return;

      const userIds = participants.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('users_profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profiles) {
        const profileMap = profiles.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {});
        setParticipantProfiles(profileMap);
      }
    };

    loadParticipantProfiles();
  }, [participants]);

  // Real-time connection status indicator
  useEffect(() => {
    if (!isConnected && !auctionLoading) {
      console.warn('Real-time connection lost, attempting to reconnect...');
      // Optionally show a reconnection indicator to users
    }
  }, [isConnected, auctionLoading]);

  // Handle team selection with immediate refresh
  const handleTeamSelection = async (teamId: string) => {
    if (!room?.id || !user?.id) return;

    try {
      const { error } = await supabase
        .from('auction_participants')
        .update({ team_id: teamId })
        .eq('auction_room_id', room.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating team:', error);
        return;
      }

      setShowTeamSelector(false);
      // No need to call refresh() - real-time subscriptions will handle the update
    } catch (error) {
      console.error('Error updating team:', error);
    }
  };

  // Handle bidding with immediate UI feedback
  const handleBid = async (amount: number) => {
    if (!myParticipant || !auctionState?.current_player) return;

    try {
      await biddingActions.placeBid(amount);
      setShowCustomBid(false);
      setCustomBidAmount('');
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Improved auction controls with proper error handling
  const handleStartAuction = async () => {
    if (!isAuctioneer) {
      alert('Only the auctioneer can start the auction');
      return;
    }

    try {
      await auctionControls.startAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error starting auction:', error);
      alert('Failed to start auction: ' + (error as Error).message);
    }
  };

  const handlePauseAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.pauseAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error pausing auction:', error);
      alert('Failed to pause auction: ' + (error as Error).message);
    }
  };

  const handleResumeAuction = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.resumeAuction();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error resuming auction:', error);
      alert('Failed to resume auction: ' + (error as Error).message);
    }
  };

  const handleNextPlayer = async () => {
    if (!isAuctioneer) return;

    try {
      await auctionControls.nextPlayer();
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error moving to next player:', error);
      alert('Failed to move to next player: ' + (error as Error).message);
    }
  };

  const handleAddTime = async (seconds: number) => {
    if (!isAuctioneer) return;

    try {
      // If auction is running, pause it first, then add time
      if (auctionState?.is_active && !auctionState.is_paused) {
        await auctionControls.pauseAuction();
        // Wait a moment for the pause to take effect
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Add the time
      await auctionControls.addTime(seconds);
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error adding time:', error);
      alert('Failed to add time: ' + (error as Error).message);
    }
  };

  // Bidding functions with immediate feedback
  const handleQuickBid = async () => {
    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    try {
      const amount = auctionState.current_bid === 0
        ? auctionState.base_price
        : auctionState.current_bid + (auctionState.current_bid < 200 ? 25 : 100);

      await biddingActions.placeBid(amount);
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  const handleCustomBid = async () => {
    const amount = parseInt(customBidAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid bid amount');
      return;
    }

    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    try {
      await biddingActions.placeBid(amount);
      setCustomBidAmount('');
      setShowCustomBid(false);
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Simplified auction controls that rely on real-time updates
  const startAuction = async () => {
    await handleStartAuction();
  };

  const pauseAuction = async () => {
    await handlePauseAuction();
  };

  const resumeAuction = async () => {
    await handleResumeAuction();
  };

  const sellPlayer = async () => {
    if (!isAuctioneer || !auctionState?.current_player) {
      alert('Only the auctioneer can sell players');
      return;
    }

    if (!auctionState.leading_team || auctionState.current_bid <= 0) {
      alert('No valid bidder found');
      return;
    }

    try {
      // Find the leading participant
      const leadingParticipant = participants.find(p => p.team_id === auctionState.leading_team);
      if (!leadingParticipant) {
        alert('Leading participant not found');
        return;
      }

      // 1. Add player to winner's squad - Use a simpler approach with existing tables
      // For now, we'll track sold players in the auction_state.sold_players array
      // and update participant data directly

      const soldPlayerData = {
        id: auctionState.current_player.id,
        name: auctionState.current_player.name,
        role: auctionState.current_player.type || auctionState.current_player.role || 'ALL',
        final_price: Number(auctionState.current_bid) || 0,
        sold_to_team: auctionState.leading_team,
        sold_to_participant: leadingParticipant.id,
        purchased_at: new Date().toISOString()
      };

      // Update the auction state to include this sold player
      const updatedSoldPlayers = [...(auctionState.sold_players || []), soldPlayerData];

      // Update auction state with sold player info
      const { error: stateUpdateError } = await supabase
        .from('auction_state')
        .update({
          sold_players: updatedSoldPlayers,
          updated_at: new Date().toISOString()
        })
        .eq('room_id', room?.id);

      if (stateUpdateError) {
        console.error('Error updating auction state with sold player:', stateUpdateError);
        alert('Failed to record player sale: ' + stateUpdateError.message);
        return;
      }

      // 2. Update participant budget and player count - Fix column names
      const { error: budgetError } = await supabase
        .from('auction_participants')
        .update({
          budget_remaining: leadingParticipant.budget_remaining - auctionState.current_bid,
          squad_size: (leadingParticipant.squad_size || 0) + 1
        })
        .eq('id', leadingParticipant.id);

      if (budgetError) {
        console.error('Error updating participant budget:', budgetError);
        alert('Warning: Could not update participant budget');
        return;
      }

      // 3. Insert into bidding history (new normalized table)
      try {
        await supabase
          .from('bidding_history')
          .insert({
            room_id: room?.id,
            player_id: auctionState.current_player.id,
            team_id: auctionState.leading_team,
            bid_amount: auctionState.current_bid,
            bid_time: new Date().toISOString()
          });
      } catch (historyError) {
        console.log('Could not insert into bidding history:', historyError);
      }

      // 4. Mark player as sold in queue (new normalized approach)
      try {
        await supabase
          .from('player_queue_items')
          .update({
            is_sold: true,
            is_current: false
          })
          .eq('room_id', room?.id)
          .eq('player_id', auctionState.current_player.id);
      } catch (queueError) {
        console.log('Could not update player queue:', queueError);
      }

      // 5. Broadcast sale notification to all participants through real-time channel
      // Instead of using database column, broadcast directly through Supabase real-time
      const saleNotificationData = {
        player_name: auctionState.current_player.name,
        team_name: leadingParticipant.team_short_name || 'Unknown Team',
        sold_amount: auctionState.current_bid,
        timestamp: new Date().toISOString()
      };

      // Broadcast sale notification through real-time channel
      try {
        const channel = supabase.channel(`auction_sale_${room?.id}`);
        await channel.send({
          type: 'broadcast',
          event: 'player_sold',
          payload: saleNotificationData
        });
        console.log('Sale notification broadcasted successfully');
      } catch (notificationError) {
        console.error('Error broadcasting sale notification:', notificationError);
      }

      alert(`Player sold to ${leadingParticipant.team_short_name} for ${formatCurrency(auctionState.current_bid)}!`);

      // Move to next player
      await handleNextPlayer();
    } catch (error) {
      console.error('Error selling player:', error);
      alert('Failed to sell player: ' + (error as Error).message);
    }
  };

  const moveToNextPlayer = async () => {
    await handleNextPlayer();
  };

  const endAuction = async () => {
    if (!isAuctioneer || !room) {
      alert('Only the auctioneer can end the auction');
      return;
    }

    if (!confirm(`Are you sure you want to end the auction "${room.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Mark auction as completed
      const { error: updateError } = await supabase
        .from('auction_rooms')
        .update({
          status: 'completed'
        })
        .eq('id', room.id);

      if (updateError) {
        throw updateError;
      }

      // Also mark auction state as inactive
      await supabase
        .from('auction_state')
        .update({
          is_active: false,
          is_paused: true
        })
        .eq('room_id', room.id);

      // Don't redirect - let the component show the auction summary
      // The UI will automatically show the completed auction page
      alert('Auction ended successfully! You can now view the final summary.');

      // Update the local room state to trigger the completed view
      setRoom(prev => prev ? { ...prev, status: 'completed' } : null);
    } catch (error) {
      alert('Failed to end auction: ' + (error as Error).message);
    }
  };

  const addTime = async (seconds: number) => {
    await handleAddTime(seconds);
  };

  // Format currency helper - Fixed for lakh-based system
  const formatCurrency = (amount: number) => {
    if (!amount || amount === 0) return '₹0L';

    if (amount >= 100) { // 100L = 1 Crore
      const crores = amount / 100;
      return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
    } else {
      return amount % 1 === 0 ? `₹${amount}L` : `₹${amount.toFixed(1)}L`;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      // Handle error silently
    }
  };

  // Cleanup cooldown timer on component unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // Handle cooldown timer
  useEffect(() => {
    if (bidCooldownTime > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setBidCooldownTime(prev => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current);
              cooldownIntervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [bidCooldownTime]);

  // Update last bidding team when auction state changes
  useEffect(() => {
    if (auctionState?.leading_team && auctionState.leading_team !== lastBiddingTeam) {
      setLastBiddingTeam(auctionState.leading_team);
      // Start 15-second cooldown
      setBidCooldownTime(15);
    }
  }, [auctionState?.leading_team, auctionState?.current_bid]);

  // Auto-hide sale notification after 7 seconds (changed from 5)
  useEffect(() => {
    if (saleNotification.isVisible) {
      const timer = setTimeout(() => {
        setSaleNotification(prev => ({ ...prev, isVisible: false }));
      }, 7000); // Changed from 5000 to 7000

      return () => clearTimeout(timer);
    }
  }, [saleNotification.isVisible]);

  // New quick bid functions for fixed amounts
  const handleQuickBidAmount = async (increment: number) => {
    if (!auctionState?.current_player || !myParticipant) {
      alert('Cannot place bid at this time');
      return;
    }

    // Check if team has reached maximum players limit
    const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
      player => player.sold_to_participant === myParticipant.id
    );

    if (myPurchasedPlayers.length >= room.players_per_team) {
      alert(`Your squad is full! You have reached the maximum of ${room.players_per_team} players.`);
      return;
    }

    // Check if same team is trying to bid again
    if (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) {
      alert(`You must wait ${bidCooldownTime} seconds before bidding again after your last bid`);
      return;
    }

    // Check if another team needs to bid first
    if (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id) {
      alert('Another team must place a bid before you can bid again');
      return;
    }

    // Calculate the actual bid amount (current bid + increment)
    const currentPrice = auctionState.current_bid || auctionState.current_player.base_price || 0;
    const bidAmount = currentPrice + increment;

    // Check if team has enough budget
    if (bidAmount > myParticipant.budget_remaining) {
      alert(`Insufficient budget. You have ${formatCurrency(myParticipant.budget_remaining)} remaining`);
      return;
    }

    try {
      await biddingActions.placeBid(bidAmount);
      // Real-time subscriptions will handle the state update
    } catch (error) {
      console.error('Error placing bid:', error);
      alert('Failed to place bid: ' + (error as Error).message);
    }
  };

  // Handle non-participant users (but allow auctioneers to proceed)
  if (!loading && !auctionLoading && room && user && !myParticipant && !isAuctioneer) {
    return (
      <div>
        <nav className="nav">
          <div className="container">
            <div className="nav-content">
              <a href="/dashboard" className="nav-brand">
                <Trophy className="w-6 h-6" />
                <span>CrickRush</span>
              </a>
            </div>
          </div>
        </nav>

        <main className="container section">
          <div className="text-center">
            <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--accent-red) 0%, #ef4444 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
              <Users className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Access Denied</h1>
            <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>
              You are not a participant in this auction room.
            </p>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Please join the auction first using the join link provided by the auctioneer.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="btn btn-primary btn-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (loading || auctionLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading auction...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="loading">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Auction Room Not Found</h1>
          <p style={{ color: 'var(--text-muted)' }} className="mb-6">
            The auction room you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Show auction ended message if auction is completed
  if (room.status === 'completed') {
    return (
      <div>
        {/* Navigation */}
        <nav className="nav">
          <div className="container">
            <div className="nav-content">
              <a href="/dashboard" className="nav-brand">
                <Trophy className="w-6 h-6" />
                <span>CrickRush</span>
              </a>

              <div className="nav-actions">
                <div className={`profile-dropdown ${showProfileDropdown ? 'open' : ''}`}>
                  <button
                    className="profile-trigger"
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  >
                    <img
                      src={userProfile?.avatar_url || user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                      alt="Profile"
                      className="user-avatar"
                    />
                    <ChevronDown className="w-4 h-4 chevron-icon" />
                  </button>

                  {showProfileDropdown && (
                    <div className="profile-dropdown-menu">
                      <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                        <User className="w-4 h-4" />
                        <div>
                          <div className="font-semibold text-sm">
                            {userProfile?.full_name || user?.user_metadata?.full_name || 'User'}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                            {user?.email}
                          </div>
                        </div>
                      </div>

                      <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />

                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          setShowProfileDropdown(false);
                          router.push('/profile');
                        }}
                      >
                        <User className="w-4 h-4 mr-2" />
                        Profile Settings
                      </button>

                      <button
                        className="profile-dropdown-item danger"
                        onClick={() => {
                          setShowProfileDropdown(false);
                          signOut();
                        }}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Close dropdown when clicking outside */}
        {showProfileDropdown && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10,
            }}
            onClick={() => setShowProfileDropdown(false)}
          />
        )}

        {/* Auction Ended Message */}
        <main className="container section">
          <div className="text-center mb-8">
            <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--accent-red) 0%, #ef4444 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Auction Has Ended</h1>
            <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>
              The auction &quot;{room.name}&quot; has been completed and is no longer active.
            </p>

            <div className="card card-lg max-w-2xl mx-auto mb-8">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">{room.name}</h2>
                <div className="grid grid-2 gap-4 mb-6">
                  <div className="text-center p-4 bg-gradient-to-br from-red-500/10 to-pink-500/10 rounded-lg border border-red-500/20">
                    <div className="text-2xl font-bold text-red-400">ENDED</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Status</div>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-2xl font-bold text-blue-400">{room.room_key}</div>
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Room Code</div>
                  </div>
                </div>

                <div className="text-center mb-6">
                  <p style={{ color: 'var(--text-muted)' }}>
                    {isAuctioneer
                      ? "As the auctioneer, you have ended this auction."
                      : "This auction has been completed by the auctioneer."}
                  </p>
                  <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                    Thank you for participating! You can create or join another auction from your dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auction Summary */}
          <div className="card mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Auction Summary</h2>
                <p className="text-sm text-gray-400">Final results and team squads</p>
              </div>
            </div>

            {participants.length > 0 ? (
              <div className="space-y-6">
                {participants.map((participant) => {
                  // Calculate players bought and total spent
                  const playersBought = (auctionState?.sold_players || []).filter(
                    player => player.sold_to_participant === participant.id
                  );
                  const totalSpent = playersBought.reduce((sum, player) => sum + (player.final_price || 0), 0);
                  const budgetUsed = ((totalSpent / room.budget_per_team) * 100).toFixed(1);

                  return (
                    <div key={participant.id} className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 border border-gray-700/30 rounded-xl overflow-hidden">
                      {/* Team Header - Clickable */}
                      <div
                        className="p-6 cursor-pointer hover:bg-gray-800/20 transition-colors"
                        onClick={() => setExpandedTeam(expandedTeam === participant.id ? null : participant.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <FranchiseLogo
                              franchiseCode={participant.team_short_name || ''}
                              size="lg"
                            />
                            <div>
                              <h3 className="text-xl font-bold text-white">
                                {participant.team_short_name || 'Unknown Team'}
                              </h3>
                              <p className="text-gray-400">
                                {(() => {
                                  const participantProfile = participantProfiles[participant.user_id];
                                  if (participant.user_id === user?.id) {
                                    return userProfile?.full_name || user?.user_metadata?.full_name || 'You';
                                  } else if (participantProfile?.full_name) {
                                    return participantProfile.full_name;
                                  } else {
                                    return `Manager ${participant.user_id.slice(0, 8)}...`;
                                  }
                                })()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            {/* Team Stats */}
                            <div className="text-right">
                              <div className="text-sm text-gray-400">Players</div>
                              <div className="text-lg font-bold text-white">
                                {playersBought.length}<span className="text-sm text-gray-400">/{room.players_per_team}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-400">Total Spent</div>
                              <div className="text-lg font-bold text-red-400">
                                {formatCurrency(totalSpent)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-400">Remaining</div>
                              <div className="text-lg font-bold text-green-400">
                                {formatCurrency(participant.budget_remaining)}
                              </div>
                            </div>

                            {/* Expand Arrow */}
                            <ChevronDown
                              className={`w-5 h-5 text-gray-400 transition-transform ${
                                expandedTeam === participant.id ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {/* Budget Progress Bar */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-400">Budget Utilization</span>
                            <span className="text-xs font-medium text-gray-300">{budgetUsed}%</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                parseFloat(budgetUsed) > 80 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                                parseFloat(budgetUsed) > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                                'bg-gradient-to-r from-green-500 to-emerald-500'
                              }`}
                              style={{ width: `${Math.min(parseFloat(budgetUsed), 100)}%` }}
                            ></div>
                        </div>
                        </div>
                      </div>

                      {/* Expanded Player List */}
                      {expandedTeam === participant.id && (
                        <div className="px-6 pb-6 border-t border-gray-700/50">
                          <div className="pt-4">
                            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Squad Details ({playersBought.length} players)
                            </h4>

                            {playersBought.length > 0 ? (
                              <div className="grid gap-3">
                                {playersBought
                                  .sort((a, b) => (b.final_price || 0) - (a.final_price || 0)) // Sort by price descending
                                  .map((player) => (
                                    <div key={player.id} className="bg-gray-800/40 border border-gray-600/30 rounded-lg p-4 hover:bg-gray-800/60 transition-colors">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                            <span className="text-white font-bold text-sm">
                                              {player.name.charAt(0).toUpperCase()}
                                            </span>
                                          </div>
                                          <div>
                                            <div className="font-semibold text-white">{player.name}</div>
                                            <div className="flex items-center gap-2 text-sm">
                                              <span className="role-badge bg-blue-500/20 text-blue-400 border-blue-500/30">
                                                {player.role}
                                              </span>
                                              {player.purchased_at && (
                                                <span className="text-gray-400">
                                                  • {new Date(player.purchased_at).toLocaleDateString()}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-lg font-bold text-yellow-400">
                                            {formatCurrency(player.final_price || 0)}
                                          </div>
                                          <div className="text-xs text-gray-400">Purchase Price</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                            ) : (
                              <div className="text-center py-8 bg-gray-800/20 rounded-lg border border-gray-600/20">
                                <div className="text-gray-400 mb-2">🏏</div>
                                <p className="text-gray-400">No players purchased</p>
                              </div>
                            )}

                            {/* Squad Summary */}
                            {playersBought.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-600/30">
                                <div className="grid grid-3 gap-4 text-center">
                                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                                    <div className="text-lg font-bold text-blue-400">{playersBought.length}</div>
                                    <div className="text-xs text-blue-300">Players Bought</div>
                                  </div>
                                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <div className="text-lg font-bold text-red-400">{formatCurrency(totalSpent)}</div>
                                    <div className="text-xs text-red-300">Total Investment</div>
                                  </div>
                                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                    <div className="text-lg font-bold text-green-400">
                                      {formatCurrency(totalSpent / playersBought.length)}
                                    </div>
                                    <div className="text-xs text-green-300">Avg. Player Cost</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-500" />
                </div>
                <h4 className="text-lg font-medium text-gray-300 mb-2">No participants found</h4>
                <p className="text-sm text-gray-500">No teams participated in this auction</p>
              </div>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="btn btn-primary btn-lg"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  // For brevity, I'm showing the basic structure - the full component would include all the auction functionality
  return (
    <div>
      {/* Sale Notification - Slide in from right */}
      {saleNotification.isVisible && (
        <div className={`fixed top-20 right-4 z-50 transition-all duration-500 transform ${
          saleNotification.isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}>
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-green-500/50 rounded-xl shadow-2xl p-4 min-w-[280px] max-w-[320px] backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white mb-1">
                    Player Sold!
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-300">
                      <span className="font-bold text-blue-400">{saleNotification.playerName}</span>
                    </p>
                    <p className="text-sm text-gray-300">
                      sold to <span className="font-bold text-purple-400">{saleNotification.teamName}</span>
                    </p>
                    <p className="text-sm text-gray-300">
                      for <span className="font-bold text-green-400 text-base">₹{(saleNotification.soldAmount / 100).toFixed(2)}Cr</span>
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSaleNotification(prev => ({ ...prev, isVisible: false }))}
                className="flex-shrink-0 ml-2 text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded-full"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress bar for auto-dismiss */}
            <div className="mt-3">
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-1 rounded-full transition-all duration-7000 ease-linear"
                  style={{
                    width: saleNotification.isVisible ? '0%' : '100%',
                    animation: saleNotification.isVisible ? 'progressShrink 7s linear forwards' : 'none'
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="nav">
        <div className="container">
          <div className="nav-content">
            <a href="/dashboard" className="nav-brand">
              <Trophy className="w-6 h-6" />
              <span>CrickRush</span>
            </a>

            <div className="nav-actions">
              <div className={`profile-dropdown ${showProfileDropdown ? 'open' : ''}`}>
                <button
                  className="profile-trigger"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                >
                  <img
                    src={userProfile?.avatar_url || user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                    alt="Profile"
                    className="user-avatar"
                  />
                  <ChevronDown className="w-4 h-4 chevron-icon" />
                </button>

                {showProfileDropdown && (
                  <div className="profile-dropdown-menu">
                    <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                      <User className="w-4 h-4" />
                      <div>
                        <div className="font-semibold text-sm">
                          {userProfile?.full_name || user?.user_metadata?.full_name || 'User'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                          {user?.email}
                        </div>
                      </div>
                    </div>

                    <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />

                    <button
                      className="profile-dropdown-item"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        router.push('/profile');
                      }}
                    >
                      <User className="w-4 h-4 mr-2" />
                      Profile Settings
                    </button>

                    <button
                      className="profile-dropdown-item danger"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        signOut();
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Close dropdown when clicking outside */}
      {showProfileDropdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
          }}
          onClick={() => setShowProfileDropdown(false)}
        />
      )}


      {/* Main Content */}
      <main className="container section">
        {/* Auction Header */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">{room.name}</h1>
              <p style={{ color: 'var(--text-muted)' }}>
                Room Code: <span className="font-mono font-bold">{room.room_key}</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{participants.length}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Teams</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatCurrency(room.budget_per_team)}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Budget</div>
              </div>
              {isAuctioneer && (
                <Crown className="w-6 h-6" style={{ color: 'var(--accent-yellow)' }} />
              )}
            </div>
          </div>

          {/* Auction Status */}
          <div className="flex items-center gap-4">
            <div className={`status-badge ${auctionState?.is_active ? 'success' : 'default'}`}>
              {auctionState?.is_active ? (auctionState.is_paused ? 'Paused' : 'Live') : 'Waiting'}
            </div>
            {auctionState?.is_active && (
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4" />
                <span className={`font-mono font-bold text-lg ${timeRemaining <= 10 ? 'text-red-400' : timeRemaining <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Current Player and Player Queue Row */}
          <div className="grid grid-3 gap-6">
            {/* Current Player Card */}
            <div className="col-span-2">
              <div className="card flex flex-col" style={{ height: '600px' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold">Current Player</h2>
                </div>

                {auctionState?.current_player ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Player Info Card - Better Proportioned */}
                    <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-xl p-6 mb-6">
                      <div className="grid grid-2 gap-8 items-start">
                        {/* Player Details */}
                        <div>
                          <div className="text-3xl font-bold text-white mb-4">
                            {auctionState.current_player.name}
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-gray-400">Role:</span>
                              <span className="text-sm bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-full border border-blue-500/30 font-medium">
                                {auctionState.current_player.type || auctionState.current_player.role}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-gray-400">Country:</span>
                              <span className="text-base font-medium text-white">{auctionState.current_player.nationality || auctionState.current_player.country}</span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-gray-400">Base Price:</span>
                              <span className="text-base font-bold text-yellow-400">{formatCurrency(auctionState.current_player.base_price)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Current Bid Display */}
                        <div className="text-center bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-6">
                          <div className="text-base font-medium mb-3" style={{ color: 'var(--text-muted)' }}>Current Bid</div>
                          <div className="text-4xl font-bold mb-3" style={{ color: 'var(--accent-green)' }}>
                            {formatCurrency(auctionState.current_bid || auctionState.current_player.base_price)}
                          </div>
                          {auctionState.leading_team && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '8px 16px', backgroundColor: 'rgba(34, 197, 94, 0.2)', color: 'rgb(74, 222, 128)', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: '500', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                              <Crown className="w-4 h-4" />
                              {participants.find(p => p.team_id === auctionState.leading_team)?.team_short_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Auctioneer Controls - Separate Card */}
                    {isAuctioneer && (
                      <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Crown className="w-5 h-5 text-yellow-400" />
                          <h3 className="text-lg font-bold text-yellow-400">Auctioneer Controls</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {!auctionState?.is_active ? (
                            <button
                              onClick={startAuction}
                              className="btn btn-success py-3 px-4 text-sm col-span-2"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Start Auction
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={auctionState.is_paused ? resumeAuction : pauseAuction}
                                className={`btn ${auctionState.is_paused ? 'btn-success' : 'btn-warning'} py-3 px-4 text-sm`}
                              >
                                {auctionState.is_paused ? (
                                  <>
                                    <Play className="w-4 h-4 mr-2" />
                                    Resume
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-4 h-4 mr-2" />
                                    Pause
                                  </>
                                )}
                              </button>

                              <button
                                onClick={moveToNextPlayer}
                                className="btn btn-primary py-3 px-4 text-sm"
                              >
                                <SkipForward className="w-4 h-4 mr-2" />
                                Next Player
                              </button>

                              <button
                                onClick={() => addTime(15)}
                                className="btn btn-secondary py-3 px-4 text-sm"
                              >
                                <Timer className="w-4 h-4 mr-2" />
                                Add 15s
                              </button>

                              <button
                                onClick={sellPlayer}
                                className="btn btn-success py-3 px-4 text-sm"
                              >
                                <Trophy className="w-4 h-4 mr-2" />
                                Sell Player
                              </button>
                            </>
                          )}
                        </div>

                        {auctionState?.is_active && (
                          <button
                            onClick={endAuction}
                            className="btn btn-danger py-3 px-4 text-sm w-full mt-3"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            End Auction
                          </button>
                        )}
                      </div>
                    )}

                    {/* Quick Bidding Section - Full Width Container */}
                    <div className="flex-shrink-0">
                      {/* Bidding Controls */}
                      {myParticipant && auctionState.is_active && !auctionState.is_paused && timeRemaining > 0 && isRunning && (
                        <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/60 border border-gray-700/40 rounded-xl p-6 space-y-4">
                          {/* Quick Bidding Header */}
                          <div className="text-center">
                            <h3 className="text-xl font-bold text-blue-400 mb-2">Quick Bidding</h3>
                            <p className="text-sm text-gray-400">
                              Tap any amount to add to current bid • Budget: <span className="text-green-400 font-semibold">{formatCurrency(myParticipant.budget_remaining)}</span>
                            </p>
                          </div>

                          {/* Quick Bid Buttons - Full Width Grid */}
                          <div className="grid grid-cols-4 gap-3">
                            <button
                              onClick={() => handleQuickBidAmount(25)}
                              disabled={
                                (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) ||
                                (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id) ||
                                (auctionState.current_bid || auctionState.current_player.base_price || 0) + 25 > myParticipant.budget_remaining
                              }
                              className="relative overflow-hidden font-bold py-4 px-3 rounded-xl text-white transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{
                                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                                minHeight: '60px',
                                fontSize: '16px'
                              }}
                            >
                              +₹25L
                            </button>
                            <button
                              onClick={() => handleQuickBidAmount(50)}
                              disabled={
                                (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) ||
                                (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id) ||
                                (auctionState.current_bid || auctionState.current_player.base_price || 0) + 50 > myParticipant.budget_remaining
                              }
                              className="relative overflow-hidden font-bold py-4 px-3 rounded-xl text-white transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                minHeight: '60px',
                                fontSize: '16px'
                              }}
                            >
                              +₹50L
                            </button>
                            <button
                              onClick={() => handleQuickBidAmount(75)}
                              disabled={
                                (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) ||
                                (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id) ||
                                (auctionState.current_bid || auctionState.current_player.base_price || 0) + 75 > myParticipant.budget_remaining
                              }
                              className="relative overflow-hidden font-bold py-4 px-3 rounded-xl text-white transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                minHeight: '60px',
                                fontSize: '16px'
                              }}
                            >
                              +₹75L
                            </button>
                            <button
                              onClick={() => handleQuickBidAmount(100)}
                              disabled={
                                (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) ||
                                (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id) ||
                                (auctionState.current_bid || auctionState.current_player.base_price || 0) + 100 > myParticipant.budget_remaining
                              }
                              className="relative overflow-hidden font-bold py-4 px-3 rounded-xl text-white transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                minHeight: '60px',
                                fontSize: '16px'
                              }}
                            >
                              +₹1Cr
                            </button>
                          </div>

                          {/* Status Messages */}
                          {(() => {
                            const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
                              player => player.sold_to_participant === myParticipant.id
                            );

                            // Check if squad is full first
                            if (myPurchasedPlayers.length >= room.players_per_team) {
                              return (
                                <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-3">
                                  <div className="text-center flex items-center justify-center gap-2">
                                    <span className="text-green-400">🏆</span>
                                    <p className="text-sm font-medium text-green-400">
                                      Squad Complete! You have {room.players_per_team} players - maximum reached
                                    </p>
                                  </div>
                                </div>
                              );
                            }

                            // Then check cooldown
                            if (lastBiddingTeam === myParticipant.team_id && bidCooldownTime > 0) {
                              return (
                                <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-lg p-3">
                                  <div className="text-center flex items-center justify-center gap-2">
                                    <span className="text-yellow-400">⏱️</span>
                                    <p className="text-sm font-medium text-yellow-400">
                                      Wait {bidCooldownTime}s before bidding again, or let another team bid first
                                    </p>
                                  </div>
                                </div>
                              );
                            }

                            // Then check if leading
                            if (lastBiddingTeam === myParticipant.team_id && auctionState.leading_team === myParticipant.team_id && bidCooldownTime === 0) {
                              return (
                                <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg p-3">
                                  <div className="text-center flex items-center justify-center gap-2">
                                    <span className="text-blue-400">🏆</span>
                                    <p className="text-sm font-medium text-blue-400">
                                      You're leading! Another team must bid before you can bid again
                                    </p>
                                  </div>
                                </div>
                              );
                            }

                            return null;
                          })()}
                        </div>
                      )}

                      {/* Show message when bidding is not available */}
                      {myParticipant && auctionState.is_active && (timeRemaining <= 0 || !isRunning || auctionState.is_paused) && (
                        <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl p-6">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <span className="text-red-400 text-xl">⏸️</span>
                              <h3 className="text-lg font-bold text-red-400">Bidding Not Available</h3>
                            </div>
                            <p className="text-sm text-gray-400">
                              {auctionState.is_paused ? 'Auction is paused by auctioneer' :
                               timeRemaining <= 0 ? 'Timer has run out - waiting for next player' :
                               'Timer is not running'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 flex-1 flex flex-col justify-center">
                    <div className="feature-icon mb-4" style={{ background: 'var(--bg-glass)', width: '4rem', height: '4rem', margin: '0 auto' }}>
                      <Trophy className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No Player Selected</h3>
                    <p style={{ color: 'var(--text-muted)' }}>
                      {isAuctioneer ? 'Start the auction to begin bidding' : 'Waiting for auction to begin'}
                    </p>
                    {isAuctioneer && !auctionState?.is_active && (
                      <button
                        onClick={startAuction}
                        className="btn btn-primary mt-4"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Auction
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Player Queue - ONLY FOR AUCTIONEER (Same height as current player) */}
            {isAuctioneer && (
              <div className="card flex flex-col" style={{ height: '600px' }}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 flex-shrink-0">
                  <Crown className="w-5 h-5 text-yellow-400" />
                  Player Queue ({(auctionState?.current_player_index || 0) + 1}/{auctionState?.total_players || 0})
                </h3>
                <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(600px - 80px)' }}>
                  <div className="space-y-2 pr-2">
                    {/* Completely live player queue - fixed persistence and updates */}
                    {(() => {
                      // Show appropriate message ONLY when auction hasn't started yet
                      if (!auctionState?.is_active) {
                        return (
                          <div className="text-center py-6 h-full flex flex-col justify-center">
                            <div className="text-3xl mb-3">🏏</div>
                            <div className="text-sm text-gray-400 mb-2">
                              Start the auction to initialize the player queue
                            </div>
                            <p className="text-xs text-gray-500">
                              Click "Start Auction" to begin and load players
                            </p>
                          </div>
                        );
                      }

                      // Priority 1: Use auction state queue if available
                      let playersToShow = auctionState?.player_queue;
                      let sourceLabel = "auction state";

                      // Priority 2: Fall back to usePlayerQueue if auction state queue is missing
                      if (!playersToShow || !Array.isArray(playersToShow) || playersToShow.length === 0) {
                        playersToShow = queuePlayers;
                        sourceLabel = "usePlayerQueue";
                      }

                      // If we have players from either source, show them
                      if (playersToShow && Array.isArray(playersToShow) && playersToShow.length > 0) {
                        const currentIndex = auctionState?.current_player_index || 0;

                        // Show all players in a compact, elegant list
                        return playersToShow.map((player, index) => {
                          const isCurrent = index === currentIndex;
                          const isNext = index === currentIndex + 1;
                          const isPast = index < currentIndex;

                          // Compact price formatting
                          const formatBasePrice = (price) => {
                            if (!price || price === 0) return '₹0L';
                            const numPrice = Number(price);
                            if (isNaN(numPrice)) return '₹0L';
                            
                            if (numPrice >= 100) {
                              const crores = numPrice / 100;
                              return crores % 1 === 0 ? `₹${crores}Cr` : `₹${crores.toFixed(1)}Cr`;
                            }
                            return numPrice % 1 === 0 ? `₹${numPrice}L` : `₹${numPrice.toFixed(1)}L`;
                          };

                          return (
                            <div
                              key={`${player.id}-${index}`}
                              className={`p-2 rounded-lg border transition-all duration-200 ${
                                isCurrent 
                                  ? 'bg-green-500/15 border-green-500/40 shadow-sm' 
                                  : isNext 
                                    ? 'bg-blue-500/10 border-blue-500/30' 
                                    : isPast 
                                      ? 'bg-gray-500/5 border-gray-500/20 opacity-60' 
                                      : 'bg-gray-800/20 border-gray-700/30 hover:bg-gray-800/30'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${
                                  isCurrent 
                                    ? 'bg-green-500 text-white border-green-400' 
                                    : isNext 
                                      ? 'bg-blue-500 text-white border-blue-400' 
                                      : isPast 
                                        ? 'bg-gray-500 text-white border-gray-400' 
                                        : 'bg-gray-700 text-gray-300 border-gray-600'
                                }`}>
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`font-medium text-xs truncate ${
                                    isCurrent ? 'text-green-400' : isNext ? 'text-blue-400' : isPast ? 'text-gray-500' : 'text-gray-300'
                                  }`}>
                                    {player.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                                      isCurrent ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                      isNext ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' :
                                      'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                    }`}>
                                      {player.type || player.role || 'ALL'}
                                    </span>
                                    <span className="text-xs text-gray-500">•</span>
                                    <span className={`text-xs font-medium ${
                                      isCurrent ? 'text-yellow-300' : isNext ? 'text-yellow-400' : 'text-yellow-500'
                                    }`}>
                                      {formatBasePrice(player.base_price)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  {isCurrent && (
                                    <div className="text-xs font-medium text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded border border-green-500/30">
                                      LIVE
                                    </div>
                                  )}
                                  {isNext && (
                                    <div className="text-xs font-medium text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded border border-blue-500/30">
                                      NEXT
                                    </div>
                                  )}
                                  {isPast && (
                                    <div className="text-xs text-gray-500 bg-gray-500/15 px-1.5 py-0.5 rounded border border-gray-500/30">
                                      DONE
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      }

                      // Show loading message if we're waiting for data
                      return (
                        <div className="text-center py-6 h-full flex flex-col justify-center">
                          <div className="text-3xl mb-3">🎯</div>
                          <div className="text-sm text-gray-400 mb-2">
                            Player queue will appear here
                          </div>
                          <p className="text-xs text-gray-500">
                            Queue updates automatically during auction
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* My Squad - FOR PARTICIPANTS (Same height as current player) */}
            {!isAuctioneer && myParticipant && (
              <div className="card flex flex-col" style={{ height: '600px' }}>
                {/* Fixed Header */}
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 flex-shrink-0">
                  <FranchiseLogo franchiseCode={myParticipant.team_short_name || ''} size="sm" />
                  My Squad ({(() => {
                    const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
                      player => player.sold_to_participant === myParticipant.id
                    );
                    return myPurchasedPlayers.length;
                  })()} players)
                </h3>

                {(() => {
                  const myPurchasedPlayers = (auctionState?.sold_players || []).filter(
                    player => player.sold_to_participant === myParticipant.id
                  );

                  if (myPurchasedPlayers.length > 0) {
                    return (
                      <>
                        {/* Scrollable Player List */}
                        <div className="flex-1 overflow-y-auto min-h-0 mb-4">
                          <div className="space-y-2 pr-2">
                            {myPurchasedPlayers.map((playerData) => (
                              <div key={playerData.id} className="bg-gradient-to-r from-gray-800/40 to-gray-900/40 border border-gray-700/40 rounded-lg p-3 hover:bg-gray-800/60 transition-colors">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                                      <span className="text-white font-bold text-xs">
                                        {playerData.name.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-sm text-white truncate">{playerData.name}</div>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="role-badge bg-blue-500/20 text-blue-400 border-blue-500/30">
                                          {playerData.role}
                                        </span>
                                        <span className="text-gray-400 truncate">
                                          {formatCurrency(playerData.final_price)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-2">
                                    <div className="text-sm font-bold text-green-400">
                                      {formatCurrency(playerData.final_price)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Fixed Footer with Budget Summary */}
                        <div className="flex-shrink-0 bg-gradient-to-r from-gray-800/20 to-gray-900/20 rounded-lg p-4 border-t border-gray-700/50">
                          <div className="text-center">
                            <div className="grid grid-2 gap-4 mb-3">
                              <div>
                                <div className="text-lg font-bold text-red-400">
                                  {formatCurrency(myPurchasedPlayers.reduce((sum, p) => sum + p.final_price, 0))}
                                </div>
                                <div className="text-xs text-gray-400">Total Spent</div>
                              </div>
                              <div>
                                <div className="text-lg font-bold text-green-400">
                                  {formatCurrency(myParticipant.budget_remaining)}
                                </div>
                                <div className="text-xs text-gray-400">Remaining</div>
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {myPurchasedPlayers.length} of {room.players_per_team} players bought
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  } else {
                    return (
                      <div className="flex-1 flex flex-col justify-center items-center text-center">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-4">
                          <div className="text-2xl">🏏</div>
                        </div>
                        <h4 className="text-lg font-medium text-gray-300 mb-2">No players yet</h4>
                        <p className="text-sm text-gray-500 max-w-48">
                          Start bidding to build your squad!
                        </p>

                        {/* Fixed Footer for Empty State */}
                        <div className="mt-6 bg-gradient-to-r from-gray-800/20 to-gray-900/20 rounded-lg p-4 w-full">
                          <div className="text-center">
                            <div className="text-lg font-bold text-green-400">
                              {formatCurrency(myParticipant.budget_remaining)}
                            </div>
                            <div className="text-xs text-gray-400">Available Budget</div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
          </div>

          {/* Participants Panel - FULL WIDTH FOR AUCTIONEER */}
          {isAuctioneer && (
            <div className="card">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Participants Overview</h3>
                  <p className="text-sm text-gray-400">{participants.length} teams joined • Total budget: {formatCurrency(room.budget_per_team * participants.length)}</p>
                </div>
              </div>

              {participants.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {participants.map((participant) => {
                    // Calculate players bought and total spent
                    const playersBought = (auctionState?.sold_players || []).filter(
                      player => player.sold_to_participant === participant.id
                    );
                    const totalSpent = playersBought.reduce((sum, player) => sum + (player.final_price || 0), 0);
                    const budgetUsed = ((totalSpent / room.budget_per_team) * 100).toFixed(1);

                    return (
                      <div key={participant.id} className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-6 hover:border-blue-500/40 transition-all duration-200">
                        {/* Team Header */}
                        <div className="flex items-center gap-4 mb-5">
                          <div className="relative">
                            <FranchiseLogo
                              franchiseCode={participant.team_short_name || ''}
                              size="md"
                            />
                            {auctionState?.leading_team === participant.team_id && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800 flex items-center justify-center">
                                <Crown className="w-2 h-2 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-bold text-white truncate">
                                {participant.team_short_name || 'Unknown Team'}
                              </h4>
                              {auctionState?.leading_team === participant.team_id && (
                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30 font-medium">
                                  LEADING
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-400">
                              {/* Show user name from profile or fallback to user ID */}
                              {(() => {
                                // Get participant name from loaded profiles
                                const participantProfile = participantProfiles[participant.user_id];
                                if (participant.user_id === user?.id) {
                                  return userProfile?.full_name || user?.user_metadata?.full_name || 'You';
                                } else if (participantProfile?.full_name) {
                                  return participantProfile.full_name;
                                } else {
                                  return `Manager ${participant.user_id.slice(0, 8)}...`;
                                }
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-2 gap-3 mb-5">
                          {/* Players Count */}
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-blue-400">PLAYERS</span>
                              <div className="text-right">
                                <div className="text-lg font-bold text-white">
                                  {playersBought.length}<span className="text-sm text-gray-400">/{room.players_per_team}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Budget Used */}
                          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-purple-400">BUDGET USED</span>
                              <div className="text-right">
                                <div className="text-lg font-bold text-white">{budgetUsed}%</div>
                              </div>
                            </div>
                          </div>

                          {/* Total Spent */}
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-red-400">SPENT</span>
                              <div className="text-right">
                                <div className="text-sm font-bold text-red-400">
                                  {formatCurrency(totalSpent)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Remaining Budget */}
                          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-green-400">REMAINING</span>
                              <div className="text-right">
                                <div className="text-sm font-bold text-green-400">
                                  {formatCurrency(participant.budget_remaining)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Budget Progress Bar */}
                        <div className="mb-6">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-400">Budget Progress</span>
                            <span className="text-xs font-medium text-gray-300">
                              {formatCurrency(totalSpent)} / {formatCurrency(room.budget_per_team)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${
                                parseFloat(budgetUsed) > 80 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                                parseFloat(budgetUsed) > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                                'bg-gradient-to-r from-green-500 to-emerald-500'
                              }`}
                              style={{ width: `${Math.min(parseFloat(budgetUsed), 100)}%` }}
                            ></div>
                        </div>
                        </div>

                        {/* Recent Purchase */}
                        {(() => {
                          const lastPurchase = playersBought[playersBought.length - 1];
                          if (lastPurchase) {
                            return (
                              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                  <span className="text-xs font-medium text-blue-400">LATEST PURCHASE</span>
                                </div>
                                <div className="text-sm font-medium text-white">
                                  {lastPurchase.name}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {lastPurchase.role} • {formatCurrency(lastPurchase.final_price)}
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div className="bg-gray-500/5 border border-gray-500/10 rounded-lg p-3 text-center">
                                <span className="text-xs text-gray-500">No purchases yet</span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-gray-500" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-300 mb-2">No participants yet</h4>
                  <p className="text-sm text-gray-500">
                    Share the room code <span className="font-mono bg-gray-800 px-2 py-1 rounded">{room.room_key}</span> with players to join
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bidding History */}
        {false && auctionState?.current_player && (
          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Timer className="w-5 h-5" />
              Bidding History - {auctionState.current_player.name}
            </h3>
            <BiddingHistory
              roomId={room.id}
              playerId={auctionState.current_player.id}
              participants={participants}
            />
          </div>
        )}
      </main>
    </div>
  );
}

