-- Add new columns to marketplace_items for apps functionality
ALTER TABLE marketplace_items
ADD COLUMN is_default boolean NOT NULL DEFAULT false,
ADD COLUMN is_functional boolean NOT NULL DEFAULT false,
ADD COLUMN app_type varchar(30) NOT NULL DEFAULT 'installable',
ADD COLUMN features jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Create featureRequests table
CREATE TABLE feature_requests (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  app_id INTEGER REFERENCES marketplace_items(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for featureRequests
CREATE INDEX feature_requests_team_status_idx ON feature_requests(team_id, status);
CREATE INDEX feature_requests_app_id_idx ON feature_requests(app_id);
CREATE INDEX feature_requests_requested_by_idx ON feature_requests(requested_by);
CREATE INDEX feature_requests_category_idx ON feature_requests(category);
CREATE UNIQUE INDEX feature_requests_team_request_uidx ON feature_requests(team_id, requested_by, title);

-- Create featureRequestVotes table to track votes per user
CREATE TABLE feature_request_votes (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, user_id)
);

-- Create indexes for featureRequestVotes
CREATE INDEX feature_request_votes_request_id_idx ON feature_request_votes(request_id);
CREATE INDEX feature_request_votes_user_id_idx ON feature_request_votes(user_id);
