CREATE TABLE publication_assets (document_id TEXT NOT NULL REFERENCES knowledge_documents(id),version INTEGER NOT NULL,remote_id TEXT NOT NULL,PRIMARY KEY(document_id,version));
