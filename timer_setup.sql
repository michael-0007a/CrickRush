-- Simple Timer Setup for Supabase
-- Run this in your Supabase SQL Editor

-- Create the auction_timer table
CREATE TABLE IF NOT EXISTS auction_timer (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL,
    time_remaining INTEGER NOT NULL DEFAULT 30,
    is_running BOOLEAN NOT NULL DEFAULT false,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    server_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(room_id)
);

-- Create the server time function
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
STABLE
AS $$
    SELECT NOW();
$$;

-- Create trigger function for auto-updating timestamps
CREATE OR REPLACE FUNCTION update_auction_timer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.server_time = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function to add 10 seconds when bid is placed
CREATE OR REPLACE FUNCTION add_time_on_bid()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new bid is placed (current_bid changes), add 10 seconds to timer
    IF TG_OP = 'UPDATE' AND OLD.current_bid IS DISTINCT FROM NEW.current_bid AND NEW.current_bid > 0 THEN
        -- Update the timer to add 10 seconds (only if auction is active and timer exists)
        UPDATE auction_timer
        SET
            time_remaining = GREATEST(time_remaining + 10, 10), -- Add 10 seconds, minimum 10
            is_running = true,
            last_updated = NOW(),
            server_time = NOW()
        WHERE
            room_id = NEW.room_id
            AND EXISTS (
                SELECT 1 FROM auction_rooms
                WHERE id = NEW.room_id AND status = 'active'
            )
            AND EXISTS (
                SELECT 1 FROM auction_state
                WHERE room_id = NEW.room_id AND is_active = true AND is_paused = false
            );

        -- Also ensure timer entry exists for the room
        INSERT INTO auction_timer (room_id, time_remaining, is_running, last_updated, server_time)
        SELECT NEW.room_id, 40, true, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM auction_timer WHERE room_id = NEW.room_id)
        AND EXISTS (
            SELECT 1 FROM auction_rooms
            WHERE id = NEW.room_id AND status = 'active'
        );

        RAISE LOG 'Added 10 seconds to timer for room %, new time: %', NEW.room_id,
            (SELECT time_remaining FROM auction_timer WHERE room_id = NEW.room_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the triggers
DROP TRIGGER IF EXISTS auction_timer_updated_at ON auction_timer;
CREATE TRIGGER auction_timer_updated_at
    BEFORE UPDATE ON auction_timer
    FOR EACH ROW
    EXECUTE FUNCTION update_auction_timer_updated_at();

DROP TRIGGER IF EXISTS add_time_on_bid_trigger ON auction_state;
CREATE TRIGGER add_time_on_bid_trigger
    AFTER UPDATE ON auction_state
    FOR EACH ROW
    EXECUTE FUNCTION add_time_on_bid();

-- Enable RLS (Row Level Security)
ALTER TABLE auction_timer ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view timer for rooms they participate in" ON auction_timer;
DROP POLICY IF EXISTS "Auctioneers can update timer for their rooms" ON auction_timer;

-- Create RLS policies
CREATE POLICY "Users can view timer for rooms they participate in" ON auction_timer
    FOR SELECT USING (
        room_id IN (
            SELECT auction_room_id FROM auction_participants
            WHERE user_id = auth.uid()
        )
        OR
        room_id IN (
            SELECT id FROM auction_rooms
            WHERE creator_id = auth.uid()
        )
    );

CREATE POLICY "Auctioneers can update timer for their rooms" ON auction_timer
    FOR ALL USING (
        room_id IN (
            SELECT id FROM auction_rooms
            WHERE creator_id = auth.uid()
        )
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_auction_timer_room_id ON auction_timer(room_id);
CREATE INDEX IF NOT EXISTS idx_auction_timer_updated_at ON auction_timer(updated_at);
