-- AI チャットの会話単位の設定と表示情報を保存する。
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 会話に属する利用者と AI の発言を時系列で保存する。
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 会話詳細で発言を効率よく取得できるよう、所属会話を索引化する。
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- 履歴一覧を最終更新日時の降順で効率よく取得できるよう索引化する。
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
