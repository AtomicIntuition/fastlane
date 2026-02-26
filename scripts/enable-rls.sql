-- Enable Row Level Security for FastLane tables.
-- Read policies are permissive for app reads; writes are expected through server-side service role.

-- Run in Supabase SQL Editor.

-- fastlane_users
ALTER TABLE fastlane_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastlane_users_public_read" ON fastlane_users;
CREATE POLICY "fastlane_users_public_read" ON fastlane_users FOR SELECT USING (true);

-- fastlane_sessions
ALTER TABLE fastlane_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastlane_sessions_public_read" ON fastlane_sessions;
CREATE POLICY "fastlane_sessions_public_read" ON fastlane_sessions FOR SELECT USING (true);

-- fastlane_checkins
ALTER TABLE fastlane_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastlane_checkins_public_read" ON fastlane_checkins;
CREATE POLICY "fastlane_checkins_public_read" ON fastlane_checkins FOR SELECT USING (true);

-- fastlane_subscriptions
ALTER TABLE fastlane_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastlane_subscriptions_public_read" ON fastlane_subscriptions;
CREATE POLICY "fastlane_subscriptions_public_read" ON fastlane_subscriptions FOR SELECT USING (true);

-- fastlane_webhook_events
ALTER TABLE fastlane_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fastlane_webhook_events_public_read" ON fastlane_webhook_events;
CREATE POLICY "fastlane_webhook_events_public_read" ON fastlane_webhook_events FOR SELECT USING (true);
